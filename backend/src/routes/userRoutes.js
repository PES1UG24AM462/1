/**
 * userRoutes.js
 * Admin-only account management (SAM-F-014). authenticate runs globally (SAM-SR-003);
 * authorise('admin') restricts every route here to administrators (SAM-F-002).
 */

const { Router } = require('express');
const { authorise } = require('../middleware/authMiddleware');
const { listUsers, createUser, updateUser } = require('../controllers/userController');

const router = Router();

router.use(authorise('admin'));
router.get('/', listUsers);
router.post('/', createUser);
router.patch('/:id', updateUser);

module.exports = router;
