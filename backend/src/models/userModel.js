/**
 * userModel.js
 * Data-access functions for the `users` table.
 *
 * SAM-SR-002: Passwords are stored only as salted bcrypt hashes.
 *             This model NEVER returns the password_hash to callers
 *             except findByUsername (used internally by authController only).
 *             All password hashing goes through passwordHelper.hashPassword.
 */

const { pool } = require('../config/database');
const { hashPassword } = require('../utils/passwordHelper');

/**
 * findByUsername
 * Returns the full row including password_hash — for authController ONLY.
 * No other module should use the returned password_hash value.
 *
 * @param {string} username
 * @returns {Promise<Object|null>}
 */
async function findByUsername(username) {
  const [rows] = await pool.execute(
    `SELECT user_id, username, password_hash, role, is_active, full_name
     FROM users
     WHERE username = ?
     LIMIT 1`,
    [username]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * findById
 * Safe for general use — does NOT include password_hash.
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

/**
 * createUser
 * Inserts a new user with a bcrypt-hashed password (SAM-SR-002).
 * The plaintext password is hashed here and immediately discarded —
 * it is never written to the database or to any log.
 *
 * @param {Object} params
 * @param {string} params.username
 * @param {string} params.plaintextPassword  - hashed before INSERT; never stored raw
 * @param {string} params.role               - 'student' | 'faculty' | 'admin'
 * @param {string} params.fullName
 * @param {string} [params.email]
 * @returns {Promise<number>}  insertId of the new user row
 */
async function createUser({ username, plaintextPassword, role, fullName, email = null }) {
  // Hash the password — the plaintext never reaches the DB (SAM-SR-002)
  const passwordHash = await hashPassword(plaintextPassword);

  const [result] = await pool.execute(
    `INSERT INTO users (username, password_hash, role, full_name, email, is_active)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [username, passwordHash, role, fullName, email]
  );
  return result.insertId;
}

/**
 * updatePassword
 * Replaces a user's password hash with a new bcrypt hash.
 * Used for password-reset flows — plaintext never stored (SAM-SR-002).
 *
 * @param {number} userId
 * @param {string} newPlaintextPassword
 * @returns {Promise<void>}
 */
async function updatePassword(userId, newPlaintextPassword) {
  const newHash = await hashPassword(newPlaintextPassword);
  await pool.execute(
    `UPDATE users SET password_hash = ?, updated_at = UTC_TIMESTAMP()
     WHERE user_id = ?`,
    [newHash, userId]
  );
}

module.exports = { findByUsername, findById, createUser, updatePassword };
