// src/config/database.js
const { Pool } = require('pg');
const logger = require('./logger');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT) || 5432,
  database: process.env.POSTGRES_DB || 'aapleshasan',
  user: process.env.POSTGRES_USER || 'aapleshasan_user',
  password: process.env.POSTGRES_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New PostgreSQL client connected');
});

/**
 * Execute a parameterized query safely
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn('Slow query detected', { text: text.slice(0, 100), duration });
    }
    return res;
  } catch (err) {
    logger.error('Database query error', { error: err.message, query: text.slice(0, 100) });
    throw err;
  }
}

/**
 * Execute within a transaction
 */
async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function healthCheck() {
  const result = await query('SELECT NOW() as time, version() as version');
  return result.rows[0];
}

module.exports = { query, transaction, pool, healthCheck };
