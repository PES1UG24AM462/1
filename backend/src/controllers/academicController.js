/**
 * Administrator course, class, and enrollment operations (SAM-F-015 / TC-ADM-02).
 * All identifiers and relationship references are validated server-side.
 */

const academicModel = require('../models/academicModel');
const auditModel = require('../models/auditModel');
const { pool } = require('../config/database');
const { logOperationalError } = require('../utils/logOperationalError');

function parseId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseBodyId(value) {
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/.test(String(value))) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function text(value) {
  return typeof value === 'string' ? value.trim() : null;
}

function clientIp(req) {
  return req.socket?.remoteAddress || null;
}

async function auditedMutation(req, res, { action, target, details }, mutate) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await mutate(connection);
    await auditModel.logEvent({
      actor: req.user.username,
      action,
      target: typeof target === 'function' ? target(result) : target,
      ipAddress: clientIp(req),
      details,
      connection,
    });
    await connection.commit();
    return result;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      logOperationalError('academic.audit_rollback_failed', rollbackError, res);
    }
    throw err;
  } finally {
    connection.release();
  }
}

function validKeys(body, keys) {
  return Object.keys(body || {}).every((key) => keys.includes(key));
}

function validateCourseFields(body, partial = false) {
  const allowed = ['courseCode', 'courseName', 'description', 'credits'];
  if (!validKeys(body, allowed)) return { error: 'Unsupported course field.' };
  if (partial && Object.keys(body).length === 0) return { error: 'Provide at least one course field to update.' };

  const fields = {};
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'courseCode')) {
    const courseCode = text(body.courseCode);
    if (!courseCode || courseCode.length > 20) return { error: 'Course code is required (max 20 characters).' };
    fields.courseCode = courseCode;
  }
  if (!partial || Object.prototype.hasOwnProperty.call(body, 'courseName')) {
    const courseName = text(body.courseName);
    if (!courseName || courseName.length > 150) return { error: 'Course name is required (max 150 characters).' };
    fields.courseName = courseName;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'description') || !partial) {
    if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
      return { error: 'Description must be text.' };
    }
    const description = body.description == null ? null : body.description.trim();
    if (description && description.length > 60000) return { error: 'Description is too long.' };
    fields.description = description || null;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'credits') || !partial) {
    if (body.credits === null || body.credits === undefined || (typeof body.credits === 'string' && body.credits.trim() === '')) {
      fields.credits = null;
    } else {
      if (typeof body.credits !== 'number' && (typeof body.credits !== 'string' || !/^\d+$/.test(body.credits.trim()))) {
        return { error: 'Credits must be a whole number from 0 to 255.' };
      }
      const credits = Number(body.credits);
      if (!Number.isInteger(credits) || credits < 0 || credits > 255) {
        return { error: 'Credits must be a whole number from 0 to 255.' };
      }
      fields.credits = credits;
    }
  }
  return { fields };
}

function validateClassFields(body, partial = false) {
  // The course is fixed when a class is created; moving a class to a different
  // course could relabel its existing enrollment and attendance history.
  const allowed = partial
    ? ['facultyId', 'section', 'academicYear']
    : ['courseId', 'facultyId', 'section', 'academicYear'];
  if (!validKeys(body, allowed)) return { error: 'Unsupported class field.' };
  if (partial && Object.keys(body).length === 0) return { error: 'Provide at least one class field to update.' };
  const fields = {};

  for (const key of (partial ? ['facultyId'] : ['courseId', 'facultyId'])) {
    if (!partial || Object.prototype.hasOwnProperty.call(body, key)) {
      const value = parseBodyId(body[key]);
      if (value === null) return { error: `${key === 'courseId' ? 'Course' : 'Faculty'} is required and must be valid.` };
      fields[key] = value;
    }
  }
  for (const [key, label, maxLength] of [['section', 'Section', 20], ['academicYear', 'Academic year', 10]]) {
    if (Object.prototype.hasOwnProperty.call(body, key) || !partial) {
      if (body[key] !== undefined && body[key] !== null && typeof body[key] !== 'string') {
        return { error: `${label} must be text.` };
      }
      const value = body[key] == null ? null : body[key].trim();
      if (value && value.length > maxLength) return { error: `${label} must be at most ${maxLength} characters.` };
      fields[key] = value || null;
    }
  }
  return { fields };
}

