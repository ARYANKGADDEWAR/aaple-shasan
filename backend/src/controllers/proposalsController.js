// src/controllers/proposalsController.js
const { query, transaction } = require('../config/database');
const { cache } = require('../config/redis');
const logger = require('../config/logger');
const { classifyProposal, compileDossier } = require('../services/aiService');
const { sendNotification } = require('../services/notificationService');
const { emitToUser, emitToAdmins, emitToDept } = require('../utils/socketEmitter');
const { sendProposalSubmittedEmail, sendSanctionedEmail, sendRevisionRequestedEmail } = require('../services/emailService');

function generateRefNumber(dept) {
  const yr = new Date().getFullYear();
  const seq = String(Math.floor(Math.random() * 90000 + 10000));
  const map = { PWD:'PWD', NMC:'NMC', GramPanchayat:'GP', RevenueDeskTahsildar:'REV', SDMDesk:'SDM' };
  return `MH/${map[dept]||'GEN'}/${yr}-${String(yr+1).slice(2)}/${seq}`;
}

// ── Submit Proposal ────────────────────────────────────────────────────────
async function submitProposal(req, res) {
  const { title, description, region, ward, district, taluka, pincode, manual_dept } = req.body;

  // Daily limit check
  const todayCount = await query(
    `SELECT COUNT(*) FROM proposals
     WHERE submitted_by = $1 AND submitted_at >= CURRENT_DATE AND deleted_at IS NULL`,
    [req.user.id]
  );
  if (parseInt(todayCount.rows[0].count) >= 3) {
    return res.status(429).json({
      success: false,
      message: 'Daily proposal limit (3 per day) reached. Try again tomorrow.',
      code: 'DAILY_LIMIT',
    });
  }

  // Duplicate check (same title in last 30 days by same user)
  const dup = await query(
    `SELECT id FROM proposals
     WHERE submitted_by = $1 AND LOWER(title) = LOWER($2)
     AND submitted_at > NOW() - INTERVAL '30 days' AND deleted_at IS NULL`,
    [req.user.id, title.trim()]
  );
  if (dup.rows.length) {
    return res.status(409).json({
      success: false,
      message: 'You submitted a very similar proposal recently. Please wait 30 days.',
      code: 'DUPLICATE',
    });
  }

  // AI Classification
  let aiResult = { dept: manual_dept || 'PWD', confidence: 65, raw: {}, budget_estimate: null, summary: null };
  try {
    aiResult = await classifyProposal(title, description, region);
    if (manual_dept) aiResult.dept = manual_dept;
  } catch (err) {
    logger.warn('AI classification failed, using fallback', { error: err.message });
    if (manual_dept) aiResult.dept = manual_dept;
  }

  const refNumber = generateRefNumber(aiResult.dept);

  // Handle file attachments
  const attachmentUrls = req.processedFiles?.map(f => f.url) || [];

  const newProposal = await transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO proposals
        (ref_number, title, description, region, ward, district, taluka, pincode,
         detected_dept, ai_confidence, ai_classification_raw, ai_budget_estimate,
         ai_dossier_text, ai_processed_at, submitted_by, assigned_dept,
         attachment_urls, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),$14,$15,$16,'ai_routed')
       RETURNING *`,
      [
        refNumber, title.trim(), description.trim(), region.trim(),
        ward||null, district||null, taluka||null, pincode||null,
        aiResult.dept, aiResult.confidence,
        JSON.stringify(aiResult.raw || {}),
        aiResult.budget_estimate, aiResult.summary,
        req.user.id, aiResult.dept,
        JSON.stringify(attachmentUrls),
      ]
    );
    return result.rows[0];
  });

  // Auto-upvote by submitter
  await query(
    'INSERT INTO votes (proposal_id, user_id, vote) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
    [newProposal.id, req.user.id, 'upvote']
  );

  // Notify dept admins
  await sendNotification(null, 'system', 'New Proposal Submitted',
    `"${title}" routed to ${aiResult.dept}.`,
    { proposalId: newProposal.id }, aiResult.dept
  );

  // Real-time: tell admins of this dept
  emitToDept(req, aiResult.dept, 'proposal:new', {
    id: newProposal.id, title: newProposal.title,
    dept: newProposal.assigned_dept, ref_number: newProposal.ref_number,
  });

  // Email confirmation
  if (req.user.email) {
    sendProposalSubmittedEmail(req.user.email, req.user.full_name, newProposal).catch(() => {});
  }

  await cache.del('proposals:public:list');

  logger.info('Proposal submitted', { proposalId: newProposal.id, userId: req.user.id, dept: aiResult.dept });

  res.status(201).json({
    success: true,
    message: `Proposal submitted and AI-routed to ${aiResult.dept}.`,
    data: {
      proposal: {
        id: newProposal.id,
        ref_number: newProposal.ref_number,
        title: newProposal.title,
        detected_dept: newProposal.detected_dept,
        ai_confidence: newProposal.ai_confidence,
        status: newProposal.status,
        submitted_at: newProposal.submitted_at,
        upvote_count: 1,
        downvote_count: 0,
      },
      ai_classification: aiResult.raw || {},
    },
  });
}

// ── Public Feed ────────────────────────────────────────────────────────────
async function getProposals(req, res) {
  const {
    page = 1, limit = 20, dept, status, sort = 'recent',
    search, district, threshold_met,
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const params = [];
  const conditions = ['p.deleted_at IS NULL'];

  if (dept)          { params.push(dept);         conditions.push(`p.assigned_dept = $${params.length}`); }
  if (status)        { params.push(status);        conditions.push(`p.status = $${params.length}`); }
  if (district)      { params.push(`%${district}%`); conditions.push(`p.district ILIKE $${params.length}`); }
  if (threshold_met === 'true') conditions.push('p.threshold_met = TRUE');
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(p.title ILIKE $${params.length} OR p.description ILIKE $${params.length} OR p.region ILIKE $${params.length})`);
  }

  const where = conditions.join(' AND ');
  const orderBy =
    sort === 'popular'  ? 'p.upvote_count DESC, p.created_at DESC' :
    sort === 'approval' ? '(p.upvote_count::float / NULLIF(p.upvote_count + p.downvote_count, 0)) DESC NULLS LAST' :
    'p.created_at DESC';

  // userId for user_vote join
  const userId = req.user?.id || null;
  params.push(userId, parseInt(limit), offset);

  const [proposalsRes, countRes] = await Promise.all([
    query(
      `SELECT p.id, p.ref_number, p.title, p.description, p.region, p.ward, p.district,
              p.assigned_dept, p.ai_confidence, p.upvote_count, p.downvote_count,
              p.vote_threshold, p.threshold_met, p.status, p.submitted_at, p.created_at,
              p.attachment_urls, p.ai_budget_estimate,
              u.full_name AS author_name,
              ROUND(p.upvote_count::numeric / NULLIF(p.upvote_count + p.downvote_count, 0) * 100, 1) AS approval_pct,
              uv.vote AS user_vote
       FROM proposals p
       JOIN users u ON u.id = p.submitted_by
       LEFT JOIN votes uv ON uv.proposal_id = p.id AND uv.user_id = $${params.length - 2}
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    query(`SELECT COUNT(*) FROM proposals p WHERE ${where}`, params.slice(0, -3)),
  ]);

  res.json({
    success: true,
    data: {
      proposals: proposalsRes.rows,
      pagination: {
        total: parseInt(countRes.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)),
      },
    },
  });
}

// ── Single Proposal ────────────────────────────────────────────────────────
async function getProposal(req, res) {
  const { id } = req.params;
  const result = await query(
    `SELECT p.*,
            u.full_name AS author_name, u.ward_constituency AS author_ward,
            au.full_name AS assigned_admin_name,
            su.full_name AS sanctioned_by_name,
            ROUND(p.upvote_count::numeric / NULLIF(p.upvote_count + p.downvote_count, 0) * 100, 1) AS approval_pct,
            uv.vote AS user_vote
     FROM proposals p
     JOIN users u ON u.id = p.submitted_by
     LEFT JOIN users au ON au.id = p.assigned_admin
     LEFT JOIN users su ON su.id = p.sanctioned_by
     LEFT JOIN votes uv ON uv.proposal_id = p.id AND uv.user_id = $2
     WHERE p.id = $1 AND p.deleted_at IS NULL`,
    [id, req.user?.id || null]
  );

  if (!result.rows.length) {
    return res.status(404).json({ success: false, message: 'Proposal not found.' });
  }

  const critiques = await query(
    `SELECT v.critique_text, v.created_at, u.full_name AS reviewer
     FROM votes v JOIN users u ON u.id = v.user_id
     WHERE v.proposal_id = $1 AND v.vote = 'downvote' AND v.critique_text IS NOT NULL
     ORDER BY v.created_at DESC`,
    [id]
  );

  res.json({
    success: true,
    data: { proposal: { ...result.rows[0], critique_logs: critiques.rows } },
  });
}

// ── Vote ───────────────────────────────────────────────────────────────────
async function voteOnProposal(req, res) {
  const { id } = req.params;
  const { vote, critique_text } = req.body;

  if (vote === 'downvote' && (!critique_text || critique_text.trim().length < 20)) {
    return res.status(400).json({
      success: false,
      message: 'Constructive critique required for downvote (min 20 characters).',
      code: 'CRITIQUE_REQUIRED',
    });
  }

  const proposalRes = await query(
    'SELECT id, status, submitted_by, title FROM proposals WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  if (!proposalRes.rows.length) {
    return res.status(404).json({ success: false, message: 'Proposal not found.' });
  }

  const proposal = proposalRes.rows[0];

  if (['sanctioned', 'rejected', 'archived'].includes(proposal.status)) {
    return res.status(400).json({ success: false, message: 'Voting is closed for this proposal.' });
  }
  if (proposal.submitted_by === req.user.id) {
    return res.status(400).json({ success: false, message: 'You cannot vote on your own proposal.' });
  }

  // Upsert vote
  await query(
    `INSERT INTO votes (proposal_id, user_id, vote, critique_text)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (proposal_id, user_id)
     DO UPDATE SET vote = EXCLUDED.vote, critique_text = EXCLUDED.critique_text, updated_at = NOW()`,
    [id, req.user.id, vote, critique_text?.trim() || null]
  );

  // Fetch updated counts (trigger already ran)
  const updated = await query(
    'SELECT upvote_count, downvote_count, threshold_met, status FROM proposals WHERE id = $1',
    [id]
  );
  const p = updated.rows[0];
  const approvalPct = (p.upvote_count + p.downvote_count) > 0
    ? Math.round((p.upvote_count / (p.upvote_count + p.downvote_count)) * 100)
    : 0;

  // If threshold just met, notify submitter + admins
  if (p.threshold_met && p.status === 'dossier_compiled') {
    await sendNotification(
      proposal.submitted_by,
      'vote_milestone',
      '🎉 Voting threshold reached!',
      `"${proposal.title}" has enough community support and is now in admin review.`,
      { proposalId: id }
    );
    emitToUser(req, proposal.submitted_by, 'notification', {
      type: 'vote_milestone',
      title: '🎉 Voting threshold reached!',
      body: `"${proposal.title}" is now in admin review.`,
    });
    emitToAdmins(req, 'proposal:threshold', { id, title: proposal.title });
  }

  // Broadcast vote update to anyone watching
  const io = req.app?.get('io');
  if (io) {
    io.emit('proposal:vote_update', {
      proposalId: id,
      upvote_count: p.upvote_count,
      downvote_count: p.downvote_count,
      approval_pct: approvalPct,
      threshold_met: p.threshold_met,
    });
  }

  res.json({
    success: true,
    message: `${vote === 'upvote' ? 'Upvote' : 'Downvote'} registered.`,
    data: {
      upvote_count: p.upvote_count,
      downvote_count: p.downvote_count,
      threshold_met: p.threshold_met,
      approval_pct: approvalPct,
      user_vote: vote,
    },
  });
}

// ── Admin: Proposal List ───────────────────────────────────────────────────
async function getAdminProposals(req, res) {
  const { page = 1, limit = 20, status, dept: filterDept, search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const adminDept = req.user.dept;
  const conditions = ['p.deleted_at IS NULL'];
  const params = [];

  if (req.user.role !== 'superadmin') {
    params.push(adminDept);
    conditions.push(`p.assigned_dept = $${params.length}`);
  } else if (filterDept) {
    params.push(filterDept);
    conditions.push(`p.assigned_dept = $${params.length}`);
  }
  if (status) { params.push(status); conditions.push(`p.status = $${params.length}`); }
  if (search) { params.push(`%${search}%`); conditions.push(`(p.title ILIKE $${params.length} OR p.ref_number ILIKE $${params.length})`); }

  const where = conditions.join(' AND ');
  params.push(parseInt(limit), offset);

  const [result, countRes] = await Promise.all([
    query(
      `SELECT p.id, p.ref_number, p.title, p.region, p.assigned_dept, p.status,
              p.upvote_count, p.downvote_count, p.threshold_met, p.ai_confidence,
              p.ai_budget_estimate, p.submitted_at, p.sanctioned_at, p.project_code,
              u.full_name AS author_name,
              ROUND(p.upvote_count::numeric / NULLIF(p.upvote_count + p.downvote_count, 0) * 100, 1) AS approval_pct
       FROM proposals p JOIN users u ON u.id = p.submitted_by
       WHERE ${where}
       ORDER BY p.threshold_met DESC, p.upvote_count DESC, p.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    ),
    query(`SELECT COUNT(*) FROM proposals p WHERE ${where}`, params.slice(0, -2)),
  ]);

  res.json({
    success: true,
    data: {
      proposals: result.rows,
      pagination: {
        total: parseInt(countRes.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)),
      },
    },
  });
}

