/**
 * attendanceModel.js
 * Data-access for the `attendance` table.
 *
 * SAM-F-005 — Faculty marks each student as Present, Absent, or Late.
 * SAM-F-006 — UNIQUE constraint on (student_id, class_id, attendance_date)
 *             prevents duplicates; handled by the DB and surfaced as 409.
 * SAM-F-007 / SAM-F-016: Corrections preserve status history in the audit log transactionally.
 */

const { pool } = require('../config/database');
const auditModel = require('./auditModel');

function correctionError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function asUtcIsoTimestamp(mysqlTimestamp) {
  return `${mysqlTimestamp.replace(' ', 'T')}Z`;
}

/**
 * saveAttendanceRecords
 * Inserts or corrects attendance rows for a single class session in one transaction.
 *
 * Each record in `records` is one student for the given class + date.
 * Existing rows are locked before changes. Supplying an attendanceId identifies
 * a correction and prevents a missing row from becoming a new attendance record.
 *
 * @param {Object} params
 * @param {number}   params.classId      - class being marked
 * @param {string}   params.date         - YYYY-MM-DD
 * @param {number}   params.recordedBy   - user_id of the faculty member
 * @param {Array}    params.records       - [{ attendanceId?, studentId, status }]
 * @returns {Promise<Object>}            - count of rows saved and actual corrections
 */
async function saveAttendanceRecords({ classId, date, recordedBy, actor, ipAddress = null, records }) {
  if (!records || records.length === 0) {
    return { savedCount: 0, insertedCount: 0, corrections: [] };
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let savedCount = 0;
    let insertedCount = 0;
    const corrections = [];

    for (const { attendanceId, studentId, status } of records) {
      const lookup = attendanceId
        ? await connection.execute(
          `SELECT attendance_id AS attendanceId, status
           FROM attendance
           WHERE attendance_id = ? AND student_id = ? AND class_id = ? AND attendance_date = ?
           FOR UPDATE`,
          [attendanceId, studentId, classId, date]
        )
        : await connection.execute(
          `SELECT attendance_id AS attendanceId, status
           FROM attendance
           WHERE student_id = ? AND class_id = ? AND attendance_date = ?
           FOR UPDATE`,
          [studentId, classId, date]
        );
      const [existingRows] = lookup;
      const existing = existingRows[0];

      if (attendanceId && !existing) {
        throw correctionError('ATTENDANCE_NOT_FOUND');
      }

      if (!existing) {
        await connection.execute(
          `INSERT INTO attendance
             (student_id, class_id, attendance_date, status, recorded_by, recorded_at)
           VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
          [studentId, classId, date, status, recordedBy]
        );
        insertedCount++;
        savedCount++;
        continue;
      }

      if (existing.status !== status) {
        const [timestampRows] = await connection.execute(
          `SELECT DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%d %H:%i:%s') AS correctionTimestamp`
        );
        const correctionTimestamp = timestampRows[0].correctionTimestamp;

        await connection.execute(
          `UPDATE attendance
           SET status = ?, edited_by = ?, edited_at = ?
           WHERE attendance_id = ?`,
          [status, recordedBy, correctionTimestamp, existing.attendanceId]
        );

        await auditModel.logEvent({
          actor,
          action: 'ATTENDANCE_CORRECTION',
          target: `attendance/${existing.attendanceId}`,
          ipAddress,
          details: JSON.stringify({ previousStatus: existing.status, newStatus: status }),
          connection,
          createdAt: correctionTimestamp,
        });

        corrections.push({
          attendanceId: existing.attendanceId,
          previousStatus: existing.status,
          status,
          correctionTimestamp: asUtcIsoTimestamp(correctionTimestamp),
        });
      }

      savedCount++;
    }

    if (insertedCount > 0) {
      await auditModel.logEvent({
        actor,
        action: 'ATTENDANCE_SUBMIT',
        target: `attendance/class/${classId}/date/${date}`,
        ipAddress,
        details: `${insertedCount} records created`,
        connection,
      });
    }

    await connection.commit();
    return { savedCount, insertedCount, corrections };
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
 * @returns {Promise<Array<{attendanceId, studentId, status}>>}
 */
async function getAttendanceForSession(classId, date) {
  const [rows] = await pool.execute(
    `SELECT attendance_id AS attendanceId, student_id AS studentId, status
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
