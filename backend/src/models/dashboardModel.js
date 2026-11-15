/**
 * dashboardModel.js
 * Data-access queries for SAM-F-017 — Attendance summaries on the dashboard.
 *
 * Three summary scopes:
 *   getAdminSummary()   — system-wide totals for administrators
 *   getFacultySummary() — today's session stats for a faculty member
 *   getStudentSummary() — overall attendance snapshot for a student
 */

const { pool } = require('../config/database');

/**
 * getAdminSummary
 * Returns system-wide statistics for the admin dashboard.
 *
 * @returns {Promise<{
 *   totalStudents, totalFaculty, totalCourses, totalClasses,
 *   totalAttendanceRecords, overallAttendanceRate,
 *   belowThresholdCount, recentAuditEvents
 * }>}
 */
async function getAdminSummary(threshold = 75) {
  const [[counts]] = await pool.execute(`
    SELECT
      (SELECT COUNT(*) FROM students  s JOIN users u ON u.user_id = s.user_id WHERE u.is_active = 1) AS totalStudents,
      (SELECT COUNT(*) FROM faculty   f JOIN users u ON u.user_id = f.user_id WHERE u.is_active = 1) AS totalFaculty,
      (SELECT COUNT(*) FROM courses)                                                                  AS totalCourses,
      (SELECT COUNT(*) FROM classes)                                                                  AS totalClasses,
      (SELECT COUNT(*) FROM attendance)                                                               AS totalAttendanceRecords
  `);

  // Overall attendance rate across all records
  const [[rateRow]] = await pool.execute(`
    SELECT
      COUNT(*) AS total,
      SUM(status IN ('Present','Late')) AS attended
    FROM attendance
  `);
  const overallAttendanceRate = rateRow.total > 0
    ? Math.round((rateRow.attended / rateRow.total) * 10000) / 100
    : null;

  // Students with any class below the threshold
  const [[belowRow]] = await pool.execute(`
    SELECT COUNT(DISTINCT student_id) AS belowThresholdCount
    FROM (
      SELECT
        a.student_id,
        a.class_id,
        ROUND(SUM(a.status IN ('Present','Late')) / COUNT(*) * 100, 2) AS pct
      FROM attendance a
      GROUP BY a.student_id, a.class_id
      HAVING pct < ?
    ) AS low
  `, [threshold]);

  // 5 most recent audit events
  const [recentAuditEvents] = await pool.execute(`
    SELECT actor, action, target, created_at AS createdAt
    FROM audit_log
    ORDER BY created_at DESC
    LIMIT 5
  `);

  return {
    totalStudents:        Number(counts.totalStudents),
    totalFaculty:         Number(counts.totalFaculty),
    totalCourses:         Number(counts.totalCourses),
    totalClasses:         Number(counts.totalClasses),
    totalAttendanceRecords: Number(counts.totalAttendanceRecords),
    overallAttendanceRate,
    belowThresholdCount:  Number(belowRow.belowThresholdCount),
    recentAuditEvents,
  };
}

/**
 * getFacultySummary
 * Returns today's attendance session stats for the requesting faculty member.
 *
 * @param {number} userId   — faculty user_id
 * @param {string} today    — YYYY-MM-DD (injected so tests can control the date)
 * @returns {Promise<{
 *   assignedClassCount, markedTodayCount, pendingTodayCount,
 *   totalStudentsAssigned, markedStudentsToday,
 *   todayDate, recentSessions
 * }>}
 */
