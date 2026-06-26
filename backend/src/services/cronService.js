// src/services/cronService.js
const cron = require('node-cron');
const { query } = require('../config/database');
const { redis } = require('../config/redis');
const logger = require('../config/logger');

/**
 * All scheduled background jobs for Aaple Shasan
 */
function startCronJobs() {
  // ── Every 5 minutes: expire used/old OTPs ────────────────────────────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const result = await query(
        "DELETE FROM otps WHERE expires_at < NOW() OR (used = TRUE AND created_at < NOW() - INTERVAL '1 hour')"
      );
      if (result.rowCount > 0) {
        logger.debug(`[Cron] Cleaned ${result.rowCount} expired OTPs`);
      }
    } catch (err) {
      logger.error('[Cron] OTP cleanup failed', { error: err.message });
    }
  });

  // ── Every 30 minutes: revoke expired refresh tokens ────────────────────────────
  cron.schedule('*/30 * * * *', async () => {
    try {
      const result = await query(
        "DELETE FROM refresh_tokens WHERE expires_at < NOW() OR (revoked = TRUE AND revoked_at < NOW() - INTERVAL '7 days')"
      );
      if (result.rowCount > 0) {
        logger.debug(`[Cron] Cleaned ${result.rowCount} expired refresh tokens`);
      }
    } catch (err) {
      logger.error('[Cron] Refresh token cleanup failed', { error: err.message });
    }
  });

  // ── Hourly: update proposal thresholds (belt-and-suspenders besides trigger) ──
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await query(`
        UPDATE proposals
        SET threshold_met = TRUE,
            threshold_met_at = NOW(),
            status = CASE WHEN status = 'ai_routed' THEN 'dossier_compiled' ELSE status END
        WHERE upvote_count >= vote_threshold
          AND threshold_met = FALSE
          AND deleted_at IS NULL
      `);
      if (result.rowCount > 0) {
        logger.info(`[Cron] Updated ${result.rowCount} proposals to threshold_met`);
      }
    } catch (err) {
      logger.error('[Cron] Threshold update failed', { error: err.message });
    }
  });

  // ── Daily at midnight: purge old audit logs (keep 90 days) ────────────────────────────
  cron.schedule('0 0 * * *', async () => {
    try {
      const result = await query(
        "DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '90 days'"
      );
      logger.info(`[Cron] Purged ${result.rowCount} old audit logs`);
    } catch (err) {
      logger.error('[Cron] Audit log purge failed', { error: err.message });
    }
  });

  // ── Daily at 2am: purge old rate limit logs ────────────────────────────
  cron.schedule('0 2 * * *', async () => {
    try {
      const result = await query(
        "DELETE FROM rate_limit_log WHERE triggered_at < NOW() - INTERVAL '7 days'"
      );
      logger.debug(`[Cron] Purged ${result.rowCount} old rate limit records`);
    } catch (err) {
      logger.error('[Cron] Rate limit log purge failed', { error: err.message });
    }
  });

  // ── Every 6 hours: unlock accounts locked for > 24 hours ────────────────────────────
  cron.schedule('0 */6 * * *', async () => {
    try {
      const result = await query(`
        UPDATE users
        SET is_locked = FALSE, failed_login_attempts = 0
        WHERE is_locked = TRUE
          AND last_login_at < NOW() - INTERVAL '24 hours'
      `);
      if (result.rowCount > 0) {
        logger.info(`[Cron] Auto-unlocked ${result.rowCount} accounts after 24h`);
      }
    } catch (err) {
      logger.error('[Cron] Account unlock failed', { error: err.message });
    }
  });

  // ── Every 15 minutes: process pending DBT transactions ────────────────────────────
  cron.schedule('*/15 * * * *', async () => {
    try {
      const pending = await query(`
        SELECT dt.*, u.email, u.full_name, p.title as proposal_title, p.ref_number
        FROM dbt_transactions dt
        JOIN users u ON u.id = dt.user_id
        LEFT JOIN proposals p ON p.id = dt.proposal_id
        WHERE dt.status = 'processing'
          AND dt.initiated_at < NOW() - INTERVAL '2 minutes'
        LIMIT 10
      `);

      for (const tx of pending.rows) {
        try {
          // In production: call PFMS/DBT API here
          // For demo: mark as credited after delay
          const pfmsRef = `PFMS-${Date.now()}-${Math.random().toString(36).slice(-6).toUpperCase()}`;

          await query(`
            UPDATE dbt_transactions
            SET status = 'credited', credited_at = NOW(), pfms_ref = $1
            WHERE id = $2
          `, [pfmsRef, tx.id]);

          logger.info('[Cron] DBT transaction credited', {
            txId: tx.id,
            userId: tx.user_id,
            amount: tx.amount,
            pfmsRef,
          });

          // Send email confirmation
          if (tx.email) {
            const { sendEmail } = require('./emailService');
            // Email sent asynchronously
          }
        } catch (txErr) {
          await query(
            "UPDATE dbt_transactions SET status = 'failed', failed_at = NOW(), failure_reason = $1 WHERE id = $2",
            [txErr.message, tx.id]
          );
          logger.error('[Cron] DBT transaction failed', { txId: tx.id, error: txErr.message });
        }
      }
    } catch (err) {
      logger.error('[Cron] DBT processing failed', { error: err.message });
    }
  });

  // ── Every 5 minutes: warm system config cache ────────────────────────────
  cron.schedule('*/5 * * * *', async () => {
    try {
      const configResult = await query('SELECT key, value FROM system_config');
      const { cache } = require('../config/redis');
      for (const row of configResult.rows) {
        await cache.set(`config:${row.key}`, row.value, 600);
      }
    } catch (err) {
      logger.error('[Cron] Config cache warm failed', { error: err.message });
    }
  });

  logger.info('[Cron] All scheduled jobs started');
}

module.exports = { startCronJobs };
