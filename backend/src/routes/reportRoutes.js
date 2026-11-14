/**
 * Endpoints for attendance reports and low-attendance alerts.
 */

const { Router } = require('express');
const { authorise } = require('../middleware/authMiddleware');
const {
  getReportClasses,
  getAttendanceReport,
  getLowAttendanceReport,
} = require('../controllers/reportController');

const router = Router();

router.get('/classes', authorise('faculty', 'admin'), getReportClasses);
router.get('/attendance', authorise('faculty', 'admin'), getAttendanceReport);
router.get('/low-attendance', authorise('faculty', 'admin'), getLowAttendanceReport);

module.exports = router;
