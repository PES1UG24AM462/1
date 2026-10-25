/**
 * authMiddleware.js
 * Express middleware for JWT-based authentication and role-based access control.
 *
 * SAM-F-002 — Enforce RBAC for students, faculty, and administrators (TC-AUTH-02).
 * SAM-SR-003 — Authorise every protected API operation server-side.
 */

const { verifyToken } = require('../utils/jwtHelper');
const userModel = require('../models/userModel');

/**
 * authenticate
 * Validates the Bearer JWT in the Authorization header, then re-reads the account
 * from the database so that deactivated accounts and role changes take effect
 * immediately (SAM-F-002) instead of waiting for the token to expire.
 * On success, attaches { userId, username, role } to req.user.
 *
 * @middleware
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication token is required.' });
  }

  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session has expired. Please sign in again.' });
    }
    return res.status(401).json({ message: 'Invalid authentication token.' });
  }

  try {
    const account = await userModel.findById(decoded.userId);
    if (!account || !account.is_active) {
      return res.status(401).json({ message: 'Account is not active. Please sign in again.' });
    }
    // The role comes from the database, never from the token alone.
    req.user = {
      userId: account.user_id,
      username: account.username,
      role: account.role,
      fullName: account.full_name,
    };
    return next();
  } catch (err) {
    console.error('[Auth] Account lookup failed:', err.message);
    return res.status(500).json({ message: 'An internal server error occurred. Please try again.' });
  }
}

/**
 * authorise(...allowedRoles)
 * Factory that returns a middleware which checks req.user.role
 * against the provided list of allowed roles.
 *
 * Usage: router.get('/admin-only', authenticate, authorise('admin'), handler)
 *
 * @param {...string} allowedRoles  - e.g. 'admin', 'faculty', 'student'
 * @returns {Function} Express middleware
 */
function authorise(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      // SAM-SR-003: return 403 without revealing what roles are allowed
      return res.status(403).json({ message: 'Access denied. You do not have permission.' });
    }
    next();
  };
}

module.exports = { authenticate, authorise };
