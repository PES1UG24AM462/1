/**
 * attendanceModel.js
 * Data-access for the `attendance` table.
 *
 * SAM-F-005 — Faculty marks each student as Present, Absent, or Late.
 * SAM-F-006 — UNIQUE constraint on (student_id, class_id, attendance_date)
 *             prevents duplicates; handled by the DB and surfaced as 409.
 * SAM-SR-004 — Every save is audited via auditModel (called from controller).
 */

const { pool } = require('../config/database');

/**
 * saveAttendanceRecords
 * Inserts or updates attendance rows for a single class session in one transaction.
 *
 * Each record in `records` is one student for the given class + date.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE so re-submitting a session
 * overwrites the status instead of throwing a duplicate error.
 * (Actual duplicate prevention for same-day same-student is enforced by the
 *  UNIQUE KEY in schema.sql per SAM-F-006.)
 *
 * @param {Object} params
 * @param {number}   params.classId      - class being marked
 * @param {string}   params.date         - YYYY-MM-DD
 * @param {number}   params.recordedBy   - user_id of the faculty member
 * @param {Array}    params.records       - [{ studentId, status }]
 * @returns {Promise<number>}            - count of rows saved
 */
async function saveAttendanceRecords({ classId, date, recordedBy, records }) {
  if (!records || records.length === 0) return 0;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let savedCount = 0;
    for (const { studentId, status } of records) {
      await connection.execute(
        `INSERT INTO attendance
           (student_id, class_id, attendance_date, status, recorded_by, recorded_at)
         VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           status       = VALUES(status),
           recorded_by  = VALUES(recorded_by),
           recorded_at  = UTC_TIMESTAMP()`,
        [studentId, classId, date, status, recordedBy]
      );
      savedCount++;
    }

    await connection.commit();
    return savedCount;
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * getAttendanceForSession
 * Returns existing attendance rows for a (classId, date) session.
 * Used to pre-fill the marking form if faculty revisit a session.
 *
 * @param {number} classId
 * @param {string} date    - YYYY-MM-DD
 * @returns {Promise<Array<{studentId, status}>>}
 */
async function getAttendanceForSession(classId, date) {
  const [rows] = await pool.execute(
    `SELECT student_id AS studentId, status
     FROM attendance
     WHERE class_id = ? AND attendance_date = ?`,
    [classId, date]
  );
  return rows;
}

/**
 * getStudentsBelowThreshold
 * Calculates attendance percentages and returns students below the threshold (SAM-F-010, TC-REP-02).
 *
 * @param {Object} params
 * @param {number} params.classId
 * @param {number} [params.threshold=75]
 * @returns {Promise<Array>}
 */
async function getStudentsBelowThreshold({ classId, threshold = 75 }) {
  const query = `
    SELECT
      s.student_id AS studentId,
      s.usn,
      u.full_name AS fullName,
      c.class_id AS classId,
      COUNT(a.attendance_id) AS totalSessions,
      SUM(CASE WHEN a.status IN ('Present', 'Late') THEN 1 ELSE 0 END) AS attendedSessions,
      ROUND((SUM(CASE WHEN a.status IN ('Present', 'Late') THEN 1 ELSE 0 END) / NULLIF(COUNT(a.attendance_id), 0)) * 100, 2) AS attendancePercentage
    FROM enrollments e
    JOIN students s ON s.student_id = e.student_id
    JOIN users u ON u.user_id = s.user_id
    JOIN classes c ON c.class_id = e.class_id
    LEFT JOIN attendance a ON a.student_id = s.student_id AND a.class_id = c.class_id
    WHERE c.class_id = ?
    GROUP BY s.student_id, s.usn, u.full_name, c.class_id
    HAVING attendancePercentage IS NOT NULL AND attendancePercentage < ?
    ORDER BY attendancePercentage ASC, s.usn ASC
  `;
  const [rows] = await pool.execute(query, [classId, threshold]);
  return rows.map((r) => ({
    ...r,
    attendancePercentage: Number(r.attendancePercentage),
    isFlagged: true,
  }));
}

module.exports = { saveAttendanceRecords, getAttendanceForSession, getStudentsBelowThreshold };
