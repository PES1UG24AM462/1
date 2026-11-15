/**
 * Data access for class and date-range attendance reports (SAM-F-011).
 * Report queries only include persisted Present, Absent, and Late statuses.
 */

const { pool } = require('../config/database');

async function listReportClasses(userId, role) {
  const facultyScope = role === 'faculty'
    ? 'JOIN faculty f ON f.faculty_id = c.faculty_id WHERE f.user_id = ?'
    : '';
  const params = role === 'faculty' ? [userId] : [];
  const [rows] = await pool.execute(
    `SELECT c.class_id AS classId, c.course_id AS courseId,
            co.course_code AS courseCode, co.course_name AS courseName,
            c.section, c.academic_yr AS academicYear
     FROM classes c
     JOIN courses co ON co.course_id = c.course_id
     ${facultyScope}
     ORDER BY co.course_code, c.section, c.class_id`,
    params
  );
  return rows;
}

async function listReportStudents(classId, userId, role) {
  const facultyScope = role === 'faculty'
    ? 'AND EXISTS (SELECT 1 FROM faculty f WHERE f.faculty_id = c.faculty_id AND f.user_id = ?)'
    : '';
  const params = [classId, classId, classId];
  if (role === 'faculty') params.push(userId);
  const [rows] = await pool.execute(
    `SELECT DISTINCT s.student_id AS studentId, s.usn AS studentNumber,
            u.full_name AS fullName
     FROM students s
     JOIN users u ON u.user_id = s.user_id AND u.role = 'student'
     WHERE (EXISTS (
       SELECT 1 FROM enrollments e WHERE e.student_id = s.student_id AND e.class_id = ?
     ) OR EXISTS (
       SELECT 1 FROM attendance a WHERE a.student_id = s.student_id AND a.class_id = ?
     ))
       AND EXISTS (SELECT 1 FROM classes c WHERE c.class_id = ? ${facultyScope})
     ORDER BY u.full_name, s.usn`,
    params
  );
  return rows;
}

async function hasReportStudent(classId, studentId, courseId, userId, role) {
  const facultyScope = role === 'faculty'
    ? 'AND EXISTS (SELECT 1 FROM faculty f JOIN classes assigned ON assigned.faculty_id = f.faculty_id WHERE f.user_id = ? AND assigned.class_id = c.class_id)'
    : '';
  const [rows] = await pool.execute(
    `SELECT 1
     FROM classes c
     WHERE c.class_id = ? AND c.course_id = ?
       AND (EXISTS (SELECT 1 FROM enrollments e WHERE e.class_id = ? AND e.student_id = ?)
         OR EXISTS (SELECT 1 FROM attendance a WHERE a.class_id = ? AND a.student_id = ?))
       ${facultyScope}
     LIMIT 1`,
    [classId, courseId, classId, studentId, classId, studentId, ...(role === 'faculty' ? [userId] : [])]
  );
  return rows.length > 0;
}

/**
 * Returns class metadata and the selected range's actual attendance records in
 * one query. The left joins preserve a valid class with no records in range.
 */
async function getAttendanceRows({ classId, courseId, studentId, from, to, userId, role }) {
  const facultyScope = role === 'faculty'
    ? 'AND EXISTS (SELECT 1 FROM faculty f WHERE f.faculty_id = c.faculty_id AND f.user_id = ?)'
    : '';
  const params = [from, to];
  const studentScope = studentId === null || studentId === undefined ? '' : 'AND a.student_id = ?';
  if (studentId !== null && studentId !== undefined) params.push(studentId);
  params.push(classId, courseId);
  if (role === 'faculty') params.push(userId);

  const [rows] = await pool.execute(
    `SELECT c.class_id AS classId, c.course_id AS courseId,
            co.course_code AS courseCode, co.course_name AS courseName,
            c.section, c.academic_yr AS academicYear,
            a.attendance_id AS attendanceId, a.student_id AS studentId,
            s.usn AS studentNumber, u.full_name AS fullName,
            DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendanceDate,
            a.status
     FROM classes c
     JOIN courses co ON co.course_id = c.course_id
     LEFT JOIN attendance a
       ON a.class_id = c.class_id
      AND a.attendance_date BETWEEN ? AND ?
      AND a.status IN ('Present', 'Absent', 'Late')
      ${studentScope}
     LEFT JOIN students s ON s.student_id = a.student_id
     LEFT JOIN users u ON u.user_id = s.user_id AND u.role = 'student'
     WHERE c.class_id = ? AND c.course_id = ? ${facultyScope}
     ORDER BY u.full_name, s.usn, a.attendance_date, a.attendance_id`,
    params
  );
  return rows;
}

module.exports = { listReportClasses, listReportStudents, hasReportStudent, getAttendanceRows };
