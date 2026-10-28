const { Router } = require('express');
const { authorise } = require('../middleware/authMiddleware');
const { getAttendanceHistory, getEnrolledCourses } = require('../controllers/studentController');

const router = Router();

router.get('/courses', authorise('student'), getEnrolledCourses);
router.get('/attendance/history', authorise('student'), getAttendanceHistory);

module.exports = router;
