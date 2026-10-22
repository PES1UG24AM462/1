/**
 * userModel.js
 * Data-access functions for the `users` table.
 *
 * SAM-SR-002: Passwords are stored only as salted bcrypt hashes.
 *             This model NEVER returns the password_hash to callers
 *             except the dedicated verifyPassword helper below.
 */

const { pool } = require('../config/database');

/**
 * Find a user by their username.
 * Returns the full row (including password_hash) for internal authentication use ONLY.
 * Controllers must NOT forward password_hash to clients.
 *
 * @param {string} username
 * @returns {Promise<Object|null>} user row or null
 */
async function findByUsername(username) {
  const [rows] = await pool.execute(
    `SELECT
       user_id,
       username,
       password_hash,
       role,
       is_active,
       full_name
     FROM users
     WHERE username = ?
     LIMIT 1`,
    [username]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Find a user by their primary key (user_id).
 * Does NOT include password_hash — safe for general use.
 *
 * @param {number} userId
 * @returns {Promise<Object|null>}
 */
async function findById(userId) {
  const [rows] = await pool.execute(
    `SELECT user_id, username, role, is_active, full_name
     FROM users
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );
  return rows.length > 0 ? rows[0] : null;
}

module.exports = { findByUsername, findById };
