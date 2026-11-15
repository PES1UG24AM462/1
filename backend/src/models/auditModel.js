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
 * @param {Object}      params.connection - optional transaction connection
 * @param {string|null} params.createdAt  - optional trusted UTC timestamp from the DB
 */
async function logEvent({
  actor = null,
  action,
  target,
  ipAddress = null,
  details = null,
  connection = pool,
  createdAt = null,
}) {
  if (actor !== null && (typeof actor !== 'string' || !actor.trim() || actor.length > 100)) {
    throw new TypeError('Audit actor must be a non-empty username or null.');
  }
  if (typeof action !== 'string' || !/^[A-Z][A-Z0-9_]{1,99}$/.test(action)) {
    throw new TypeError('Audit action must be a valid event name.');
  }
  if (typeof target !== 'string' || !target.trim() || target.length > 255) {
    throw new TypeError('Audit target must be a non-empty resource identifier.');
  }
  if (details !== null && typeof details !== 'string') {
    throw new TypeError('Audit details must be a string or null.');
  }
  // SAM-SR-002: callers must only pass selected, safe fields; never pass credentials.
  if (createdAt) {
    await connection.execute(
      `INSERT INTO audit_log (actor, action, target, ip_address, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [actor, action, target, ipAddress, details, createdAt]
    );
    return;
  }

  await connection.execute(
    `INSERT INTO audit_log (actor, action, target, ip_address, details, created_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
    [actor, action, target, ipAddress, details]
  );
}

/** Return a paginated audit history for the protected administrator view. */
async function listEvents({ action = null, actor = null, limit = 50, offset = 0 } = {}) {
  const conditions = [];
  const parameters = [];
  if (action !== null) { conditions.push('action = ?'); parameters.push(action); }
  if (actor !== null) { conditions.push('actor = ?'); parameters.push(actor); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `SELECT audit_id AS auditId, actor, action, target, details, created_at AS createdAt
     FROM audit_log ${where}
     ORDER BY created_at DESC, audit_id DESC LIMIT ? OFFSET ?`,
    [...parameters, limit, offset]
  );
  return rows;
}

module.exports = { logEvent, listEvents };
