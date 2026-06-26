// src/controllers/authController.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../config/database');
const { cache } = require('../config/redis');
const logger = require('../config/logger');

// ── Helpers ────────────────────────────────────────────────────────────

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateAccessToken(userId, role, jti) {
  return jwt.sign(
    { sub: userId, role, jti: jti || uuidv4(), type: 'access' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m', issuer: 'aapleshasan', audience: 'citizen-portal' }
  );
}

function generateRefreshToken(userId) {
  const token = crypto.randomBytes(64).toString('hex');
  return token;
}

async function sendOTP(phone, otp, purpose) {
  // In production: integrate MSG91 / Twilio SMS API
  // For demo: log the OTP
  logger.info(`OTP [${purpose}] for ${phone}: ${otp}`);
  // Example MSG91 call:
  // await axios.post('https://api.msg91.com/api/v5/otp', {...})
  return true;
}

// ── Register ────────────────────────────────────────────────────────────

async function requestRegistrationOTP(req, res) {
  const { phone, full_name, email } = req.body;

  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ success: false, message: 'Valid 10-digit phone number required.' });
  }
  if (!full_name || full_name.trim().length < 2) {
    return res.status(400).json({ success: false, message: 'Full name required.' });
  }

  // Check if phone already registered
  const existing = await query('SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL', [phone]);
  if (existing.rows.length) {
    return res.status(409).json({ success: false, message: 'Phone number already registered. Please log in.', code: 'PHONE_EXISTS' });
  }

  // Invalidate old OTPs for this phone
  await query("UPDATE otps SET used = TRUE WHERE phone = $1 AND purpose = 'register' AND used = FALSE", [phone]);

  const otp = generateOTP();
  const otpHash = hashOTP(otp);
  const expiresAt = new Date(Date.now() + (parseInt(process.env.OTP_EXPIRY_MINUTES) || 10) * 60 * 1000);

  await query(
    'INSERT INTO otps (phone, otp_hash, purpose, expires_at, ip_address) VALUES ($1, $2, $3, $4, $5)',
    [phone, otpHash, 'register', expiresAt, req.ip]
  );

  // Cache registration data temporarily
  await cache.set(`reg_data:${phone}`, { full_name: full_name.trim(), email: email?.trim() || null }, 600);

  await sendOTP(phone, otp, 'register');

  res.json({
    success: true,
    message: `OTP sent to +91-${phone}. Valid for ${process.env.OTP_EXPIRY_MINUTES || 10} minutes.`,
    expiresIn: (parseInt(process.env.OTP_EXPIRY_MINUTES) || 10) * 60,
  });
}

