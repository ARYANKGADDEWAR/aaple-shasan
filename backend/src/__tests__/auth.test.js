// src/__tests__/auth.test.js
const request = require('supertest');

// Mock dependencies before importing app
jest.mock('../config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn((cb) => cb({ query: jest.fn().mockResolvedValue({ rows: [] }) })),
  pool: { query: jest.fn().mockResolvedValue({ rows: [{ time: new Date() }] }), end: jest.fn() },
  healthCheck: jest.fn().mockResolvedValue({ time: new Date(), version: 'PostgreSQL 16' }),
}));

jest.mock('../config/redis', () => ({
  redis: {
    ping: jest.fn().mockResolvedValue('PONG'),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    quit: jest.fn(),
  },
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    exists: jest.fn().mockResolvedValue(0),
    isBlacklisted: jest.fn().mockResolvedValue(0),
    blacklistToken: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../services/emailService', () => ({
  sendOTPEmail: jest.fn().mockResolvedValue({}),
  sendWelcomeEmail: jest.fn().mockResolvedValue({}),
  sendProposalSubmittedEmail: jest.fn().mockResolvedValue({}),
  sendSanctionedEmail: jest.fn().mockResolvedValue({}),
  sendRevisionRequestedEmail: jest.fn().mockResolvedValue({}),
}));

jest.mock('../services/notificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue({}),
  getNotifications: jest.fn().mockResolvedValue({ notifications: [], unread_count: 0 }),
  markAsRead: jest.fn().mockResolvedValue({}),
  markAllAsRead: jest.fn().mockResolvedValue({}),
}));

const { query } = require('../config/database');
const { cache } = require('../config/redis');
const { app } = require('../server');

describe('Health Check', () => {
  it('GET /api/health should return 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Auth — OTP Registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject invalid phone number', async () => {
    const res = await request(app)
      .post('/api/auth/register/otp')
      .send({ phone: '123', full_name: 'Test User' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject missing full_name', async () => {
    const res = await request(app)
      .post('/api/auth/register/otp')
      .send({ phone: '9876543210' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should reject duplicate phone', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'existing-user-id' }] });
    const res = await request(app)
      .post('/api/auth/register/otp')
      .send({ phone: '9876543210', full_name: 'Test User' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('PHONE_EXISTS');
  });

  it('should send OTP for valid new registration', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // no existing user
      .mockResolvedValueOnce({ rows: [] }) // invalidate old OTPs
      .mockResolvedValueOnce({ rows: [{ id: 'otp-id' }] }); // insert OTP
    cache.set.mockResolvedValueOnce('OK');

    const res = await request(app)
      .post('/api/auth/register/otp')
      .send({ phone: '9876543210', full_name: 'Rahul Deshpande' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('Auth — Login', () => {
  it('should reject login with missing credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login/password')
      .send({ phone: '9876543210' });
    expect(res.status).toBe(400);
  });

  it('should reject invalid phone format', async () => {
    const res = await request(app)
      .post('/api/auth/login/otp')
      .send({ phone: 'notaphone' });
    expect(res.status).toBe(400);
  });

  it('should not reveal if user exists on OTP request', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // user not found
    const res = await request(app)
      .post('/api/auth/login/otp')
      .send({ phone: '9999999999' });
    expect(res.status).toBe(200); // always 200 for security
    expect(res.body.success).toBe(true);
  });
});

describe('Auth — Token', () => {
  it('should reject request without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('NO_TOKEN');
  });

  it('should reject malformed JWT', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });
});

describe('Security — Rate Limiting', () => {
  it('should expose correct security headers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBeTruthy();
  });
});

describe('Proposals — Validation', () => {
  it('should reject proposal without auth', async () => {
    const res = await request(app)
      .post('/api/proposals')
      .send({ title: 'Test', description: 'Test proposal', region: 'Nagpur' });
    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent proposal', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(app)
      .get('/api/proposals/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });
});
