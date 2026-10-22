/**
 * authController.js
 * Handles POST /api/auth/login (SAM-F-001).
 *
 * Requirements covered:
 *   SAM-F-001  — Authenticate users with username + password
 *   SAM-SR-002 — Passwords verified against salted bcrypt hash; never logged
 *   SAM-SR-004 — Log LOGIN_SUCCESS and LOGIN_FAILURE to audit_log
 *   SAM-NF-003 / SAM-SR-001 — HTTPS enforced at server/proxy level
 *
 * TC-AUTH-01: Valid credentials → 200 { token, role }
 * TC-AUTH-01: Invalid credentials → 401 { message: 'Invalid username or password.' }
 */

const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const auditModel = require('../models/auditModel');
const { generateToken } = require('../utils/jwtHelper');

/**
 * Login handler.
 * Accepts { username, password } in the request body.
 * Returns { token, role } on success.
 *
 * @route  POST /api/auth/login
 * @access Public
 */
async function login(req, res) {
  // Extract and sanitise inputs
  const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  // Basic presence validation — avoid leaking field details in error messages
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  // Derive a safe client identifier for audit logging (IP address)
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

  try {
    // 1. Look up the user
    const user = await userModel.findByUsername(username);

    // 2. User not found — use a generic error to prevent username enumeration
    if (!user) {
      // SAM-SR-004: record the failed attempt
      await auditModel.logEvent({
        actor: null,
        action: 'LOGIN_FAILURE',
        target: `users/${username}`,
        ipAddress: clientIp,
        details: 'Username not found',
      });
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    // 3. Account must be active
    if (!user.is_active) {
      await auditModel.logEvent({
        actor: username,
        action: 'LOGIN_FAILURE',
        target: `users/${user.user_id}`,
        ipAddress: clientIp,
        details: 'Account is deactivated',
      });
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    // 4. Verify password against bcrypt hash (SAM-SR-002)
    //    bcrypt.compare does constant-time comparison to prevent timing attacks.
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      // SAM-SR-004: log failure — do NOT log the attempted password
      await auditModel.logEvent({
        actor: username,
        action: 'LOGIN_FAILURE',
        target: `users/${user.user_id}`,
        ipAddress: clientIp,
        details: 'Incorrect password',
      });
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    // 5. Credentials are valid — generate JWT (SAM-F-001 AC: session established)
    const token = generateToken({
      userId: user.user_id,
      username: user.username,
      role: user.role,
    });

    // SAM-SR-004: record the successful login
    await auditModel.logEvent({
      actor: user.username,
      action: 'LOGIN_SUCCESS',
      target: `users/${user.user_id}`,
      ipAddress: clientIp,
      details: null,
    });

    // 6. Return token and role to the client
    //    DO NOT return password_hash or any other sensitive field.
    return res.status(200).json({
      token,
      role: user.role,
      userId: user.user_id,
      fullName: user.full_name,
    });
  } catch (err) {
    // Unexpected server error — do not leak internal details to the client
    console.error('[Auth] Unexpected login error:', err.message);
    return res.status(500).json({ message: 'An internal server error occurred. Please try again.' });
  }
}

module.exports = { login };