// ── Admin: Sanction ────────────────────────────────────────────────────────
async function sanctionProposal(req, res) {
  const { id } = req.params;
  const { sanction_note } = req.body;

  const proposalRes = await query(
    'SELECT p.*, u.email, u.full_name AS citizen_name FROM proposals p JOIN users u ON u.id = p.submitted_by WHERE p.id = $1 AND p.deleted_at IS NULL',
    [id]
  );
  if (!proposalRes.rows.length) {
    return res.status(404).json({ success: false, message: 'Proposal not found.' });
  }

  const proposal = proposalRes.rows[0];

  if (proposal.status === 'sanctioned') {
    return res.status(400).json({ success: false, message: 'Already sanctioned.' });
  }
  if (!['dossier_compiled', 'under_admin_review', 'ai_routed', 'revision_requested'].includes(proposal.status)) {
    return res.status(400).json({ success: false, message: `Cannot sanction a proposal in '${proposal.status}' state.` });
  }
  if (req.user.role !== 'superadmin' && req.user.dept !== proposal.assigned_dept) {
    return res.status(403).json({ success: false, message: 'You can only sanction proposals in your department.' });
  }

  const projectCode = `MH-PROJ-${new Date().getFullYear()}-${String(Date.now()).slice(-7)}`;
  const txRef = `DBT-${Date.now()}-${proposal.submitted_by.slice(0,8).toUpperCase()}`;

  await transaction(async (client) => {
    // Sanction proposal
    await client.query(
      `UPDATE proposals SET
         status = 'sanctioned', sanctioned_by = $1, sanctioned_at = NOW(),
         sanction_note = $2, project_code = $3, status_updated_at = NOW(), updated_at = NOW()
       WHERE id = $4`,
      [req.user.id, sanction_note||null, projectCode, id]
    );

    // Log admin action
    await client.query(
      'INSERT INTO admin_actions (admin_id, proposal_id, action, note, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, id, 'sanctioned', sanction_note||null, req.ip]
    );

    // DBT disbursement record
    await client.query(
      `INSERT INTO dbt_transactions (user_id, proposal_id, amount, transaction_ref, status)
       VALUES ($1, $2, 1000.00, $3, 'processing')`,
      [proposal.submitted_by, id, txRef]
    );

    // Credit wallet
    await client.query(
      `UPDATE users SET
         civic_royalty_balance = civic_royalty_balance + 1000,
         total_royalties_earned = total_royalties_earned + 1000,
         updated_at = NOW()
       WHERE id = $1`,
      [proposal.submitted_by]
    );
  });

  // Fetch updated balance for real-time push
  const balanceRes = await query('SELECT civic_royalty_balance FROM users WHERE id = $1', [proposal.submitted_by]);
  const newBalance = balanceRes.rows[0]?.civic_royalty_balance;

  // DB notification
  await sendNotification(
    proposal.submitted_by, 'sanction',
    '🏆 Your proposal was sanctioned!',
    `"${proposal.title}" is approved. ₹1,000 Civic Royalty credited via DBT.`,
    { proposalId: id, projectCode }
  );

  // Real-time notification to citizen
  emitToUser(req, proposal.submitted_by, 'notification', {
    type: 'sanction',
    title: '🏆 Your proposal was sanctioned!',
    body: `₹1,000 Civic Royalty has been credited to your wallet.`,
  });
  emitToUser(req, proposal.submitted_by, 'wallet:update', {
    new_balance: newBalance,
    amount: 1000,
  });

  // Email citizen
  if (proposal.email) {
    sendSanctionedEmail(proposal.email, proposal.citizen_name, proposal, projectCode).catch(() => {});
  }

  // Invalidate caches
  await Promise.all([
    cache.del(`proposal:${id}`),
    cache.del('proposals:public:list'),
  ]);

  logger.info('Proposal sanctioned', { proposalId: id, adminId: req.user.id, projectCode, txRef });

  res.json({
    success: true,
    message: 'Proposal sanctioned. ₹1,000 Civic Royalty credited to citizen.',
    data: { project_code: projectCode, dbt_ref: txRef, dbt_status: 'processing' },
  });
}

