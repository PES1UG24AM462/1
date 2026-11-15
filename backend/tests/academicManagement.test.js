/** SAM-F-015 administrator API tests; database access is mocked like the existing suite. */

jest.mock('../src/models/academicModel');
jest.mock('../src/models/userModel');
jest.mock('../src/models/auditModel');

process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_PASSWORD = 'test';

const request = require('supertest');
const app = require('../src/server');
const academicModel = require('../src/models/academicModel');
const userModel = require('../src/models/userModel');
const auditModel = require('../src/models/auditModel');
const { generateToken } = require('../src/utils/jwtHelper');

const token = (role, userId = 1) => generateToken({ userId, username: `${role}${userId}`, role });
const auth = (role = 'admin', userId = 1) => ({ Authorization: `Bearer ${token(role, userId)}` });
const knownClass = { classId: 12, courseId: 3, facultyId: 7, courseCode: 'CS301', courseName: 'Databases', section: 'A', academicYear: '2026-27', facultyName: 'Dr Rao' };

function authenticateAs(role, userId = 1) {
  userModel.findById = jest.fn().mockImplementation(async (id) => (
    id === userId ? { user_id: userId, username: `${role}${userId}`, role, is_active: 1, full_name: 'Test User' } : null
  ));
}

beforeEach(() => {
  jest.clearAllMocks();
  authenticateAs('admin');
  auditModel.logEvent = jest.fn().mockResolvedValue(undefined);
});

describe('SAM-F-015 authorization', () => {
  test('requires authentication for academic reads', async () => {
    const response = await request(app).get('/api/admin/courses');
    expect(response.status).toBe(401);
  });

  test.each([
    ['faculty', 'post', '/api/admin/courses', { courseCode: 'CS1', courseName: 'Course' }],
    ['student', 'post', '/api/admin/classes', { courseId: 1, facultyId: 1 }],
    ['faculty', 'post', '/api/admin/classes/1/enrollments', { studentId: 1 }],
  ])('%s cannot perform an administrative academic operation', async (role, method, path, body) => {
    authenticateAs(role);
    const response = await request(app)[method](path).set(auth(role)).send(body);
    expect(response.status).toBe(403);
  });

  test('uses the database role instead of the role in a submitted token', async () => {
    authenticateAs('student');
    const response = await request(app).post('/api/admin/courses')
      .set({ Authorization: `Bearer ${token('admin')}` })
      .send({ courseCode: 'CS1', courseName: 'Course' });
    expect(response.status).toBe(403);
  });
});

describe('course management', () => {
  test('lists persisted course records from the model', async () => {
    const courses = [{ courseId: 3, courseCode: 'CS301', courseName: 'Databases', credits: 4 }];
    academicModel.listCourses = jest.fn().mockResolvedValue(courses);
    const response = await request(app).get('/api/admin/courses').set(auth());
    expect(response.status).toBe(200);
    expect(response.body.courses).toEqual(courses);
    expect(academicModel.listCourses).toHaveBeenCalledTimes(1);
  });

  test('creates a valid course and audits the administrator action', async () => {
    academicModel.createCourse = jest.fn().mockResolvedValue(3);
    academicModel.getCourseById = jest.fn().mockResolvedValue({ courseId: 3, courseCode: 'CS301', courseName: 'Databases', description: null, credits: 4 });
    const response = await request(app).post('/api/admin/courses').set(auth()).send({
      courseCode: ' CS301 ', courseName: ' Databases ', description: '', credits: 4,
    });
    expect(response.status).toBe(201);
    expect(academicModel.createCourse).toHaveBeenCalledWith({ courseCode: 'CS301', courseName: 'Databases', description: null, credits: 4 });
    expect(auditModel.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'COURSE_CREATED', target: 'courses/3' }));
  });

  test.each([
    [{ courseName: 'No code' }],
    [{ courseCode: 'CS1', courseName: '   ' }],
    [{ courseCode: 'CS1', courseName: 'Course', credits: -1 }],
    [{ courseCode: 'CS1', courseName: 'Course', credits: true }],
    [{ courseCode: 'CS1', courseName: 'Course', extra: true }],
  ])('rejects invalid course input', async (body) => {
    academicModel.createCourse = jest.fn();
    const response = await request(app).post('/api/admin/courses').set(auth()).send(body);
    expect(response.status).toBe(400);
    expect(academicModel.createCourse).not.toHaveBeenCalled();
  });

  test('maps a duplicate course code to HTTP 409', async () => {
    academicModel.createCourse = jest.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }));
    const response = await request(app).post('/api/admin/courses').set(auth()).send({ courseCode: 'CS301', courseName: 'Databases' });
    expect(response.status).toBe(409);
  });

  test('updates allowed course fields and returns 404 for a missing course', async () => {
    academicModel.getCourseById = jest.fn()
      .mockResolvedValueOnce({ courseId: 3 })
      .mockResolvedValueOnce({ courseId: 3, courseCode: 'CS302', courseName: 'Databases II' })
      .mockResolvedValueOnce(null);
    academicModel.updateCourse = jest.fn().mockResolvedValue(true);
    const updated = await request(app).patch('/api/admin/courses/3').set(auth()).send({ courseCode: 'CS302', courseName: 'Databases II' });
    expect(updated.status).toBe(200);
    expect(academicModel.updateCourse).toHaveBeenCalledWith(3, { courseCode: 'CS302', courseName: 'Databases II' });
    const missing = await request(app).patch('/api/admin/courses/99').set(auth()).send({ courseName: 'Missing' });
    expect(missing.status).toBe(404);
  });
});

