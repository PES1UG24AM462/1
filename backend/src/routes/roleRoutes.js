/**
 * roleRoutes.js
 * Role-gated endpoints that demonstrate and test RBAC (SAM-F-002, TC-AUTH-02).
 *
 *   GET /api/admin/ping    → admin only
 *   GET /api/faculty/ping  → faculty only
 *   GET /api/student/ping  → student only
 *
 * Real feature routes in later sprints use the same pattern:
 *   router.get('/x', authorise('faculty'), handler)
 */

const { Router } = require('express');
const { authorise } = require('../middleware/authMiddleware');

const router = Router();

function ping(role) {
  return (req, res) => res.status(200).json({ message: `Welcome, ${role}.`, role: req.user.role });
}

router.get('/admin/ping', authorise('admin'), ping('admin'));
router.get('/faculty/ping', authorise('faculty'), ping('faculty'));
router.get('/student/ping', authorise('student'), ping('student'));

module.exports = router;
