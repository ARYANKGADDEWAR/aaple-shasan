// src/services/emailService.js
const nodemailer = require('nodemailer');
const logger = require('../config/logger');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.EMAIL_PROVIDER === 'smtp') {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      pool: true,
      maxConnections: 5,
    });
  } else {
    // Fallback: console transport for development
    transporter = {
      sendMail: async (opts) => {
        logger.info('[Email DEV]', { to: opts.to, subject: opts.subject });
        return { messageId: 'dev-' + Date.now() };
      },
    };
  }

  return transporter;
}

// ── Email Templates ──────────────────────────────────────────────────────────

function baseTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: 'Inter', Arial, sans-serif; background: #F8FAFC; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 32px auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,33,71,0.08); }
    .header { background: #002147; padding: 28px 32px; text-align: center; border-bottom: 3px solid #FFD700; }
    .header h1 { color: white; font-size: 20px; margin: 0; font-weight: 700; }
    .header p { color: rgba(255,215,0,0.8); font-size: 11px; margin: 4px 0 0; letter-spacing: 1px; text-transform: uppercase; }
    .body { padding: 32px; }
    .body p { color: #475569; font-size: 14px; line-height: 1.7; margin: 0 0 16px; }
    .highlight { background: #F8FAFC; border-left: 4px solid #FFD700; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .btn { display: inline-block; background: #002147; color: white; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 8px 0; }
    .amount { font-size: 36px; font-weight: 800; color: #10B981; text-align: center; margin: 16px 0; }
    .footer { background: #F8FAFC; padding: 20px 32px; text-align: center; border-top: 1px solid #EEF2F7; }
    .footer p { color: #94A3B8; font-size: 11px; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏛️ Aaple Shasan | आपले शासन</h1>
      <p>Government of Maharashtra · Civic Platform</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>This is an automated message from the Maharashtra Government Civic Platform.<br />
      Please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

// ── Send Functions ──────────────────────────────────────────────────────────

async function sendOTPEmail(to, otp, purpose, expiryMinutes = 10) {
  const purposeLabels = {
    login: 'Login',
    register: 'Account Registration',
    password_reset: 'Password Reset',
    aadhaar_verify: 'Aadhaar Verification',
    dbt_confirm: 'DBT Confirmation',
  };

  const content = `
    <p>Hello,</p>
    <p>Your OTP for <strong>${purposeLabels[purpose] || purpose}</strong> on Aaple Shasan is:</p>
    <div class="highlight" style="text-align:center;">
      <div style="font-size:36px;font-weight:800;color:#002147;letter-spacing:12px;">${otp}</div>
      <p style="margin:8px 0 0;font-size:12px;color:#94A3B8;">Valid for ${expiryMinutes} minutes · Do not share with anyone</p>
    </div>
    <p>If you did not request this OTP, please ignore this email. Your account is safe.</p>
  `;

  return sendEmail(to, `${otp} — Your Aaple Shasan OTP`, baseTemplate(content));
}

async function sendProposalSubmittedEmail(to, name, proposal) {
  const content = `
    <p>Dear ${name},</p>
    <p>Your civic proposal has been successfully submitted and is now in the community voting phase.</p>
    <div class="highlight">
      <p style="margin:0;"><strong>Proposal:</strong> ${proposal.title}</p>
      <p style="margin:8px 0 0;"><strong>Ref:</strong> <code>${proposal.ref_number}</code></p>
      <p style="margin:8px 0 0;"><strong>Routed to:</strong> ${proposal.detected_dept}</p>
      <p style="margin:8px 0 0;"><strong>AI Confidence:</strong> ${proposal.ai_confidence}%</p>
    </div>
    <p>Your proposal needs <strong>50 community upvotes</strong> to reach the administrative desk for review. Share it with your community!</p>
    <p style="text-align:center;"><a href="${process.env.APP_URL}/citizen/feed" class="btn">View Community Feed</a></p>
  `;

  return sendEmail(to, `Proposal Submitted — ${proposal.ref_number}`, baseTemplate(content));
}

async function sendSanctionedEmail(to, name, proposal, projectCode) {
  const content = `
    <p>Dear ${name},</p>
    <p>🎉 Congratulations! Your civic proposal has been <strong>officially sanctioned</strong> by the ${proposal.assigned_dept} department.</p>
    <div class="highlight">
      <p style="margin:0;"><strong>Proposal:</strong> ${proposal.title}</p>
      <p style="margin:8px 0 0;"><strong>Project Code:</strong> <code>${projectCode}</code></p>
      <p style="margin:8px 0 0;"><strong>Department:</strong> ${proposal.assigned_dept}</p>
    </div>
    <div class="amount">₹1,000</div>
    <p style="text-align:center;color:#10B981;font-weight:600;">Civic Royalty credited to your Aadhaar-linked account via DBT</p>
    <p>The amount will reflect in your bank account within 24 working hours through PFMS/DBT Gateway.</p>
    <p style="text-align:center;"><a href="${process.env.APP_URL}/citizen/wallet" class="btn">View Wallet</a></p>
  `;

  return sendEmail(to, `🏆 Your Proposal Was Sanctioned! ₹1,000 Civic Royalty — ${proposal.ref_number}`, baseTemplate(content));
}

async function sendRevisionRequestedEmail(to, name, proposal, revisionNote) {
  const content = `
    <p>Dear ${name},</p>
    <p>The administrative desk has reviewed your proposal and requested some revisions before it can be sanctioned.</p>
    <div class="highlight">
      <p style="margin:0;"><strong>Proposal:</strong> ${proposal.title}</p>
      <p style="margin:8px 0 0;"><strong>Revision Note:</strong> ${revisionNote}</p>
    </div>
    <p>Please update your proposal and resubmit for review.</p>
    <p style="text-align:center;"><a href="${process.env.APP_URL}/citizen/my-proposals" class="btn">View My Proposals</a></p>
  `;

  return sendEmail(to, `Revision Requested — ${proposal.ref_number}`, baseTemplate(content));
}

async function sendWelcomeEmail(to, name) {
  const content = `
    <p>Welcome to Aaple Shasan, ${name}! 🙏</p>
    <p>You've joined Maharashtra's first AI-powered civic platform. Here's how to get started:</p>
    <div class="highlight">
      <p style="margin:0;"><strong>Step 1:</strong> Verify your Aadhaar to unlock all features</p>
      <p style="margin:8px 0 0;"><strong>Step 2:</strong> Submit a civic proposal for your community</p>
      <p style="margin:8px 0 0;"><strong>Step 3:</strong> Get 50 upvotes to send it for admin review</p>
      <p style="margin:8px 0 0;"><strong>Step 4:</strong> Earn ₹1,000 Civic Royalty when it's sanctioned!</p>
    </div>
    <p style="text-align:center;"><a href="${process.env.APP_URL}/citizen" class="btn">Get Started</a></p>
  `;

  return sendEmail(to, 'Welcome to Aaple Shasan — आपले शासन', baseTemplate(content));
}

// ── Core send ──────────────────────────────────────────────────────────
async function sendEmail(to, subject, html) {
  if (!to) return;

  try {
    const result = await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || 'Aaple Shasan <noreply@aapleshasan.gov.in>',
      to,
      subject,
      html,
    });
    logger.info('Email sent', { to, subject, messageId: result.messageId });
    return result;
  } catch (err) {
    logger.error('Email send failed', { to, subject, error: err.message });
    // Don't throw — email failure should not break the main flow
  }
}

module.exports = {
  sendEmail,
  sendOTPEmail,
  sendProposalSubmittedEmail,
  sendSanctionedEmail,
  sendRevisionRequestedEmail,
  sendWelcomeEmail,
};