// ── Admin: Request Revision ────────────────────────────────────────────────
async function requestRevision(req, res) {
  const { id } = req.params;
  const { revision_note } = req.body;

  const proposalRes = await query(
    'SELECT p.*, u.email, u.full_name AS citizen_name FROM proposals p JOIN users u ON u.id = p.submitted_by WHERE p.id = $1 AND p.deleted_at IS NULL',
    [id]
  );
  if (!proposalRes.rows.length) {
    return res.status(404).json({ success: false, message: 'Proposal not found.' });
  }
  const proposal = proposalRes.rows[0];

  await transaction(async (client) => {
    await client.query(
      `UPDATE proposals SET status = 'revision_requested', status_updated_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );
    await client.query(
      'INSERT INTO admin_actions (admin_id, proposal_id, action, note, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, id, 'revision_requested', revision_note.trim(), req.ip]
    );
  });

  await sendNotification(
    proposal.submitted_by, 'proposal_update',
    '📝 Revision Requested',
    `Admin has requested changes to "${proposal.title}": ${revision_note}`,
    { proposalId: id }
  );
  emitToUser(req, proposal.submitted_by, 'notification', {
    type: 'proposal_update',
    title: '📝 Revision Requested',
    body: revision_note,
  });
  if (proposal.email) {
    sendRevisionRequestedEmail(proposal.email, proposal.citizen_name, proposal, revision_note).catch(() => {});
  }

  res.json({ success: true, message: 'Revision request sent to citizen.' });
}

// ── Admin: Reject ──────────────────────────────────────────────────────────
async function rejectProposal(req, res) {
  const { id } = req.params;
  const { rejection_reason } = req.body;

  const proposalRes = await query(
    'SELECT p.*, u.email, u.full_name AS citizen_name FROM proposals p JOIN users u ON u.id = p.submitted_by WHERE p.id = $1 AND p.deleted_at IS NULL',
    [id]
  );
  if (!proposalRes.rows.length) {
    return res.status(404).json({ success: false, message: 'Proposal not found.' });
  }
  const proposal = proposalRes.rows[0];

  if (proposal.status === 'sanctioned') {
    return res.status(400).json({ success: false, message: 'Cannot reject a sanctioned proposal.' });
  }

  await transaction(async (client) => {
    await client.query(
      `UPDATE proposals SET
         status = 'rejected', rejected_by = $1, rejected_at = NOW(),
         rejection_reason = $2, status_updated_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [req.user.id, rejection_reason.trim(), id]
    );
    await client.query(
      'INSERT INTO admin_actions (admin_id, proposal_id, action, note, ip_address) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, id, 'rejected', rejection_reason.trim(), req.ip]
    );
  });

  await sendNotification(
    proposal.submitted_by, 'proposal_update',
    'Proposal Not Approved',
    `"${proposal.title}" was not approved. Reason: ${rejection_reason}`,
    { proposalId: id }
  );
  emitToUser(req, proposal.submitted_by, 'notification', {
    type: 'proposal_update',
    title: 'Proposal Not Approved',
    body: rejection_reason,
  });

  res.json({ success: true, message: 'Proposal rejected and citizen notified.' });
}

