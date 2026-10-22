/**
 * auditModel.js
 * Data-access for the `audit_log` table.
 *
 * SAM-SR-004: Security-relevant events (login failures, corrections, admin changes)
 *             must be recorded with actor, action, target, and timestamp.
 * SAM-NF-006: Audit records must be retained for at least one academic year.
 */

const { pool } = require('../config/database');

/**
 * Write a new audit log entry.
 *
 * @param {Object} params
 * @param {string|null} params.actor     - username or user_id of the acting principal (null for anonymous)
 * @param {string}      params.action    - short action label, e.g. 'LOGIN_SUCCESS', 'LOGIN_FAILURE'
 * @param {string}      params.target    - resource or entity affected, e.g. 'users/42'
 * @param {string|null} params.ipAddress - client IP address for security events
 * @param {string|null} params.details   - optional JSON-serialisable detail string
 */
async function logEvent({ actor = null, action, target, ipAddress = null, details = null }) {
  // SAM-SR-002: never log plaintext passwords — callers must strip them before calling this.
  await pool.execute(
    `INSERT INTO audit_log (actor, action, target, ip_address, details, created_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [actor, action, target, ipAddress, details]
  );
}

module.exports = { logEvent };
