// src/middleware/security.js
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const sanitizeHtml = require('sanitize-html');
const logger = require('../config/logger');
const { cache } = require('../config/redis');

/**
 * Helmet — HTTP security headers
 */
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdnjs.cloudflare.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com', 'cdnjs.cloudflare.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  permittedCrossDomainPolicies: false,
  hidePoweredBy: true,
});

/**
 * Global rate limiter
 */
const globalRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again after 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  handler: (req, res, next, options) => {
    logger.warn('Rate limit triggered', { ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  },
  skip: (req) => req.path === '/health',
});

/**
 * Strict limiter for auth endpoints
 */
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many authentication attempts. Account temporarily restricted.',
    code: 'AUTH_RATE_LIMIT',
  },
  handler: (req, res, next, options) => {
    logger.warn('Auth rate limit triggered', { ip: req.ip, phone: req.body?.phone });
    res.status(429).json(options.message);
  },
});

/**
 * OTP rate limiter
 */
const otpRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 2,
  message: {
    success: false,
    message: 'OTP requests limited. Please wait 60 seconds.',
    code: 'OTP_RATE_LIMIT',
  },
});

/**
 * Submission limiter
 */
const submissionRateLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: {
    success: false,
    message: 'Daily proposal submission limit (3 per day) reached.',
    code: 'SUBMISSION_LIMIT',
  },
});

/**
 * Input sanitization middleware
 */
function sanitizeInput(req, res, next) {
  const sanitize = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        // Remove XSS vectors
        obj[key] = sanitizeHtml(obj[key], {
          allowedTags: [],
          allowedAttributes: {},
        }).trim();
        // Prevent SQL injection patterns (belt-and-suspenders on top of parameterized queries)
        obj[key] = obj[key].replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi, '');
      } else if (typeof obj[key] === 'object') {
        sanitize(obj[key]);
      }
    }
    return obj;
  };
  sanitize(req.body);
  sanitize(req.query);
  sanitize(req.params);
  next();
}

/**
 * Request ID middleware for traceability
 */
function requestId(req, res, next) {
  const { v4: uuidv4 } = require('uuid');
  req.requestId = uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
}

/**
 * Security audit logger
 */
function auditLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path === '/health') return;
    const duration = Date.now() - start;
    logger.info('Request', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      ip: req.ip,
      user: req.user?.id,
    });
  });
  next();
}

/**
 * CORS configuration
 */
function corsOptions() {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
  return {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn('CORS blocked', { origin });
        callback(new Error('CORS policy: origin not allowed'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-CSRF-Token'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400,
  };
}

/**
 * IP block check
 */
async function ipBlockCheck(req, res, next) {
  const blocked = await cache.exists(`blocked_ip:${req.ip}`);
  if (blocked) {
    logger.warn('Blocked IP attempted access', { ip: req.ip });
    return res.status(403).json({ success: false, message: 'Access denied', code: 'IP_BLOCKED' });
  }
  next();
}

/**
 * Maintenance mode check
 */
async function maintenanceCheck(req, res, next) {
  if (req.path.startsWith('/api/admin/system')) return next();
  const config = await cache.get('config:maintenance_mode');
  if (config === true || config === 'true') {
    return res.status(503).json({
      success: false,
      message: 'Aaple Shasan is undergoing scheduled maintenance. Please try again shortly.',
      code: 'MAINTENANCE',
    });
  }
  next();
}

module.exports = {
  helmetMiddleware,
  globalRateLimiter,
  authRateLimiter,
  otpRateLimiter,
  submissionRateLimiter,
  sanitizeInput,
  requestId,
  auditLogger,
  corsOptions,
  ipBlockCheck,
  maintenanceCheck,
  hpp,
};
