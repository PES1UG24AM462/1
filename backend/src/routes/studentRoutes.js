const { Router } = require('express');
const { authenticate, authorise } = require('../middleware/authMiddleware');
const { getAttendanceHistory, getEnrolledCourses } = require('../controllers/studentController');

const router = Router();

router.get('/courses', authenticate, authorise('student'), getEnrolledCourses);
router.get('/attendance/history', authenticate, authorise('student'), getAttendanceHistory);

module.exports = router;