describe('class management', () => {
  test('lists classes and applies a valid course filter', async () => {
    academicModel.listClasses = jest.fn().mockResolvedValue([knownClass]);
    const response = await request(app).get('/api/admin/classes?courseId=3').set(auth());
    expect(response.status).toBe(200);
    expect(response.body.classes).toEqual([knownClass]);
    expect(academicModel.listClasses).toHaveBeenCalledWith(3);
    const invalid = await request(app).get('/api/admin/classes?courseId=bad').set(auth());
    expect(invalid.status).toBe(400);
  });

  test('creates a class only with existing course and faculty relationships', async () => {
    academicModel.getCourseById = jest.fn().mockResolvedValue({ courseId: 3 });
    academicModel.getFacultyById = jest.fn().mockResolvedValue({ facultyId: 7 });
    academicModel.createClass = jest.fn().mockResolvedValue(12);
    academicModel.getClassById = jest.fn().mockResolvedValue(knownClass);
    const response = await request(app).post('/api/admin/classes').set(auth()).send({ courseId: '3', facultyId: 7, section: 'A', academicYear: '2026-27' });
    expect(response.status).toBe(201);
    expect(academicModel.createClass).toHaveBeenCalledWith({ courseId: 3, facultyId: 7, section: 'A', academicYear: '2026-27' });
    expect(auditModel.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'CLASS_CREATED', target: 'classes/12' }));
  });

  test('rejects nonexistent course and faculty references', async () => {
    academicModel.getCourseById = jest.fn().mockResolvedValue(null);
    academicModel.getFacultyById = jest.fn().mockResolvedValue(null);
    academicModel.createClass = jest.fn();
    const response = await request(app).post('/api/admin/classes').set(auth()).send({ courseId: 99, facultyId: 7 });
    expect(response.status).toBe(400);
    expect(academicModel.createClass).not.toHaveBeenCalled();
  });

  test('updates class details without allowing its course association to be silently changed', async () => {
    academicModel.getClassById = jest.fn().mockResolvedValue(knownClass);
    academicModel.getFacultyById = jest.fn().mockResolvedValue({ facultyId: 8 });
    academicModel.updateClass = jest.fn().mockResolvedValue(true);
    const invalid = await request(app).patch('/api/admin/classes/12').set(auth()).send({ courseId: 99 });
    expect(invalid.status).toBe(400);
    const updated = await request(app).patch('/api/admin/classes/12').set(auth()).send({ facultyId: 8, section: 'B' });
    expect(updated.status).toBe(200);
    expect(academicModel.updateClass).toHaveBeenCalledWith(12, { facultyId: 8, section: 'B' });
  });
});

describe('student enrollments', () => {
  test('enrolls an existing student in an existing class', async () => {
    academicModel.getClassById = jest.fn().mockResolvedValue(knownClass);
    academicModel.getStudentById = jest.fn().mockResolvedValue({ studentId: 21 });
    academicModel.enrollStudent = jest.fn().mockResolvedValue(51);
    const response = await request(app).post('/api/admin/classes/12/enrollments').set(auth()).send({ studentId: 21 });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ enrollmentId: 51, classId: 12, studentId: 21 });
    expect(academicModel.enrollStudent).toHaveBeenCalledWith(21, 12);
    expect(auditModel.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'STUDENT_ENROLLED', target: 'enrollments/51' }));
  });

  test('rejects missing students and classes', async () => {
    academicModel.getClassById = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(knownClass);
    academicModel.getStudentById = jest.fn().mockResolvedValue(null);
    academicModel.enrollStudent = jest.fn();
    const noClass = await request(app).post('/api/admin/classes/99/enrollments').set(auth()).send({ studentId: 21 });
    expect(noClass.status).toBe(404);
    const noStudent = await request(app).post('/api/admin/classes/12/enrollments').set(auth()).send({ studentId: 99 });
    expect(noStudent.status).toBe(404);
    expect(academicModel.enrollStudent).not.toHaveBeenCalled();
  });

  test('maps duplicate enrollment attempts to HTTP 409', async () => {
    academicModel.getClassById = jest.fn().mockResolvedValue(knownClass);
    academicModel.getStudentById = jest.fn().mockResolvedValue({ studentId: 21 });
    academicModel.enrollStudent = jest.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' }));
    const response = await request(app).post('/api/admin/classes/12/enrollments').set(auth()).send({ studentId: 21 });
    expect(response.status).toBe(409);
  });

  test('roster is returned only from the selected class enrollment relationship', async () => {
    const enrollmentRows = [{ enrollmentId: 51, studentId: 21, fullName: 'Asha Rao', usn: 'PES1UG24CS021' }];
    academicModel.getClassById = jest.fn().mockResolvedValue(knownClass);
    academicModel.listClassEnrollments = jest.fn().mockResolvedValue(enrollmentRows);
    const response = await request(app).get('/api/admin/classes/12/enrollments').set(auth());
    expect(response.status).toBe(200);
    expect(response.body.enrollments).toEqual(enrollmentRows);
    expect(academicModel.listClassEnrollments).toHaveBeenCalledWith(12);
  });
});
