/**
 * userModel.js
 * Data-access functions for the `users` table.
 *
 * SAM-SR-002: Passwords are stored only as salted bcrypt hashes.
 *             This model NEVER returns the password_hash to callers
 *             except findByUsername (used internally by authController only).
 *             All password hashing goes through passwordHelper.hashPassword.
 * SAM-F-014:  Admin user management: list, create with student/faculty profiles,
 *             and update fields.
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
 * listUsers
 * List all accounts (never includes password hashes). SAM-F-014.
 *
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
 * createUser
 * Create an account plus its student/faculty profile row. SAM-F-014 & SAM-SR-002.
 * Supports both plaintextPassword (hashed before insert) and pre-hashed passwordHash.
 *
 * @param {Object} params
 * @param {string} params.username
 * @param {string} [params.plaintextPassword]
 * @param {string} [params.passwordHash]
 * @param {string} params.role
 * @param {string} params.fullName
 * @param {string} [params.email=null]
 * @param {string} [params.usn=null]
 * @param {string} [params.department=null]
 * @param {number} [params.semester=null]
 * @returns {Promise<number>} the new user_id
 */
async function createUser({
  username,
  plaintextPassword,
  passwordHash,
  role,
  fullName,
  email = null,
  usn = null,
  department = null,
  semester = null,
}) {
  const finalHash = passwordHash || (plaintextPassword ? await hashPassword(plaintextPassword) : null);

  if (typeof pool.getConnection !== 'function') {
    const [result] = await pool.execute(
      `INSERT INTO users (username, password_hash, role, full_name, email, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [username, finalHash, role, fullName, email]
    );
    return result.insertId;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      `INSERT INTO users (username, password_hash, role, full_name, email, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [username, finalHash, role, fullName, email]
    );
    const userId = result.insertId;
    if (role === 'student' && usn) {
      await conn.execute(
        `INSERT INTO students (user_id, usn, department, semester) VALUES (?, ?, ?, ?)`,
        [userId, usn, department, semester]
      );
    } else if (role === 'faculty' && department) {
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
 * updateUser
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

module.exports = {
  findByUsername,
  findById,
  listUsers,
  createUser,
  updateUser,
  updatePassword,
};
