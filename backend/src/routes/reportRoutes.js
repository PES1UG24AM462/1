/**
 * reportRoutes.js
 * Endpoints for attendance reporting and threshold alerts (SAM-F-010, TC-REP-02).
 *
 *   GET /api/reports/low-attendance?classId=X&threshold=75  → faculty or admin
 */

const { Router } = require('express');
const { authorise } = require('../middleware/authMiddleware');
const { getLowAttendanceReport } = require('../controllers/reportController');

const router = Router();

// SAM-F-010: Flag students below attendance threshold (faculty and admin)
router.get('/low-attendance', authorise('faculty', 'admin'), getLowAttendanceReport);

module.exports = router;
