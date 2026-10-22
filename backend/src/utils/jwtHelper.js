/**
 * jwtHelper.js
 * Thin wrapper around jsonwebtoken for generating and verifying JWTs.
 *
 * SAM-NF-003 / SAM-SR-001: All authenticated communication uses HTTPS/TLS.
 *   JWT tokens are signed with HS256; the secret must be at least 64 chars
 *   and stored in an environment variable (never in source code).
 */

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

if (!SECRET || SECRET.length < 32) {
  console.error('[JWT] JWT_SECRET is missing or too short. Set a strong secret in .env');
  process.exit(1);
}

/**
 * Generate a signed JWT for an authenticated user.
 *
 * @param {Object} payload  - { userId, username, role }
 * @returns {string}         - signed JWT string
 */
function generateToken(payload) {
  return jwt.sign(payload, SECRET, {
    algorithm: 'HS256',
    expiresIn: EXPIRES_IN,
    issuer: 'sams-api',
  });
}

/**
 * Verify and decode a JWT string.
 *
 * @param {string} token
 * @returns {Object} decoded payload
 * @throws {JsonWebTokenError | TokenExpiredError}
 */
function verifyToken(token) {
  return jwt.verify(token, SECRET, { algorithms: ['HS256'], issuer: 'sams-api' });
}

module.exports = { generateToken, verifyToken };
