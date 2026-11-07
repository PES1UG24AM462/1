/**
 * percentageModel.js
 * Data-access for SAM-F-009 — Calculate accurate attendance percentages.
 *
 * Formula (per SRS):
 *   percentage = (present_count + late_count) / total_classes * 100
 *   rounded to 2 decimal places.
 *
 * "Late" counts as attended (student was present, just tardy).
 * "Absent" does not count.
 *
 * SAM-SR-005 — A student can only see their own data.
 *              Authorization is enforced in the controller; this model
 *              always filters by the calling student's user_id.
 */

const { pool } = require('../config/database');

/**
 * getAttendancePercentages
 * Returns per-course attendance percentage for a student.
 * If courseId is provided, returns a single-row result for that course.
 *
 * @param {number}      userId    - user_id of the student
 * @param {number|null} courseId  - filter to one course (null = all courses)
 * @returns {Promise<Array<{
 *   courseId, courseCode, courseName, classId, section, academicYear,
 *   totalClasses, present, late, absent, attended, percentage
 * }>>}
 */
async function getAttendancePercentages(userId, courseId = null) {
  const params = [userId];
  let courseFilter = '';
  if (courseId !== null) {
    courseFilter = 'AND co.course_id = ?';
    params.push(courseId);
  }

  // One row per (student, class).
  // present_count  = rows with status = 'Present'
  // late_count     = rows with status = 'Late'   (counts as attended)
  // absent_count   = rows with status = 'Absent'
  // total_classes  = present + late + absent  (all sessions recorded)
  // percentage     = (present + late) / total * 100, rounded to 2dp
  const [rows] = await pool.execute(
    `SELECT
       co.course_id                                              AS courseId,
       co.course_code                                           AS courseCode,
       co.course_name                                           AS courseName,
       c.class_id                                               AS classId,
       c.section,
       c.academic_yr                                            AS academicYear,
       COUNT(*)                                                 AS totalClasses,
       SUM(a.status = 'Present')                               AS present,
       SUM(a.status = 'Late')                                  AS late,
       SUM(a.status = 'Absent')                                AS absent,
       SUM(a.status IN ('Present','Late'))                      AS attended,
       ROUND(
         SUM(a.status IN ('Present','Late')) / COUNT(*) * 100,
         2
       )                                                        AS percentage
     FROM attendance a
     JOIN students   s  ON s.student_id  = a.student_id
     JOIN classes    c  ON c.class_id    = a.class_id
     JOIN courses    co ON co.course_id  = c.course_id
     WHERE s.user_id = ? ${courseFilter}
     GROUP BY co.course_id, co.course_code, co.course_name,
              c.class_id, c.section, c.academic_yr
     ORDER BY co.course_code, c.section`,
    params
  );

  // Convert MySQL numeric strings/BigInts to JS numbers
  return rows.map((r) => ({
    courseId:    Number(r.courseId),
    courseCode:  r.courseCode,
    courseName:  r.courseName,
    classId:     Number(r.classId),
    section:     r.section || null,
    academicYear: r.academicYear || null,
    totalClasses: Number(r.totalClasses),
    present:     Number(r.present),
    late:        Number(r.late),
    absent:      Number(r.absent),
    attended:    Number(r.attended),
    percentage:  Number(r.percentage),
  }));
}

module.exports = { getAttendancePercentages };
