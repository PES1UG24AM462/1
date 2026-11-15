/**
 * Data access for administrator course, class, and enrollment management.
 * Enrollment reads are rooted in the enrollments table so class rosters reflect
 * only persisted student-class relationships.
 */

const { pool } = require('../config/database');

async function listCourses() {
  const [rows] = await pool.execute(
    `SELECT course_id AS courseId, course_code AS courseCode,
            course_name AS courseName, description, credits
     FROM courses
     ORDER BY course_code, course_name`
  );
  return rows;
}

async function getCourseById(courseId) {
  const [rows] = await pool.execute(
    `SELECT course_id AS courseId, course_code AS courseCode,
            course_name AS courseName, description, credits
     FROM courses WHERE course_id = ? LIMIT 1`,
    [courseId]
  );
  return rows[0] || null;
}

async function createCourse({ courseCode, courseName, description, credits }, connection = pool) {
  const [result] = await connection.execute(
    `INSERT INTO courses (course_code, course_name, description, credits)
     VALUES (?, ?, ?, ?)`,
    [courseCode, courseName, description, credits]
  );
  return result.insertId;
}

async function updateCourse(courseId, fields, connection = pool) {
  const columnByField = {
    courseCode: 'course_code',
    courseName: 'course_name',
    description: 'description',
    credits: 'credits',
  };
  const assignments = [];
  const values = [];
  Object.entries(columnByField).forEach(([field, column]) => {
    if (Object.prototype.hasOwnProperty.call(fields, field)) {
      assignments.push(`${column} = ?`);
      values.push(fields[field]);
    }
  });
  if (assignments.length === 0) return false;
  values.push(courseId);
  const [result] = await connection.execute(
    `UPDATE courses SET ${assignments.join(', ')} WHERE course_id = ?`,
    values
  );
  return result.affectedRows > 0;
}

async function listClasses(courseId = null) {
  const courseFilter = courseId === null ? '' : 'WHERE c.course_id = ?';
  const [rows] = await pool.execute(
    `SELECT c.class_id AS classId, c.course_id AS courseId,
            c.faculty_id AS facultyId, c.section,
            c.academic_yr AS academicYear,
            co.course_code AS courseCode, co.course_name AS courseName,
            f.user_id AS facultyUserId, u.full_name AS facultyName
     FROM classes c
     JOIN courses co ON co.course_id = c.course_id
     JOIN faculty f ON f.faculty_id = c.faculty_id
     JOIN users u ON u.user_id = f.user_id AND u.role = 'faculty'
     ${courseFilter}
     ORDER BY co.course_code, c.academic_yr, c.section, c.class_id`,
    courseId === null ? [] : [courseId]
  );
  return rows;
}

async function getClassById(classId) {
  const [rows] = await pool.execute(
    `SELECT c.class_id AS classId, c.course_id AS courseId,
            c.faculty_id AS facultyId, c.section,
            c.academic_yr AS academicYear,
            co.course_code AS courseCode, co.course_name AS courseName,
            f.user_id AS facultyUserId, u.full_name AS facultyName
     FROM classes c
     JOIN courses co ON co.course_id = c.course_id
     JOIN faculty f ON f.faculty_id = c.faculty_id
     JOIN users u ON u.user_id = f.user_id AND u.role = 'faculty'
     WHERE c.class_id = ? LIMIT 1`,
    [classId]
  );
  return rows[0] || null;
}

async function getFacultyById(facultyId) {
  const [rows] = await pool.execute(
    `SELECT f.faculty_id AS facultyId
     FROM faculty f
     JOIN users u ON u.user_id = f.user_id
     WHERE f.faculty_id = ? AND u.role = 'faculty'
     LIMIT 1`,
    [facultyId]
  );
  return rows[0] || null;
}

async function listFaculty() {
  const [rows] = await pool.execute(
    `SELECT f.faculty_id AS facultyId, f.user_id AS userId,
            u.full_name AS fullName, f.department, f.designation
     FROM faculty f
     JOIN users u ON u.user_id = f.user_id
     WHERE u.role = 'faculty'
     ORDER BY u.full_name`
  );
  return rows;
}

async function createClass({ courseId, facultyId, section, academicYear }, connection = pool) {
  const [result] = await connection.execute(
    `INSERT INTO classes (course_id, faculty_id, section, academic_yr)
     VALUES (?, ?, ?, ?)`,
    [courseId, facultyId, section, academicYear]
  );
  return result.insertId;
}

async function updateClass(classId, fields, connection = pool) {
  const columnByField = {
    courseId: 'course_id',
    facultyId: 'faculty_id',
    section: 'section',
    academicYear: 'academic_yr',
  };
  const assignments = [];
  const values = [];
  Object.entries(columnByField).forEach(([field, column]) => {
    if (Object.prototype.hasOwnProperty.call(fields, field)) {
      assignments.push(`${column} = ?`);
      values.push(fields[field]);
    }
  });
  if (assignments.length === 0) return false;
  values.push(classId);
  const [result] = await connection.execute(
    `UPDATE classes SET ${assignments.join(', ')} WHERE class_id = ?`,
    values
  );
  return result.affectedRows > 0;
}

async function listStudents() {
  const [rows] = await pool.execute(
    `SELECT s.student_id AS studentId, s.usn,
            u.full_name AS fullName, s.department, s.semester
     FROM students s
     JOIN users u ON u.user_id = s.user_id
     WHERE u.role = 'student'
     ORDER BY u.full_name, s.usn`
  );
  return rows;
}

async function getStudentById(studentId) {
  const [rows] = await pool.execute(
    `SELECT s.student_id AS studentId
     FROM students s
     JOIN users u ON u.user_id = s.user_id
     WHERE s.student_id = ? AND u.role = 'student'
     LIMIT 1`,
    [studentId]
  );
  return rows[0] || null;
}

async function listClassEnrollments(classId) {
  const [rows] = await pool.execute(
    `SELECT e.enrollment_id AS enrollmentId,
            s.student_id AS studentId, s.usn, u.full_name AS fullName,
            s.department, s.semester,
            c.class_id AS classId, co.course_id AS courseId,
            co.course_code AS courseCode, co.course_name AS courseName,
            c.section, c.academic_yr AS academicYear,
            e.enrolled_at AS enrolledAt
     FROM enrollments e
     JOIN students s ON s.student_id = e.student_id
     JOIN users u ON u.user_id = s.user_id AND u.role = 'student'
     JOIN classes c ON c.class_id = e.class_id
     JOIN courses co ON co.course_id = c.course_id
     WHERE e.class_id = ?
     ORDER BY u.full_name, s.usn`,
    [classId]
  );
  return rows;
}

async function enrollStudent(studentId, classId, connection = pool) {
  const [result] = await connection.execute(
    `INSERT INTO enrollments (student_id, class_id) VALUES (?, ?)`,
    [studentId, classId]
  );
  return result.insertId;
}

module.exports = {
  listCourses,
  getCourseById,
  createCourse,
  updateCourse,
  listClasses,
  getClassById,
  getFacultyById,
  listFaculty,
  createClass,
  updateClass,
  listStudents,
  getStudentById,
  listClassEnrollments,
  enrollStudent,
};
