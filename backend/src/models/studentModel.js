const { pool } = require('../config/database');

async function listEnrolledCourses(userId) {
  const [rows] = await pool.execute(
    `(SELECT co.course_id, co.course_code, co.course_name
      FROM enrollments e
      JOIN students s ON s.student_id = e.student_id
      JOIN classes c ON c.class_id = e.class_id
      JOIN courses co ON co.course_id = c.course_id
      WHERE s.user_id = ?)
     UNION
     (SELECT co.course_id, co.course_code, co.course_name
      FROM attendance a
      JOIN students s ON s.student_id = a.student_id
      JOIN classes c ON c.class_id = a.class_id
      JOIN courses co ON co.course_id = c.course_id
      WHERE s.user_id = ?)
     ORDER BY course_code, course_name`,
    [userId, userId]
  );
  return rows;
}

async function hasCourseAccess(userId, courseId) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM students s
     JOIN classes c ON c.course_id = ?
     WHERE s.user_id = ?
       AND (EXISTS (
         SELECT 1 FROM enrollments e
         WHERE e.student_id = s.student_id AND e.class_id = c.class_id
       ) OR EXISTS (
         SELECT 1 FROM attendance a
         WHERE a.student_id = s.student_id AND a.class_id = c.class_id
       ))
     LIMIT 1`,
    [courseId, userId]
  );
  return rows.length > 0;
}

async function getAttendanceHistory(userId, courseId = null, date = null) {
  const conditions = ['s.user_id = ?'];
  const parameters = [userId];
  if (courseId !== null) {
    conditions.push('co.course_id = ?');
    parameters.push(courseId);
  }
  if (date !== null) {
    conditions.push('a.attendance_date = ?');
    parameters.push(date);
  }

  const [rows] = await pool.execute(
    `SELECT a.attendance_id, DATE_FORMAT(a.attendance_date, '%Y-%m-%d') AS attendance_date,
            a.status, co.course_id, co.course_code, co.course_name,
            c.class_id, c.section, c.academic_yr
     FROM attendance a
     JOIN students s ON s.student_id = a.student_id
     JOIN classes c ON c.class_id = a.class_id
     JOIN courses co ON co.course_id = c.course_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.attendance_date DESC, co.course_code, c.section, a.attendance_id DESC`,
    parameters
  );
  return rows;
}

module.exports = { listEnrolledCourses, hasCourseAccess, getAttendanceHistory };
