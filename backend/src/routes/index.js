// src/routes/index.js — Complete API Router with validation
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const proposalsController = require('../controllers/proposalsController');
const { authenticate, authorize, requireAadhaar, optionalAuth } = require('../middleware/auth');
const {
  authRateLimiter, otpRateLimiter, submissionRateLimiter, sanitizeInput,
} = require('../middleware/security');
const { validate, authSchemas, proposalSchemas, adminSchemas } = require('../middleware/validation');
const { upload, processUpload, handleMulterError } = require('../middleware/upload');
const { getNotifications, markAsRead, markAllAsRead } = require('../services/notificationService');
const { query } = require('../config/database');
const { cache } = require('../config/redis');

// ── Health ─────────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  try {
    const { healthCheck } = require('../config/database');
    const db = await healthCheck();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      db: db.time,
      version: '1.0.0',
      service: 'Aaple Shasan API',
    });
  } catch {
    res.status(503).json({ status: 'error', message: 'Database unavailable' });
  }
});

// ── Auth Routes ────────────────────────────────────────────────────────────
const auth = express.Router();
auth.use(sanitizeInput);

auth.post('/register/otp',
  otpRateLimiter,
  validate({ body: authSchemas.requestOTP }),
  authController.requestRegistrationOTP
);
auth.post('/register/verify',
  authRateLimiter,
  validate({ body: authSchemas.verifyOTP }),
  authController.verifyRegistrationOTP
);
auth.post('/login/otp',
  otpRateLimiter,
  validate({ body: authSchemas.requestOTP }),
  authController.requestLoginOTP
);
auth.post('/login/verify',
  authRateLimiter,
  validate({ body: authSchemas.verifyOTP }),
  authController.verifyLoginOTP
);
auth.post('/login/password',
  authRateLimiter,
  validate({ body: authSchemas.login }),
  authController.loginWithPassword
);
auth.post('/refresh', authController.refreshAccessToken);
auth.post('/logout', authenticate, authController.logout);
auth.get('/me', authenticate, authController.getMe);
auth.post('/aadhaar/verify',
  authenticate,
  validate({ body: authSchemas.verifyAadhaar }),
  authController.verifyAadhaar
);

// Password change
auth.post('/password/change',
  authenticate,
  validate({ body: authSchemas.changePassword }),
  async (req, res) => {
    const { current_password, new_password } = req.body;
    const bcrypt = require('bcryptjs');
    const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, userResult.rows[0].password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }
    const hash = await bcrypt.hash(new_password, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);
    // Invalidate all refresh tokens (force re-login on other devices)
    await query('UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE user_id = $1', [req.user.id]);
    res.json({ success: true, message: 'Password changed. Please log in again on other devices.' });
  }
);

// Profile update
auth.patch('/profile', authenticate, sanitizeInput, async (req, res) => {
  const { full_name, email, ward_constituency, district, taluka, pincode } = req.body;
  const result = await query(
    `UPDATE users SET
       full_name        = COALESCE(NULLIF($1,''), full_name),
       email            = COALESCE(NULLIF($2,''), email),
       ward_constituency= COALESCE(NULLIF($3,''), ward_constituency),
       district         = COALESCE(NULLIF($4,''), district),
       taluka           = COALESCE(NULLIF($5,''), taluka),
       pincode          = COALESCE(NULLIF($6,''), pincode),
       updated_at       = NOW()
     WHERE id = $7
     RETURNING id, full_name, email, ward_constituency, district, taluka, pincode`,
    [full_name||'', email||'', ward_constituency||'', district||'', taluka||'', pincode||'', req.user.id]
  );
  res.json({ success: true, message: 'Profile updated.', data: { user: result.rows[0] } });
});

router.use('/auth', auth);

// ── Proposals Routes ───────────────────────────────────────────────────────
const proposals = express.Router();

// Public / optional-auth
proposals.get('/',
  optionalAuth,
  validate({ query: proposalSchemas.listQuery }),
  proposalsController.getProposals
);
proposals.get('/stats',  authenticate, proposalsController.getDashboardStats);
proposals.get('/my',     authenticate, proposalsController.getMyProposals);

// Admin list — BEFORE /:id so it isn't captured as a UUID
proposals.get('/admin/list',
  authenticate,
  authorize('admin', 'superadmin', 'auditor'),
  validate({ query: proposalSchemas.listQuery }),
  proposalsController.getAdminProposals
);

proposals.get('/:id',
  optionalAuth,
  validate({ params: proposalSchemas.uuidParam }),
  proposalsController.getProposal
);

// Citizen submit (with optional file attachments)
proposals.post('/',
  authenticate,
  requireAadhaar,
  submissionRateLimiter,
  upload.array('attachments', 5),
  handleMulterError,
  processUpload,
  sanitizeInput,
  validate({ body: proposalSchemas.submit }),
  proposalsController.submitProposal
);

// Vote
proposals.post('/:id/vote',
  authenticate,
  validate({ params: proposalSchemas.uuidParam, body: proposalSchemas.vote }),
  proposalsController.voteOnProposal
);

