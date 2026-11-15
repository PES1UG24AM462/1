/**
 * dbHealthRoutes.js
 * SAM-NF-004 — Database integrity health check endpoint.
 *
 * GET /api/admin/db/health
 *   Returns the result of all integrity checks.
 *   Admin-only (SAM-SR-003).
 *   Used after a restore (TC-REC-01) to verify database consistency.
 */

const { Router } = require('express');
const { authorise } = require('../middleware/authMiddleware');
const { runIntegrityChecks } = require('../utils/dbIntegrity');
const { logOperationalError } = require('../utils/logOperationalError');

const router = Router();

/**
 * @route  GET /api/admin/db/health
 * @desc   Run all database integrity checks (SAM-NF-004 / TC-REC-01)
 * @access Admin only
 */
  router.get('/health', authorise('admin'), async (req, res) => {
  try {
    const result = await runIntegrityChecks();
    // 200 if all checks pass, 503 if any check fails
    return res.status(result.ok ? 200 : 503).json(result);
  } catch (err) {
    logOperationalError('database.integrity_check_failed', err, res);
    return res.status(500).json({
      ok: false,
      message: 'Unable to run integrity checks. Database may be unavailable.',
      checkedAt: new Date().toISOString(),
    });
  }
});

module.exports = router;
