// src/middleware/auth.js
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { cache } = require('../config/redis');
const logger = require('../config/logger');

/**
 * Verify access token from Authorization header or httpOnly cookie
 */
async function authenticate(req, res, next) {
  try {
    let token = null;

    // Try Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    // Fallback: try httpOnly cookie
    if (!token && req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in.',
        code: 'NO_TOKEN',
      });
    }

    // Verify signature
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please log in again.',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token.',
        code: 'INVALID_TOKEN',
      });
    }

    // Check if token is blacklisted (logout or revocation)
    const isBlacklisted = await cache.isBlacklisted(decoded.jti);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Token has been revoked. Please log in again.',
        code: 'TOKEN_REVOKED',
      });
    }

    // Fetch user from DB (check is_active, is_locked)
    const userResult = await query(
      `SELECT id, full_name, email, phone, role, dept, is_active, is_locked,
              aadhaar_verified, civic_royalty_balance, phone_verified
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [decoded.sub]
    );

    if (!userResult.rows.length) {
      return res.status(401).json({
        success: false,
        message: 'User account not found.',
        code: 'USER_NOT_FOUND',
      });
    }

    const user = userResult.rows[0];

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated. Contact support.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    if (user.is_locked) {
      return res.status(403).json({
        success: false,
        message: 'Account is locked due to multiple failed attempts. Contact support.',
        code: 'ACCOUNT_LOCKED',
      });
    }

    req.user = user;
    req.tokenJti = decoded.jti;
    next();
  } catch (err) {
    logger.error('Auth middleware error', { error: err.message });
    next(err);
  }
}

/**
 * Require specific role(s)
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated', code: 'NO_AUTH' });
    }
    if (!roles.includes(req.user.role)) {
      logger.warn('Unauthorized access attempt', {
        user: req.user.id,
        role: req.user.role,
        required: roles,
        path: req.path,
      });
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action.',
        code: 'FORBIDDEN',
      });
    }
    next();
  };
}

/**
 * Require Aadhaar verification for sensitive operations
 */
function requireAadhaar(req, res, next) {
  if (!req.user?.aadhaar_verified) {
    return res.status(403).json({
      success: false,
      message: 'Aadhaar verification required for this action.',
      code: 'AADHAAR_REQUIRED',
    });
  }
  next();
}

/**
 * Optional auth — attaches user if token present, doesn't fail if not
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return next();
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    const isBlacklisted = await cache.isBlacklisted(decoded.jti);
    if (isBlacklisted) return next();
    const userResult = await query(
      'SELECT id, full_name, role, dept FROM users WHERE id = $1 AND is_active = TRUE AND deleted_at IS NULL',
      [decoded.sub]
    );
    if (userResult.rows.length) req.user = userResult.rows[0];
  } catch { /* ignore */ }
  next();
}

module.exports = { authenticate, authorize, requireAadhaar, optionalAuth };
