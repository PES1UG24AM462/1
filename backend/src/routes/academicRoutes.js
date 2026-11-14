/** Administrator-only routes for SAM-F-015. */

const { Router } = require('express');
const { authorise } = require('../middleware/authMiddleware');
const academicController = require('../controllers/academicController');

const router = Router();
router.use(authorise('admin'));

router.get('/courses', academicController.listCourses);
router.get('/courses/:courseId', academicController.getCourse);
router.post('/courses', academicController.createCourse);
router.patch('/courses/:courseId', academicController.updateCourse);

router.get('/classes', academicController.listClasses);
router.get('/classes/:classId', academicController.getClass);
router.post('/classes', academicController.createClass);
router.patch('/classes/:classId', academicController.updateClass);
router.get('/classes/:classId/enrollments', academicController.listClassEnrollments);
router.post('/classes/:classId/enrollments', academicController.enrollStudent);

router.get('/faculty', academicController.listFaculty);
router.get('/students', academicController.listStudents);

module.exports = router;
