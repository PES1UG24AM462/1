/**
 * passwordHelper.js
 * Centralised password hashing and verification utility.
 *
 * SAM-SR-002 — Passwords shall be stored only as salted, one-way bcrypt hashes.
 *              Plaintext passwords must NEVER be stored, logged, or returned.
 *
 * TC-SEC-02 test cases verified here:
 *   - hashPassword produces a bcrypt hash (starts with $2a$ or $2b$)
 *   - Two hashes of the same password are different (unique salts)
 *   - verifyPassword returns true for the correct password
 *   - verifyPassword returns false for a wrong password
 *   - Plaintext is never present in the stored hash string
 *
 * Cost factor: 12 in production (OWASP recommended minimum for bcrypt).
 *              Tests may override via BCRYPT_ROUNDS env var for speed.
 */

const bcrypt = require('bcryptjs');

// Cost factor — higher = slower brute-force, but more CPU per login.
// OWASP recommends ≥10; we default to 12 for production.
const SALT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS, 10) || 12;

/**
 * hashPassword
 * Hashes a plaintext password with a unique bcrypt salt.
 * The salt is embedded in the returned hash string — no separate storage needed.
 *
 * @param {string} plaintext  - The password to hash (must be non-empty string)
 * @returns {Promise<string>} - bcrypt hash string, e.g. "$2a$12$..."
 * @throws {Error} if plaintext is not a non-empty string
 */
async function hashPassword(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Password must be a non-empty string.');
  }
  // bcrypt.genSalt generates a cryptographically random salt automatically.
  // The salt is included in the hash output — we never store it separately.
  const hash = await bcrypt.hash(plaintext, SALT_ROUNDS);
  return hash;
}

/**
 * verifyPassword
 * Constant-time comparison of a plaintext password against a stored bcrypt hash.
 * Uses bcrypt.compare which is safe against timing attacks.
 *
 * @param {string} plaintext   - The candidate password to check
 * @param {string} storedHash  - The bcrypt hash from the database
 * @returns {Promise<boolean>} - true if the password matches, false otherwise
 */
async function verifyPassword(plaintext, storedHash) {
  if (typeof plaintext !== 'string' || typeof storedHash !== 'string') {
    return false;
  }
  return bcrypt.compare(plaintext, storedHash);
}

module.exports = { hashPassword, verifyPassword, SALT_ROUNDS };
