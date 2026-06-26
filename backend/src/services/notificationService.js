// src/services/notificationService.js
const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * Send notification to a specific user or all admins of a dept
 */
async function sendNotification(userId, type, title, body, data = {}, adminDept = null) {
  try {
    if (userId) {
      await query(
        'INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)',
        [userId, type, title, body, JSON.stringify(data)]
      );
    }

    // If adminDept, notify all admins of that dept
    if (adminDept) {
      const admins = await query(
        `SELECT id FROM users WHERE role IN ('admin','superadmin') AND dept = $1 AND is_active = TRUE`,
        [adminDept]
      );
      for (const admin of admins.rows) {
        await query(
          'INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1, $2, $3, $4, $5)',
          [admin.id, type, title, body, JSON.stringify(data)]
        );
      }
    }
  } catch (err) {
    logger.error('Notification send error', { error: err.message });
  }
}

async function getNotifications(userId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const result = await query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  const count = await query('SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND read = FALSE', [userId]);
  return { notifications: result.rows, unread_count: parseInt(count.rows[0].count) };
}

async function markAsRead(userId, notificationId) {
  await query(
    'UPDATE notifications SET read = TRUE, read_at = NOW() WHERE id = $1 AND user_id = $2',
    [notificationId, userId]
  );
}

async function markAllAsRead(userId) {
  await query(
    "UPDATE notifications SET read = TRUE, read_at = NOW() WHERE user_id = $1 AND read = FALSE",
    [userId]
  );
}

module.exports = { sendNotification, getNotifications, markAsRead, markAllAsRead };
