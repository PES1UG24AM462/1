/**
 * attendanceRoutes.js
 *
 * POST /api/attendance  — Submit attendance marks (SAM-F-005, TC-ATT-02)
 * GET  /api/attendance  — Fetch existing session attendance (for pre-fill)
 *
 * Both routes are faculty-only (authenticate + authorise('faculty')).
 */

const { Router } = require('express');
const { authenticate, authorise } = require('../middleware/authMiddleware');
const { submitAttendance, getSessionAttendance } = require('../controllers/attendanceController');

const router = Router();

// SAM-F-005 / SAM-F-007: mark a class session or correct identified existing rows.
router.post('/', authenticate, authorise('faculty'), submitAttendance);

// Pre-fill support: fetch existing attendance for a session
router.get('/', authenticate, authorise('faculty'), getSessionAttendance);

module.exports = router;