// Admin dossier
proposals.get('/:id/dossier',
  authenticate,
  authorize('admin', 'superadmin', 'auditor'),
  validate({ params: proposalSchemas.uuidParam }),
  async (req, res) => {
    const { id } = req.params;
    const result = await query('SELECT * FROM proposals WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Proposal not found.' });
    }
    const proposal = result.rows[0];
    let dossierText = proposal.ai_dossier_text;

    if (!dossierText) {
      const critiques = await query(
        'SELECT critique_text FROM votes WHERE proposal_id = $1 AND vote = $2 AND critique_text IS NOT NULL',
        [id, 'downvote']
      );
      const { compileDossier } = require('../services/aiService');
      dossierText = await compileDossier(proposal, critiques.rows.map(r => r.critique_text));
      await query(
        'UPDATE proposals SET ai_dossier_text = $1, ai_processed_at = NOW() WHERE id = $2',
        [dossierText, id]
      );
    }
    res.json({ success: true, data: { dossier: dossierText, proposal } });
  }
);

// Admin sanction
proposals.post('/:id/sanction',
  authenticate,
  authorize('admin', 'superadmin'),
  validate({ params: proposalSchemas.uuidParam, body: proposalSchemas.sanction }),
  proposalsController.sanctionProposal
);

// Admin revise
proposals.post('/:id/revise',
  authenticate,
  authorize('admin', 'superadmin'),
  validate({ params: proposalSchemas.uuidParam, body: proposalSchemas.requestRevision }),
  proposalsController.requestRevision
);

// Admin reject
proposals.post('/:id/reject',
  authenticate,
  authorize('admin', 'superadmin'),
  validate({ params: proposalSchemas.uuidParam, body: proposalSchemas.reject }),
  proposalsController.rejectProposal
);

// Soft delete (citizen can withdraw own proposal if not sanctioned)
proposals.delete('/:id',
  authenticate,
  validate({ params: proposalSchemas.uuidParam }),
  async (req, res) => {
    const { id } = req.params;
    const result = await query(
      `UPDATE proposals SET deleted_at = NOW()
       WHERE id = $1 AND submitted_by = $2 AND status NOT IN ('sanctioned')
       RETURNING id`,
      [id, req.user.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Proposal not found, not owned by you, or cannot be withdrawn after sanction.',
      });
    }
    await cache.del(`proposal:${id}`);
    res.json({ success: true, message: 'Proposal withdrawn.' });
  }
);

router.use('/proposals', proposals);

// ── Notifications ──────────────────────────────────────────────────────────
router.get('/notifications', authenticate, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const data = await getNotifications(req.user.id, parseInt(page), parseInt(limit));
  res.json({ success: true, data });
});

router.patch('/notifications/:id/read', authenticate, async (req, res) => {
  await markAsRead(req.user.id, req.params.id);
  res.json({ success: true });
});

router.patch('/notifications/read-all', authenticate, async (req, res) => {
  await markAllAsRead(req.user.id);
  res.json({ success: true, message: 'All notifications marked as read.' });
});

// ── Wallet ─────────────────────────────────────────────────────────────────
router.get('/wallet', authenticate, async (req, res) => {
  const [balance, transactions] = await Promise.all([
    query(
      'SELECT civic_royalty_balance, total_royalties_earned FROM users WHERE id = $1',
      [req.user.id]
    ),
    query(
      `SELECT dt.*, p.title as proposal_title, p.ref_number
       FROM dbt_transactions dt
       LEFT JOIN proposals p ON p.id = dt.proposal_id
       WHERE dt.user_id = $1
       ORDER BY dt.initiated_at DESC LIMIT 20`,
      [req.user.id]
    ),
  ]);
  res.json({
    success: true,
    data: { wallet: balance.rows[0], transactions: transactions.rows },
  });
});

// ── Admin Routes ───────────────────────────────────────────────────────────
const adminRouter = express.Router();
adminRouter.use(authenticate);

