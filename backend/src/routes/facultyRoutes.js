const { Router } = require('express');
const { authenticate, authorise } = require('../middleware/authMiddleware');
const { getAssignedClasses, getClassRoster } = require('../controllers/facultyController');

const router = Router();

router.get('/classes', authenticate, authorise('faculty'), getAssignedClasses);
router.get('/classes/:classId/roster', authenticate, authorise('faculty'), getClassRoster);

module.exports = router;
