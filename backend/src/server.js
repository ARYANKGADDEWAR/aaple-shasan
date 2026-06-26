// src/server.js — Aaple Shasan Production Server
require('dotenv').config();
require('express-async-errors');

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

const logger = require('./config/logger');
const { pool } = require('./config/database');
const { redis, cache } = require('./config/redis');
const routes = require('./routes/index');
const {
  helmetMiddleware,
  globalRateLimiter,
  requestId,
  auditLogger,
  corsOptions,
  ipBlockCheck,
  hpp,
} = require('./middleware/security');

// Ensure directories exist
const logDir = process.env.LOG_FILE_PATH || './logs';
const uploadDir = path.join(__dirname, '../uploads');
[logDir, uploadDir, path.join(uploadDir, 'proposals'), path.join(uploadDir, 'temp')].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const app = express();
const server = http.createServer(app);

// ── WebSocket ────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Map of userId → socketId for targeted push
const userSockets = new Map();

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Auth required'));
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    // Check blacklist
    const isBlacklisted = await cache.isBlacklisted(decoded.jti);
    if (isBlacklisted) return next(new Error('Token revoked'));
    socket.userId = decoded.sub;
    socket.userRole = decoded.role;
    next();
  } catch (err) {
    next(new Error('Invalid token: ' + err.message));
  }
});

io.on('connection', (socket) => {
  logger.info('WS connected', { userId: socket.userId, socketId: socket.id });
  userSockets.set(socket.userId, socket.id);

  // Join personal room + role rooms
  socket.join(`user:${socket.userId}`);
  if (['admin', 'superadmin'].includes(socket.userRole)) {
    socket.join('room:admins');
  }

  socket.on('join:dept', (dept) => {
    if (typeof dept === 'string' && dept.length < 50) {
      socket.join(`dept:${dept}`);
    }
  });

  socket.on('disconnect', (reason) => {
    userSockets.delete(socket.userId);
    logger.info('WS disconnected', { userId: socket.userId, reason });
  });

  socket.on('error', (err) => {
    logger.warn('WS socket error', { userId: socket.userId, error: err.message });
  });
});

// Expose io + userSockets for controllers/services
app.set('io', io);
app.set('userSockets', userSockets);

// ── Middleware ────────────────────────────────────────────────────────
app.set('trust proxy', 1);

app.use(helmetMiddleware);
app.use(cors(corsOptions()));
app.use(hpp());
app.use(compression({ threshold: 1024 }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(requestId);
app.use(auditLogger);
app.use(morgan('combined', {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip: (req) => req.path === '/api/health',
}));
app.use(ipBlockCheck);
app.use(globalRateLimiter);

// Static file serving for uploads
app.use('/uploads', (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=604800');
  next();
}, express.static(uploadDir, { maxAge: '7d' }));

// ── API Routes ────────────────────────────────────────────────────────
app.use('/api', routes);

// ── 404 ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found.`,
    code: 'NOT_FOUND',
  });
});

// ── Global Error Handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  if (status >= 500) {
    logger.error('Server error', {
      error: err.message,
      stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
      path: req.path,
      method: req.method,
      user: req.user?.id,
      requestId: req.requestId,
    });
  }

  const response = {
    success: false,
    message: status >= 500 ? 'Internal server error. Please try again.' : err.message,
    code: err.code || 'SERVER_ERROR',
    requestId: req.requestId,
  };

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack;
  }

  res.status(status).json(response);
});

// ── Start ────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 5000;

async function start() {
  
  server.listen(PORT, () => {
    logger.info(`🚀 Aaple Shasan API running — port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    logger.info(`📡 WebSocket server ready`);
  });

  // Verify DB
  try {
    await pool.query('SELECT 1');
    logger.info('✅ PostgreSQL connected');
  } catch (err) {
    logger.error('❌ PostgreSQL connection failed — aborting', { error: err.message });
    process.exit(1);
  }

  // Verify Redis
  try {
    await redis.ping();
    logger.info('✅ Redis connected');
  } catch (err) {
    logger.error('❌ Redis connection failed — aborting', { error: err.message });
    process.exit(1);
  }

  // Warm config cache
  try {
    const configResult = await pool.query('SELECT key, value FROM system_config');
    for (const row of configResult.rows) {
      await cache.set(`config:${row.key}`, row.value, 600);
    }
    logger.info(`✅ System config loaded (${configResult.rowCount} keys)`);
  } catch (err) {
    logger.warn('⚠️  Config cache warm failed', { error: err.message });
  }

  // Start cron jobs (only in production / when not testing)
  if (process.env.NODE_ENV !== 'test') {
    const { startCronJobs } = require('./services/cronService');
    startCronJobs();
  }

}

// ── Graceful Shutdown ────────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down gracefully`);

  server.close(async () => {
    try {
      io.close();
      await pool.end();
      await redis.quit();
      logger.info('✅ Graceful shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error('Shutdown error', { error: err.message });
      process.exit(1);
    }
  });

  // Force shutdown after 15s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 15000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
});

start();

module.exports = { app, io, server };
