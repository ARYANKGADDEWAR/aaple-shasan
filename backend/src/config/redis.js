// src/config/redis.js
const Redis = require('ioredis');
const logger = require('./logger');

let redisConfig;

if (process.env.REDIS_URL) {
  redisConfig = process.env.REDIS_URL; // rediss://default:password@host:6379
} else {
  redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_HOST?.includes('upstash.io') ? {} : undefined,
  };
}

const redis = new Redis(redisConfig, {
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    logger.warn(`Redis reconnecting... attempt ${times}`);
    return delay;
  },
  maxRetriesPerRequest: null,
  lazyConnect: false,
  enableReadyCheck: false,
  keyPrefix: 'as:',
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('ready', () => logger.info('Redis ready'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
redis.on('close', () => logger.warn('Redis connection closed'));

const cache = {
  async get(key) {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  },
  async set(key, value, ttlSeconds = 3600) {
    return redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  },
  async del(key) {
    return redis.del(key);
  },
  async exists(key) {
    return redis.exists(key);
  },
  async incr(key) {
    return redis.incr(key);
  },
  async expire(key, ttl) {
    return redis.expire(key, ttl);
  },
  async setWithExpiry(key, value, ttlSeconds) {
    return redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  },
  async hset(key, field, value) {
    return redis.hset(key, field, JSON.stringify(value));
  },
  async hget(key, field) {
    const val = await redis.hget(key, field);
    return val ? JSON.parse(val) : null;
  },
  async blacklistToken(jti, ttlSeconds) {
    return redis.set(`blacklist:${jti}`, '1', 'EX', ttlSeconds);
  },
  async isBlacklisted(jti) {
    return redis.exists(`blacklist:${jti}`);
  },
};

module.exports = { redis, cache };