function handleDatabaseError(err, res, label) {
  if (err?.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ message: 'A record with these unique values already exists.' });
  }
  if (['ER_NO_REFERENCED_ROW_2', 'ER_ROW_IS_REFERENCED_2'].includes(err?.code)) {
    return res.status(400).json({ message: 'The selected course, class, student, or faculty record is invalid.' });
  }
  logOperationalError('academic.database_operation_failed', err, res, { operation: label });
  return res.status(500).json({ message: 'An internal server error occurred. Please try again.' });
}

async function listCourses(_req, res) {
  try {
    return res.status(200).json({ courses: await academicModel.listCourses() });
  } catch (err) {
    return handleDatabaseError(err, res, 'course list');
  }
}

async function getCourse(req, res) {
  const courseId = parseId(req.params.courseId);
  if (courseId === null) return res.status(400).json({ message: 'Select a valid course.' });
  try {
    const course = await academicModel.getCourseById(courseId);
    if (!course) return res.status(404).json({ message: 'Course not found.' });
    return res.status(200).json({ course });
  } catch (err) {
    return handleDatabaseError(err, res, 'course lookup');
  }
}

async function createCourse(req, res) {
  const validation = validateCourseFields(req.body);
  if (validation.error) return res.status(400).json({ message: validation.error });
  try {
    const courseId = await auditedMutation(req, res, {
      action: 'COURSE_CREATED', target: (id) => `courses/${id}`,
      details: JSON.stringify({ courseCode: validation.fields.courseCode }),
    }, (connection) => academicModel.createCourse(validation.fields, connection));
    const course = await academicModel.getCourseById(courseId);
    return res.status(201).json({ message: 'Course created.', course });
  } catch (err) {
    return handleDatabaseError(err, res, 'course creation');
  }
}

async function updateCourse(req, res) {
  const courseId = parseId(req.params.courseId);
  if (courseId === null) return res.status(400).json({ message: 'Select a valid course.' });
  const validation = validateCourseFields(req.body, true);
  if (validation.error) return res.status(400).json({ message: validation.error });
  try {
    const existing = await academicModel.getCourseById(courseId);
    if (!existing) return res.status(404).json({ message: 'Course not found.' });
    await auditedMutation(req, res, {
      action: 'COURSE_UPDATED', target: `courses/${courseId}`,
      details: JSON.stringify({ changed: Object.keys(validation.fields) }),
    }, (connection) => academicModel.updateCourse(courseId, validation.fields, connection));
    return res.status(200).json({ message: 'Course updated.', course: await academicModel.getCourseById(courseId) });
  } catch (err) {
    return handleDatabaseError(err, res, 'course update');
  }
}

async function listClasses(req, res) {
  let courseId = null;
  if (req.query.courseId !== undefined) {
    courseId = parseId(req.query.courseId);
    if (courseId === null) return res.status(400).json({ message: 'Select a valid course.' });
  }
  try {
    return res.status(200).json({ classes: await academicModel.listClasses(courseId) });
  } catch (err) {
    return handleDatabaseError(err, res, 'class list');
  }
}

async function getClass(req, res) {
  const classId = parseId(req.params.classId);
  if (classId === null) return res.status(400).json({ message: 'Select a valid class.' });
  try {
    const classRecord = await academicModel.getClassById(classId);
    if (!classRecord) return res.status(404).json({ message: 'Class not found.' });
    return res.status(200).json({ class: classRecord });
  } catch (err) {
    return handleDatabaseError(err, res, 'class lookup');
  }
}

