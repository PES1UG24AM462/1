/**
 * jwtHelper.js
 * Thin wrapper around jsonwebtoken for generating and verifying JWTs.
 *
 * SAM-NF-003 / SAM-SR-001: All authenticated communication uses HTTPS/TLS.
 *   JWT tokens are signed with HS256; the secret must be at least 64 chars
 *   and stored in an environment variable (never in source code).
 */

const jwt = require('jsonwebtoken');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    const err = new Error('JWT_SECRET must be set to at least 32 characters before authentication is used.');
    err.code = 'INVALID_JWT_CONFIGURATION';
    throw err;
  }
  return secret;
}

/**
 * Generate a signed JWT for an authenticated user.
 *
 * @param {Object} payload  - { userId, username, role }
 * @returns {string}         - signed JWT string
 */
function generateToken(payload) {
  return jwt.sign(payload, getSecret(), {
    algorithm: 'HS256',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
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
  return jwt.verify(token, getSecret(), { algorithms: ['HS256'], issuer: 'sams-api' });
}

module.exports = { generateToken, verifyToken };