// ── My Proposals ───────────────────────────────────────────────────────────
async function getMyProposals(req, res) {
  const { page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const [result, countRes] = await Promise.all([
    query(
      `SELECT p.*,
              ROUND(p.upvote_count::numeric / NULLIF(p.upvote_count + p.downvote_count, 0) * 100, 1) AS approval_pct
       FROM proposals p
       WHERE p.submitted_by = $1 AND p.deleted_at IS NULL
       ORDER BY p.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, parseInt(limit), offset]
    ),
    query(
      'SELECT COUNT(*) FROM proposals WHERE submitted_by = $1 AND deleted_at IS NULL',
      [req.user.id]
    ),
  ]);

  res.json({
    success: true,
    data: {
      proposals: result.rows,
      pagination: {
        total: parseInt(countRes.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(parseInt(countRes.rows[0].count) / parseInt(limit)),
      },
    },
  });
}

// ── Dashboard Stats ────────────────────────────────────────────────────────
async function getDashboardStats(req, res) {
  const cacheKey = `dashboard:${req.user.role}:${req.user.id}`;
  const cached = await cache.get(cacheKey);
  if (cached) return res.json({ success: true, data: cached });

  if (req.user.role === 'citizen') {
    const [myProposals, myVotes, wallet, unread] = await Promise.all([
      query(`SELECT status, COUNT(*) FROM proposals WHERE submitted_by = $1 AND deleted_at IS NULL GROUP BY status`, [req.user.id]),
      query(`SELECT COUNT(*) FROM votes WHERE user_id = $1`, [req.user.id]),
      query(`SELECT civic_royalty_balance, total_royalties_earned FROM users WHERE id = $1`, [req.user.id]),
      query(`SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = FALSE`, [req.user.id]),
    ]);
    const data = {
      my_proposals_by_status: myProposals.rows,
      total_votes_cast: parseInt(myVotes.rows[0].count),
      wallet: wallet.rows[0],
      unread_notifications: parseInt(unread.rows[0].count),
    };
    await cache.set(cacheKey, data, 60);
    return res.json({ success: true, data });
  }

  // Admin
  const dept = req.user.role === 'superadmin' ? null : req.user.dept;
  const df = dept ? `AND assigned_dept = '${dept}'` : '';
  const [byStatus, byDept, recentSanctions, total] = await Promise.all([
    query(`SELECT status, COUNT(*) FROM proposals WHERE deleted_at IS NULL ${df} GROUP BY status`),
    query(`SELECT assigned_dept, COUNT(*), AVG(ai_confidence)::numeric(5,1) AS avg_confidence FROM proposals WHERE deleted_at IS NULL GROUP BY assigned_dept`),
    query(`SELECT p.title, p.ref_number, p.sanctioned_at, u.full_name FROM proposals p JOIN users u ON u.id = p.submitted_by WHERE p.status = 'sanctioned' ${df} ORDER BY p.sanctioned_at DESC LIMIT 5`),
    query(`SELECT COUNT(*) FROM proposals WHERE deleted_at IS NULL ${df}`),
  ]);
  const data = {
    by_status: byStatus.rows,
    by_dept: byDept.rows,
    recent_sanctions: recentSanctions.rows,
    total_proposals: parseInt(total.rows[0].count),
  };
  await cache.set(cacheKey, data, 120);
  res.json({ success: true, data });
}

module.exports = {
  submitProposal, getProposals, getProposal, voteOnProposal,
  getAdminProposals, sanctionProposal, requestRevision, rejectProposal,
  getMyProposals, getDashboardStats,
};
