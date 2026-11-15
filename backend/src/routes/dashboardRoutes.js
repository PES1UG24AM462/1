/**
 * dashboardRoutes.js
 * SAM-F-017 — Dashboard attendance summary endpoint.
 *
 * GET /api/dashboard/summary
 *   Accessible by all authenticated roles (admin, faculty, student).
 *   Returns role-scoped summary data.
 */

const { Router } = require('express');
const { authorise } = require('../middleware/authMiddleware');
const { getDashboardSummary } = require('../controllers/dashboardController');

const router = Router();

// All three roles can access their own summary
router.get('/summary', authorise('admin', 'faculty', 'student'), getDashboardSummary);

module.exports = router;
