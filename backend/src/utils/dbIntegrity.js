/**
 * dbIntegrity.js
 * SAM-NF-004 — Database integrity checks for backup and recovery validation.
 *
 * These checks verify that after a restore:
 *   - All core tables exist and are accessible
 *   - Foreign key constraints are enforced
 *   - The attendance unique constraint (student_id, class_id, attendance_date)
 *     is intact — no duplicate records exist
 *   - Attendance statuses only contain valid values (Present, Absent, Late)
 *   - Audit log is retaining records (SAM-NF-006)
 *
 * TC-REC-01: Recovery test restores a valid backup without inconsistent records.
 */

const { pool } = require('../config/database');

/**
 * checkTablesExist
 * Verifies all required SAMS tables are present in the database.
 * @returns {Promise<{ ok: boolean, missing: string[] }>}
 */
async function checkTablesExist() {
  const REQUIRED_TABLES = [
    'users', 'students', 'faculty', 'courses',
    'classes', 'enrollments', 'attendance', 'audit_log',
  ];

  const [rows] = await pool.execute(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME IN (${REQUIRED_TABLES.map(() => '?').join(',')})`,
    REQUIRED_TABLES
  );

  const found   = new Set(rows.map((r) => r.TABLE_NAME));
  const missing = REQUIRED_TABLES.filter((t) => !found.has(t));
  return { ok: missing.length === 0, missing };
}

/**
 * checkDuplicateAttendance
 * SAM-F-006: Detects any (student_id, class_id, attendance_date) duplicates
 * that violate the unique constraint — indicates a corrupt restore.
 * @returns {Promise<{ ok: boolean, duplicateCount: number }>}
 */
async function checkDuplicateAttendance() {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS duplicateCount
     FROM (
       SELECT student_id, class_id, attendance_date, COUNT(*) AS cnt
       FROM attendance
       GROUP BY student_id, class_id, attendance_date
       HAVING cnt > 1
     ) AS duplicates`
  );
  const duplicateCount = Number(rows[0].duplicateCount);
  return { ok: duplicateCount === 0, duplicateCount };
}

/**
 * checkAttendanceStatuses
 * Verifies every attendance row has a valid status value.
 * An invalid status indicates data corruption.
 * @returns {Promise<{ ok: boolean, invalidCount: number }>}
 */
async function checkAttendanceStatuses() {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS invalidCount
     FROM attendance
     WHERE status NOT IN ('Present', 'Absent', 'Late')`
  );
  const invalidCount = Number(rows[0].invalidCount);
  return { ok: invalidCount === 0, invalidCount };
}

/**
 * checkOrphanedAttendance
 * Finds attendance rows whose student_id or class_id no longer
 * references a valid row — indicates a broken restore.
 * @returns {Promise<{ ok: boolean, orphanCount: number }>}
 */
async function checkOrphanedAttendance() {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS orphanCount
     FROM attendance a
     WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.student_id = a.student_id)
        OR NOT EXISTS (SELECT 1 FROM classes  c WHERE c.class_id   = a.class_id)`
  );
  const orphanCount = Number(rows[0].orphanCount);
  return { ok: orphanCount === 0, orphanCount };
}

/**
 * checkAuditLogRetention
 * SAM-NF-006: Verifies the audit log table exists and is accessible.
 * Does not enforce the one-year retention period here (that is a
 * scheduled maintenance concern), but confirms records are readable.
 * @returns {Promise<{ ok: boolean, auditRowCount: number }>}
 */
async function checkAuditLogRetention() {
  const [rows] = await pool.execute(
    'SELECT COUNT(*) AS auditRowCount FROM audit_log'
  );
  const auditRowCount = Number(rows[0].auditRowCount);
  return { ok: true, auditRowCount };
}

/**
 * runIntegrityChecks
 * Runs all checks and returns a combined result object.
 * TC-REC-01: used after a restore to confirm database consistency.
 *
 * @returns {Promise<{
 *   ok: boolean,
 *   checks: {
 *     tables:     { ok, missing },
 *     duplicates: { ok, duplicateCount },
 *     statuses:   { ok, invalidCount },
 *     orphans:    { ok, orphanCount },
 *     auditLog:   { ok, auditRowCount },
 *   },
 *   checkedAt: string
 * }>}
 */
async function runIntegrityChecks() {
  const [tables, duplicates, statuses, orphans, auditLog] = await Promise.all([
    checkTablesExist(),
    checkDuplicateAttendance(),
    checkAttendanceStatuses(),
    checkOrphanedAttendance(),
    checkAuditLogRetention(),
  ]);

  const allOk = tables.ok && duplicates.ok && statuses.ok && orphans.ok && auditLog.ok;

  return {
    ok: allOk,
    checks: { tables, duplicates, statuses, orphans, auditLog },
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  runIntegrityChecks,
  checkTablesExist,
  checkDuplicateAttendance,
  checkAttendanceStatuses,
  checkOrphanedAttendance,
  checkAuditLogRetention,
};