async function verifyRegistrationOTP(req, res) {
  const { phone, otp, password, ward_constituency, district } = req.body;

  if (!phone || !otp || !password) {
    return res.status(400).json({ success: false, message: 'Phone, OTP, and password required.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
  }

  const otpRecord = await query(
    `SELECT * FROM otps WHERE phone = $1 AND purpose = 'register' AND used = FALSE 
     AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );

  if (!otpRecord.rows.length) {
    return res.status(400).json({ success: false, message: 'OTP expired or not found. Request a new one.' });
  }

  const record = otpRecord.rows[0];

  if (record.attempts >= record.max_attempts) {
    await query('UPDATE otps SET used = TRUE WHERE id = $1', [record.id]);
    return res.status(400).json({ success: false, message: 'Too many OTP attempts. Please request a new OTP.', code: 'OTP_LOCKED' });
  }

  if (record.otp_hash !== hashOTP(otp)) {
    await query('UPDATE otps SET attempts = attempts + 1 WHERE id = $1', [record.id]);
    const remaining = record.max_attempts - record.attempts - 1;
    return res.status(400).json({ success: false, message: `Invalid OTP. ${remaining} attempts remaining.`, code: 'INVALID_OTP' });
  }

  // Mark OTP as used
  await query('UPDATE otps SET used = TRUE WHERE id = $1', [record.id]);

  // Get cached registration data
  const regData = await cache.get(`reg_data:${phone}`);
  if (!regData) {
    return res.status(400).json({ success: false, message: 'Registration session expired. Please start again.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const newUser = await transaction(async (client) => {
    const result = await client.query(
      `INSERT INTO users (full_name, email, phone, phone_verified, password_hash, ward_constituency, district, role)
       VALUES ($1, $2, $3, TRUE, $4, $5, $6, 'citizen') RETURNING id, full_name, email, phone, role`,
      [regData.full_name, regData.email, phone, passwordHash, ward_constituency || null, district || null]
    );
    return result.rows[0];
  });

  await cache.del(`reg_data:${phone}`);

  logger.info('New user registered', { userId: newUser.id, phone });

  res.status(201).json({
    success: true,
    message: 'Registration successful! Welcome to Aaple Shasan.',
    user: { id: newUser.id, full_name: newUser.full_name, phone: newUser.phone, role: newUser.role },
  });
}

// ── Login ────────────────────────────────────────────────────────────

async function requestLoginOTP(req, res) {
  const { phone } = req.body;
  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ success: false, message: 'Valid phone number required.' });
  }

  const userResult = await query(
    'SELECT id, is_active, is_locked, failed_login_attempts FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [phone]
  );

  // Don't reveal whether user exists — just say OTP sent
  if (!userResult.rows.length) {
    return res.json({ success: true, message: `If this number is registered, an OTP will be sent.` });
  }

  const user = userResult.rows[0];
  if (user.is_locked || !user.is_active) {
    return res.status(403).json({ success: false, message: 'Account locked or inactive. Contact support.' });
  }

  await query("UPDATE otps SET used = TRUE WHERE phone = $1 AND purpose = 'login' AND used = FALSE", [phone]);

  const otp = generateOTP();
  await query(
    'INSERT INTO otps (phone, otp_hash, purpose, expires_at, ip_address) VALUES ($1, $2, $3, NOW() + INTERVAL \'10 minutes\', $4)',
    [phone, hashOTP(otp), 'login', req.ip]
  );

  await sendOTP(phone, otp, 'login');
  res.json({ success: true, message: `OTP sent to +91-${phone}` });
}

async function verifyLoginOTP(req, res) {
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ success: false, message: 'Phone and OTP required.' });
  }

  const otpRecord = await query(
    `SELECT * FROM otps WHERE phone = $1 AND purpose = 'login' AND used = FALSE 
     AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
    [phone]
  );

  if (!otpRecord.rows.length) {
    return res.status(400).json({ success: false, message: 'OTP expired or not found.', code: 'OTP_EXPIRED' });
  }

  const record = otpRecord.rows[0];
  if (record.attempts >= record.max_attempts) {
    await query('UPDATE otps SET used = TRUE WHERE id = $1', [record.id]);
    return res.status(400).json({ success: false, message: 'OTP locked. Request a new one.', code: 'OTP_LOCKED' });
  }

  if (record.otp_hash !== hashOTP(otp)) {
    await query('UPDATE otps SET attempts = attempts + 1 WHERE id = $1', [record.id]);
    return res.status(400).json({ success: false, message: 'Invalid OTP.', code: 'INVALID_OTP' });
  }

  await query('UPDATE otps SET used = TRUE WHERE id = $1', [record.id]);

  const userResult = await query(
    `SELECT id, full_name, email, phone, role, dept, is_active, is_locked, aadhaar_verified, civic_royalty_balance, phone_verified
     FROM users WHERE phone = $1 AND deleted_at IS NULL`,
    [phone]
  );

  const user = userResult.rows[0];
  if (!user || !user.is_active) {
    return res.status(403).json({ success: false, message: 'Account inactive.' });
  }

  return await issueTokens(user, req, res, 'OTP login');
}

async function loginWithPassword(req, res) {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ success: false, message: 'Phone and password required.' });
  }

  const userResult = await query(
    'SELECT * FROM users WHERE phone = $1 AND deleted_at IS NULL',
    [phone]
  );

  if (!userResult.rows.length) {
    // Timing-safe fake compare
    await bcrypt.compare(password, '$2b$12$invalidhashforsecuritypurposes12345');
    return res.status(401).json({ success: false, message: 'Invalid credentials.', code: 'INVALID_CREDENTIALS' });
  }

  const user = userResult.rows[0];

  if (user.is_locked) {
    return res.status(403).json({ success: false, message: 'Account locked. Contact support.', code: 'ACCOUNT_LOCKED' });
  }
  if (!user.is_active) {
    return res.status(403).json({ success: false, message: 'Account inactive.', code: 'INACTIVE' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    const newAttempts = user.failed_login_attempts + 1;
    const lock = newAttempts >= 5;
    await query('UPDATE users SET failed_login_attempts = $1, is_locked = $2 WHERE id = $3', [newAttempts, lock, user.id]);
    if (lock) logger.warn('Account locked due to failed attempts', { userId: user.id });
    return res.status(401).json({
      success: false,
      message: lock ? 'Account locked after 5 failed attempts.' : `Invalid credentials. ${5 - newAttempts} attempts remaining.`,
      code: 'INVALID_CREDENTIALS',
    });
  }

  await query('UPDATE users SET failed_login_attempts = 0, last_login_at = NOW(), last_login_ip = $1 WHERE id = $2', [req.ip, user.id]);
  return await issueTokens(user, req, res, 'Password login');
}

async function issueTokens(user, req, res, method) {
  const jti = uuidv4();
  const accessToken = generateAccessToken(user.id, user.role, jti);
  const refreshToken = generateRefreshToken(user.id);
  const refreshHash = hashToken(refreshToken);

  const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_info, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refreshHash, JSON.stringify({ ua: req.get('User-Agent') }), req.ip, refreshExpiry]
  );

  logger.info('User logged in', { userId: user.id, method, ip: req.ip });

  // Set httpOnly refresh token cookie
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth/refresh',
  });

  res.json({
    success: true,
    message: 'Login successful.',
    data: {
      accessToken,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        dept: user.dept,
        aadhaar_verified: user.aadhaar_verified,
        civic_royalty_balance: user.civic_royalty_balance,
        phone_verified: user.phone_verified,
      },
    },
  });
}

