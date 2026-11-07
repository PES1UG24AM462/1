const { Router } = require('express');
const { authorise } = require('../middleware/authMiddleware');
const { getAttendanceHistory, getEnrolledCourses } = require('../controllers/studentController');
const { getAttendancePercentage } = require('../controllers/percentageController');

const router = Router();

router.get('/courses', authorise('student'), getEnrolledCourses);
router.get('/attendance/history', authorise('student'), getAttendanceHistory);

// SAM-F-009: GET /api/student/attendance/percentage
router.get('/attendance/percentage', authorise('student'), getAttendancePercentage);

module.exports = router;