async function validateRelationships(fields, res) {
  if (fields.courseId !== undefined && !(await academicModel.getCourseById(fields.courseId))) {
    res.status(400).json({ message: 'The selected course does not exist.' });
    return false;
  }
  if (fields.facultyId !== undefined && !(await academicModel.getFacultyById(fields.facultyId))) {
    res.status(400).json({ message: 'The selected faculty member does not exist.' });
    return false;
  }
  return true;
}

async function createClass(req, res) {
  const validation = validateClassFields(req.body);
  if (validation.error) return res.status(400).json({ message: validation.error });
  try {
    if (!(await validateRelationships(validation.fields, res))) return undefined;
    const classId = await auditedMutation(req, res, {
      action: 'CLASS_CREATED', target: (id) => `classes/${id}`,
      details: JSON.stringify({ courseId: validation.fields.courseId, facultyId: validation.fields.facultyId }),
    }, (connection) => academicModel.createClass(validation.fields, connection));
    return res.status(201).json({ message: 'Class created.', class: await academicModel.getClassById(classId) });
  } catch (err) {
    return handleDatabaseError(err, res, 'class creation');
  }
}

async function updateClass(req, res) {
  const classId = parseId(req.params.classId);
  if (classId === null) return res.status(400).json({ message: 'Select a valid class.' });
  const validation = validateClassFields(req.body, true);
  if (validation.error) return res.status(400).json({ message: validation.error });
  try {
    const existing = await academicModel.getClassById(classId);
    if (!existing) return res.status(404).json({ message: 'Class not found.' });
    if (!(await validateRelationships(validation.fields, res))) return undefined;
    await auditedMutation(req, res, {
      action: 'CLASS_UPDATED', target: `classes/${classId}`,
      details: JSON.stringify({ changed: Object.keys(validation.fields) }),
    }, (connection) => academicModel.updateClass(classId, validation.fields, connection));
    return res.status(200).json({ message: 'Class updated.', class: await academicModel.getClassById(classId) });
  } catch (err) {
    return handleDatabaseError(err, res, 'class update');
  }
}

async function listFaculty(_req, res) {
  try {
    return res.status(200).json({ faculty: await academicModel.listFaculty() });
  } catch (err) {
    return handleDatabaseError(err, res, 'faculty list');
  }
}

async function listStudents(_req, res) {
  try {
    return res.status(200).json({ students: await academicModel.listStudents() });
  } catch (err) {
    return handleDatabaseError(err, res, 'student list');
  }
}

async function listClassEnrollments(req, res) {
  const classId = parseId(req.params.classId);
  if (classId === null) return res.status(400).json({ message: 'Select a valid class.' });
  try {
    const classRecord = await academicModel.getClassById(classId);
    if (!classRecord) return res.status(404).json({ message: 'Class not found.' });
    return res.status(200).json({ class: classRecord, enrollments: await academicModel.listClassEnrollments(classId) });
  } catch (err) {
    return handleDatabaseError(err, res, 'enrollment list');
  }
}

async function enrollStudent(req, res) {
  const classId = parseId(req.params.classId);
  const studentId = parseBodyId(req.body.studentId);
  if (classId === null) return res.status(400).json({ message: 'Select a valid class.' });
  if (studentId === null) return res.status(400).json({ message: 'Select a valid student.' });
  try {
    const classRecord = await academicModel.getClassById(classId);
    if (!classRecord) return res.status(404).json({ message: 'Class not found.' });
    if (!(await academicModel.getStudentById(studentId))) {
      return res.status(404).json({ message: 'Student not found.' });
    }
    const enrollmentId = await auditedMutation(req, res, {
      action: 'STUDENT_ENROLLED', target: (id) => `enrollments/${id}`,
      details: JSON.stringify({ studentId, classId }),
    }, (connection) => academicModel.enrollStudent(studentId, classId, connection));
    return res.status(201).json({ message: 'Student enrolled.', enrollmentId, classId, studentId });
  } catch (err) {
    return handleDatabaseError(err, res, 'student enrollment');
  }
}

module.exports = {
  listCourses, getCourse, createCourse, updateCourse,
  listClasses, getClass, createClass, updateClass,
  listFaculty, listStudents, listClassEnrollments, enrollStudent,
};