// ── Refresh Token ────────────────────────────────────────────────────────────

async function refreshAccessToken(req, res) {
  const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({ success: false, message: 'No refresh token.', code: 'NO_REFRESH_TOKEN' });
  }

  const tokenHash = hashToken(refreshToken);
  const result = await query(
    `SELECT rt.*, u.id as user_id, u.role, u.is_active, u.is_locked
     FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1 AND rt.revoked = FALSE AND rt.expires_at > NOW()`,
    [tokenHash]
  );

  if (!result.rows.length) {
    res.clearCookie('refreshToken');
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.', code: 'INVALID_REFRESH' });
  }

  const record = result.rows[0];
  if (!record.is_active || record.is_locked) {
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [record.id]);
    return res.status(403).json({ success: false, message: 'Account inactive or locked.' });
  }

  // Rotate token
  await query('UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE id = $1', [record.id]);

  const jti = uuidv4();
  const newAccessToken = generateAccessToken(record.user_id, record.role, jti);
  const newRefreshToken = generateRefreshToken(record.user_id);
  const newRefreshHash = hashToken(newRefreshToken);
  const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, ip_address, expires_at) VALUES ($1, $2, $3, $4)',
    [record.user_id, newRefreshHash, req.ip, refreshExpiry]
  );

  res.cookie('refreshToken', newRefreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth/refresh',
  });

  res.json({ success: true, data: { accessToken: newAccessToken } });
}

// ── Logout ────────────────────────────────────────────────────────────

async function logout(req, res) {
  try {
    // Blacklist access token
    if (req.tokenJti) {
      await cache.blacklistToken(req.tokenJti, 16 * 60); // 15min + buffer
    }

    // Revoke refresh token from cookie
    const refreshToken = req.cookies?.refreshToken;
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await query('UPDATE refresh_tokens SET revoked = TRUE, revoked_at = NOW() WHERE token_hash = $1', [tokenHash]);
    }

    res.clearCookie('refreshToken', { path: '/api/auth/refresh' });
    logger.info('User logged out', { userId: req.user?.id });
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    logger.error('Logout error', { error: err.message });
    res.json({ success: true, message: 'Logged out.' }); // Always succeed from client perspective
  }
}

// ── Aadhaar Verification (Mock — integrate UIDAI in prod) ────────────

async function verifyAadhaar(req, res) {
  const { aadhaar_number } = req.body;

  if (!aadhaar_number || !/^\d{12}$/.test(aadhaar_number)) {
    return res.status(400).json({ success: false, message: 'Valid 12-digit Aadhaar number required.' });
  }

  const aadhaarHash = crypto.createHash('sha256').update(aadhaar_number).digest('hex');

  // Check if Aadhaar already linked to another account
  const existing = await query('SELECT id FROM users WHERE aadhaar_hash = $1 AND id != $2', [aadhaarHash, req.user.id]);
  if (existing.rows.length) {
    return res.status(409).json({ success: false, message: 'This Aadhaar is already linked to another account.', code: 'AADHAAR_DUPLICATE' });
  }

  // In production: call UIDAI OTP API, verify here
  // For demo: mark as verified
  await query(
    'UPDATE users SET aadhaar_hash = $1, aadhaar_verified = TRUE, aadhaar_verified_at = NOW() WHERE id = $2',
    [aadhaarHash, req.user.id]
  );

  logger.info('Aadhaar verified', { userId: req.user.id });
  res.json({ success: true, message: 'Aadhaar verified successfully. Identity confirmed.' });
}

// ── Get current user ────────────────────────────────────────────────────────────

async function getMe(req, res) {
  const result = await query(
    `SELECT id, full_name, email, phone, role, dept, department_designation,
            aadhaar_verified, aadhaar_verified_at, ward_constituency, district, taluka, pincode,
            profile_photo_url, civic_royalty_balance, total_royalties_earned,
            phone_verified, email_verified, created_at, last_login_at
     FROM users WHERE id = $1`,
    [req.user.id]
  );

  const notifCount = await query(
    'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = FALSE',
    [req.user.id]
  );

  res.json({
    success: true,
    data: {
      user: result.rows[0],
      unread_notifications: parseInt(notifCount.rows[0].count),
    },
  });
}

module.exports = {
  requestRegistrationOTP,
  verifyRegistrationOTP,
  requestLoginOTP,
  verifyLoginOTP,
  loginWithPassword,
  refreshAccessToken,
  logout,
  verifyAadhaar,
  getMe,
};
