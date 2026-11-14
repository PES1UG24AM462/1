/**
 * reportRoutes.js
 * Endpoints for attendance reports and CSV export.
 *
 * SAM-F-010 — Low attendance alerts
 * SAM-F-011 — Generate attendance reports
 * SAM-F-013 — Export attendance reports as CSV
 */

const { Router } = require('express');
const { authorise } = require('../middleware/authMiddleware');
const {
  getReportClasses,
  getReportStudents,
  getAttendanceReport,
  getLowAttendanceReport,
  exportAttendanceCsv,
} = require('../controllers/reportController');

const router = Router();

router.get('/classes',           authorise('faculty', 'admin'), getReportClasses);
router.get('/students',          authorise('faculty', 'admin'), getReportStudents);
router.get('/attendance',        authorise('faculty', 'admin'), getAttendanceReport);

// SAM-F-013: CSV export — must be registered BEFORE /attendance so Express
// doesn't confuse /attendance/export with /attendance/:id
router.get('/attendance/export', authorise('faculty', 'admin'), exportAttendanceCsv);

router.get('/low-attendance',    authorise('faculty', 'admin'), getLowAttendanceReport);

module.exports = router;