async function getFacultySummary(userId, today) {
  const date = today || new Date().toISOString().slice(0, 10);

  // All classes assigned to this faculty
  const [assignedClasses] = await pool.execute(`
    SELECT c.class_id AS classId
    FROM classes c
    JOIN faculty f ON f.faculty_id = c.faculty_id
    WHERE f.user_id = ?
  `, [userId]);

  const assignedClassCount = assignedClasses.length;

  if (assignedClassCount === 0) {
    return {
      assignedClassCount: 0,
      markedTodayCount: 0,
      pendingTodayCount: 0,
      totalStudentsAssigned: 0,
      markedStudentsToday: 0,
      todayDate: date,
      recentSessions: [],
    };
  }

  const classIds = assignedClasses.map((r) => r.classId);
  const placeholders = classIds.map(() => '?').join(',');

  // Classes that already have at least one attendance record for today
  const [markedToday] = await pool.execute(`
    SELECT DISTINCT class_id AS classId
    FROM attendance
    WHERE class_id IN (${placeholders}) AND attendance_date = ?
  `, [...classIds, date]);

  const markedTodayCount  = markedToday.length;
  const pendingTodayCount = assignedClassCount - markedTodayCount;

  // Total enrolled students across all assigned classes
  const [[enrollRow]] = await pool.execute(`
    SELECT COUNT(*) AS total
    FROM enrollments
    WHERE class_id IN (${placeholders})
  `, classIds);

  // Students marked today across all assigned classes
  const [[markedRow]] = await pool.execute(`
    SELECT COUNT(*) AS total
    FROM attendance
    WHERE class_id IN (${placeholders}) AND attendance_date = ?
  `, [...classIds, date]);

  // 5 most recent sessions (class + date) with a quick status breakdown
  const [recentSessions] = await pool.execute(`
    SELECT
      a.class_id      AS classId,
      co.course_code  AS courseCode,
      co.course_name  AS courseName,
      c.section,
      DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS sessionDate,
      COUNT(*)                          AS totalMarked,
      SUM(a.status = 'Present')         AS presentCount,
      SUM(a.status = 'Late')            AS lateCount,
      SUM(a.status = 'Absent')          AS absentCount
    FROM attendance a
    JOIN classes  c  ON c.class_id  = a.class_id
    JOIN courses  co ON co.course_id = c.course_id
    WHERE a.class_id IN (${placeholders})
    GROUP BY a.class_id, a.attendance_date
    ORDER BY a.attendance_date DESC, a.class_id
    LIMIT 5
  `, classIds);

  return {
    assignedClassCount,
    markedTodayCount,
    pendingTodayCount,
    totalStudentsAssigned: Number(enrollRow.total),
    markedStudentsToday:   Number(markedRow.total),
    todayDate: date,
    recentSessions: recentSessions.map((r) => ({
      classId:      Number(r.classId),
      courseCode:   r.courseCode,
      courseName:   r.courseName,
      section:      r.section || null,
      sessionDate:  r.sessionDate,
      totalMarked:  Number(r.totalMarked),
      presentCount: Number(r.presentCount),
      lateCount:    Number(r.lateCount),
      absentCount:  Number(r.absentCount),
    })),
  };
}

/**
 * getStudentSummary
 * Returns an overall attendance snapshot for the requesting student.
 *
 * @param {number} userId   — student user_id
 * @param {number} threshold
 * @returns {Promise<{
 *   enrolledCourseCount, overallPercentage,
 *   coursesAboveThreshold, coursesBelowThreshold,
 *   totalClassesHeld, totalAttended
 * }>}
 */
async function getStudentSummary(userId, threshold = 75) {
  const [[row]] = await pool.execute(`
    SELECT
      COUNT(DISTINCT a.class_id)                          AS enrolledCourseCount,
      COUNT(*)                                            AS totalClassesHeld,
      SUM(a.status IN ('Present','Late'))                 AS totalAttended,
      ROUND(SUM(a.status IN ('Present','Late')) / COUNT(*) * 100, 2) AS overallPercentage
    FROM attendance a
    JOIN students s ON s.student_id = a.student_id
    WHERE s.user_id = ?
  `, [userId]);

  // Per-class percentage to count above/below threshold
  const [classPcts] = await pool.execute(`
    SELECT
      ROUND(SUM(a.status IN ('Present','Late')) / COUNT(*) * 100, 2) AS pct
    FROM attendance a
    JOIN students s ON s.student_id = a.student_id
    WHERE s.user_id = ?
    GROUP BY a.class_id
  `, [userId]);

  const coursesAboveThreshold = classPcts.filter((r) => Number(r.pct) >= threshold).length;
  const coursesBelowThreshold = classPcts.filter((r) => Number(r.pct) < threshold).length;

  return {
    enrolledCourseCount:  Number(row.enrolledCourseCount),
    totalClassesHeld:     Number(row.totalClassesHeld),
    totalAttended:        Number(row.totalAttended),
    overallPercentage:    row.overallPercentage !== null ? Number(row.overallPercentage) : null,
    coursesAboveThreshold,
    coursesBelowThreshold,
  };
}

module.exports = { getAdminSummary, getFacultySummary, getStudentSummary };
