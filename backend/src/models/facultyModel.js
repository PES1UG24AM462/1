/**
 * Data access for faculty class assignments and enrolled student rosters.
 */

const { pool } = require('../config/database');

async function listAssignedClasses(userId) {
  const [rows] = await pool.execute(
    `SELECT c.class_id, c.section, c.academic_yr,
            co.course_id, co.course_code, co.course_name
     FROM classes c
     JOIN courses co ON co.course_id = c.course_id
     JOIN faculty f ON f.faculty_id = c.faculty_id
     WHERE f.user_id = ?
     ORDER BY co.course_code, c.section, c.class_id`,
    [userId]
  );
  return rows;
}

/**
 * Returns the class and its current enrollment only when the class belongs to
 * the requesting faculty member. The left joins preserve classes with no
 * enrolled students while keeping the authorization and roster scope in one
 * parameterized query.
 */
async function getAssignedClassRoster(userId, classId) {
  const [rows] = await pool.execute(
    `SELECT c.class_id, c.section, c.academic_yr,
            co.course_id, co.course_code, co.course_name,
            s.student_id, s.usn, u.full_name, s.department, s.semester
     FROM classes c
     JOIN courses co ON co.course_id = c.course_id
     JOIN faculty f ON f.faculty_id = c.faculty_id
     LEFT JOIN enrollments e ON e.class_id = c.class_id
     LEFT JOIN students s ON s.student_id = e.student_id
     LEFT JOIN users u ON u.user_id = s.user_id AND u.role = 'student'
     WHERE f.user_id = ? AND c.class_id = ?
     ORDER BY u.full_name, s.usn`,
    [userId, classId]
  );

  if (rows.length === 0) return null;

  const first = rows[0];
  const studentsById = new Map();
  rows.forEach((row) => {
    if (row.student_id === null || studentsById.has(row.student_id)) return;
    studentsById.set(row.student_id, {
      studentId: row.student_id,
      usn: row.usn,
      fullName: row.full_name,
      department: row.department,
      semester: row.semester,
    });
  });
  const students = [...studentsById.values()];

  return {
    classId: first.class_id,
    courseId: first.course_id,
    courseCode: first.course_code,
    courseName: first.course_name,
    section: first.section,
    academicYear: first.academic_yr,
    students,
  };
}

module.exports = { listAssignedClasses, getAssignedClassRoster };
