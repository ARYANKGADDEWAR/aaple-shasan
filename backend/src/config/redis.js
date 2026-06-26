// src/config/redis.js
const logger = require('./logger');

const redis = {
  on: () => {},
  get: async () => null,
  set: async () => null,
  del: async () => null,
  exists: async () => 0,
  incr: async () => 1,
  expire: async () => null,
  hset: async () => null,
  hget: async () => null,
};

logger.warn('Redis disabled for deployment');

const cache = {
  async get(key) {
    return null;
  },
  async set(key, value, ttlSeconds = 3600) {
    return null;
  },
  async del(key) {
    return null;
  },
  async exists(key) {
    return 0;
  },
  async incr(key) {
    return 1;
  },
  async expire(key, ttl) {
    return null;
  },
  async setWithExpiry(key, value, ttlSeconds) {
    return null;
  },
  async hset(key, field, value) {
    return null;
  },
  async hget(key, field) {
    return null;
  },
  async blacklistToken(jti, ttlSeconds) {
    return null;
  },
  async isBlacklisted(jti) {
    return 0;
  },
};

module.exports = { redis, cache };