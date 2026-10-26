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

/**
 * List all accounts (never includes password hashes). SAM-F-014.
 * @returns {Promise<Object[]>}
 */
async function listUsers() {
  const [rows] = await pool.execute(
    `SELECT u.user_id, u.username, u.role, u.full_name, u.email, u.is_active, u.created_at,
            s.usn
     FROM users u
     LEFT JOIN students s ON s.user_id = u.user_id
     ORDER BY u.user_id`
  );
  return rows;
}

/**
 * Create an account plus its student/faculty profile row in one transaction. SAM-F-014.
 * Rethrows the original MySQL error (code ER_DUP_ENTRY) for duplicate usernames or USNs.
 *
 * @param {Object} p - { username, passwordHash, role, fullName, email, usn, department, semester }
 * @returns {Promise<number>} the new user_id
 */
async function createUser({ username, passwordHash, role, fullName, email = null, usn = null, department = null, semester = null }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO users (username, password_hash, role, full_name, email, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [username, passwordHash, role, fullName, email]
    );
    const userId = result.insertId;
    if (role === 'student') {
      await conn.execute(
        `INSERT INTO students (user_id, usn, department, semester) VALUES (?, ?, ?, ?)`,
        [userId, usn, department, semester]
      );
    } else if (role === 'faculty') {
      await conn.execute(
        `INSERT INTO faculty (user_id, department) VALUES (?, ?)`,
        [userId, department]
      );
    }
    await conn.commit();
    return userId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Update editable account fields. Only the listed columns can be changed. SAM-F-014.
 *
 * @param {number} userId
 * @param {Object} fields - any of { fullName, email, isActive, passwordHash }
 * @returns {Promise<boolean>} true if a row was updated
 */
async function updateUser(userId, { fullName, email, isActive, passwordHash }) {
  const sets = [];
  const values = [];
  if (fullName !== undefined) { sets.push('full_name = ?'); values.push(fullName); }
  if (email !== undefined) { sets.push('email = ?'); values.push(email); }
  if (isActive !== undefined) { sets.push('is_active = ?'); values.push(isActive ? 1 : 0); }
  if (passwordHash !== undefined) { sets.push('password_hash = ?'); values.push(passwordHash); }
  if (sets.length === 0) return false;
  values.push(userId);
  const [result] = await pool.execute(`UPDATE users SET ${sets.join(', ')} WHERE user_id = ?`, values);
  return result.affectedRows > 0;
}

module.exports = { findByUsername, findById, listUsers, createUser, updateUser };
