const { Router } = require('express');
const { authorise } = require('../middleware/authMiddleware');
const { listAuditEvents } = require('../controllers/auditController');

const router = Router();

// Authentication is applied to all /api routes in server.js.
router.use(authorise('admin'));
router.get('/', listAuditEvents);

module.exports = router;
