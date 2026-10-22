/**
 * authMiddleware.js
 * Express middleware for JWT-based authentication and role-based access control.
 *
 * SAM-F-002 — Enforce RBAC for students, faculty, and administrators (TC-AUTH-02).
 * SAM-SR-003 — Authorise every protected API operation server-side.
 */

const { verifyToken } = require('../utils/jwtHelper');

/**
 * authenticate
 * Validates the Bearer JWT in the Authorization header.
 * On success, attaches the decoded payload to req.user.
 *
 * @middleware
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authentication token is required.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = verifyToken(token);
    req.user = decoded; // { userId, username, role, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session has expired. Please sign in again.' });
    }
    return res.status(401).json({ message: 'Invalid authentication token.' });
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
