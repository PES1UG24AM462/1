/**
 * authRoutes.js
 * Mounts authentication endpoints.
 *
 * POST /api/auth/login  — SAM-F-001 (TC-AUTH-01)
 *
 * Rate-limiting is applied here to mitigate brute-force attacks
 * per the STRIDE DoS threat analysis in the SAD.
 */

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { login } = require('../controllers/authController');

const router = Router();

// Rate limiter: max 10 login attempts per 15-minute window per IP
const loginLimiter = rateLimit({
  windowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many login attempts. Please try again in 15 minutes.',
  },
  skipSuccessfulRequests: true, // count only failed attempts toward the limit
});

/**
 * @route  POST /api/auth/login
 * @desc   Authenticate user with username and password (SAM-F-001)
 * @access Public
 */
router.post('/login', loginLimiter, login);

module.exports = router;