// User management
adminRouter.get('/users',
  authorize('superadmin', 'admin'),
  async (req, res) => {
    const { page = 1, limit = 20, role, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['deleted_at IS NULL'];
    const params = [];
    if (role)   { params.push(role);         conditions.push(`role = $${params.length}`); }
    if (search) { params.push(`%${search}%`);conditions.push(`(full_name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length})`); }
    params.push(parseInt(limit), offset);
    const where = conditions.join(' AND ');
    const [result, countResult] = await Promise.all([
      query(
        `SELECT id, full_name, email, phone, role, dept, department_designation,
                aadhaar_verified, is_active, is_locked, civic_royalty_balance,
                created_at, last_login_at
         FROM users WHERE ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      query(`SELECT COUNT(*) FROM users WHERE ${where}`, params.slice(0, -2)),
    ]);
    res.json({
      success: true,
      data: { users: result.rows, total: parseInt(countResult.rows[0].count) },
    });
  }
);

adminRouter.patch('/users/:id/toggle-lock',
  authorize('superadmin'),
  async (req, res) => {
    const result = await query(
      'UPDATE users SET is_locked = NOT is_locked, updated_at = NOW() WHERE id = $1 RETURNING is_locked, full_name',
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const { is_locked, full_name } = result.rows[0];
    res.json({
      success: true,
      message: `${full_name} has been ${is_locked ? 'locked' : 'unlocked'}.`,
      data: result.rows[0],
    });
  }
);

adminRouter.post('/users/admin',
  authorize('superadmin'),
  validate({ body: adminSchemas.createAdmin }),
  async (req, res) => {
    const { full_name, phone, email, dept, department_designation } = req.body;
    // Check phone uniqueness
    const existing = await query('SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL', [phone]);
    if (existing.rows.length) {
      return res.status(409).json({ success: false, message: 'Phone number already registered.' });
    }
    const bcrypt = require('bcryptjs');
    const tempPassword = Math.random().toString(36).slice(-8).toUpperCase() + Math.floor(Math.random()*100);
    const hash = await bcrypt.hash(tempPassword, 12);
    const result = await query(
      `INSERT INTO users (full_name, phone, email, role, dept, department_designation, phone_verified, password_hash)
       VALUES ($1, $2, $3, 'admin', $4, $5, TRUE, $6)
       RETURNING id, full_name, phone, role, dept, department_designation`,
      [full_name, phone, email || null, dept, department_designation || null, hash]
    );
    res.status(201).json({
      success: true,
      message: 'Admin account created.',
      data: { user: result.rows[0], temp_password: tempPassword },
    });
  }
);

adminRouter.patch('/users/:id/deactivate',
  authorize('superadmin'),
  async (req, res) => {
    await query(
      'UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND role != $2',
      [req.params.id, 'superadmin']
    );
    // Revoke all their tokens
    await query('UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE user_id = $1', [req.params.id]);
    res.json({ success: true, message: 'Account deactivated and sessions revoked.' });
  }
);

// Audit logs
adminRouter.get('/audit-logs',
  authorize('superadmin', 'auditor'),
  async (req, res) => {
    const { page = 1, limit = 50, user_id, action } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    if (user_id) { params.push(user_id); conditions.push(`al.user_id = $${params.length}`); }
    if (action)  { params.push(`%${action}%`); conditions.push(`al.action ILIKE $${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(parseInt(limit), offset);
    const result = await query(
      `SELECT al.*, u.full_name, u.role
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, data: { logs: result.rows } });
  }
);

// System config
adminRouter.get('/system/config',
  authorize('superadmin'),
  async (req, res) => {
    const result = await query('SELECT key, value, updated_at FROM system_config ORDER BY key');
    res.json({ success: true, data: { config: result.rows } });
  }
);

adminRouter.patch('/system/config/:key',
  authorize('superadmin'),
  validate({ body: adminSchemas.updateConfig }),
  async (req, res) => {
    const { value } = req.body;
    const result = await query(
      `INSERT INTO system_config (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING key, value`,
      [req.params.key, JSON.stringify(value), req.user.id]
    );
    await cache.del(`config:${req.params.key}`);
    res.json({ success: true, message: 'Config updated.', data: result.rows[0] });
  }
);

// Platform stats (superadmin)
adminRouter.get('/system/stats',
  authorize('superadmin'),
  async (req, res) => {
    const [users, proposals, votes, dbt, recentActivity] = await Promise.all([
      query(`SELECT role, COUNT(*) FROM users WHERE deleted_at IS NULL GROUP BY role`),
      query(`SELECT status, COUNT(*) FROM proposals WHERE deleted_at IS NULL GROUP BY status`),
      query(`SELECT COUNT(*) as total_votes, COUNT(DISTINCT user_id) as unique_voters FROM votes`),
      query(`SELECT SUM(amount) as total_disbursed, COUNT(*) as tx_count FROM dbt_transactions WHERE status = 'credited'`),
      query(`SELECT action, COUNT(*) FROM admin_actions WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY action ORDER BY COUNT(*) DESC LIMIT 10`),
    ]);
    res.json({
      success: true,
      data: {
        users: users.rows,
        proposals: proposals.rows,
        votes: votes.rows[0],
        dbt: dbt.rows[0],
        recent_activity: recentActivity.rows,
      },
    });
  }
);

// DBT transactions overview
adminRouter.get('/dbt/transactions',
  authorize('superadmin', 'auditor'),
  async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = status ? `AND dt.status = '${status}'` : '';
    const result = await query(
      `SELECT dt.*, u.full_name, u.phone, p.title as proposal_title, p.ref_number
       FROM dbt_transactions dt
       JOIN users u ON u.id = dt.user_id
       LEFT JOIN proposals p ON p.id = dt.proposal_id
       WHERE 1=1 ${where}
       ORDER BY dt.initiated_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), offset]
    );
    res.json({ success: true, data: { transactions: result.rows } });
  }
);

router.use('/admin', adminRouter);

module.exports = router;
