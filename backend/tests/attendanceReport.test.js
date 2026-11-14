/** SAM-F-011 / AC-SAM-F-011 report behavior: TC-REP-03. */

jest.mock('../src/models/reportModel');
jest.mock('../src/models/attendanceModel');
jest.mock('../src/models/facultyModel');
jest.mock('../src/models/auditModel');
jest.mock('../src/models/userModel');

process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_PASSWORD = 'test';

afterEach(() => jest.clearAllMocks());

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/server');
const reportModel = require('../src/models/reportModel');
const auditModel = require('../src/models/auditModel');
const userModel = require('../src/models/userModel');

function tokenFor(userId, role) {
  return jwt.sign(
    { userId, username: `${role}${userId}`, role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'sams-api' }
  );
}

function row(studentId, status, attendanceDate, overrides = {}) {
  return {
    classId: 10,
    courseId: 3,
    courseCode: 'CS301',
    courseName: 'Algorithms',
    section: 'B',
    academicYear: '2026-27',
    studentId,
    studentNumber: studentId ? `PES${studentId}` : null,
    fullName: studentId ? `Student ${studentId}` : null,
    status,
    attendanceDate,
    ...overrides,
  };
}

const filters = { courseId: '3', classId: '10', from: '2026-10-01', to: '2026-10-31' };

beforeEach(() => {
  auditModel.logEvent = jest.fn().mockResolvedValue(undefined);
  userModel.findById = jest.fn().mockImplementation((id) => Promise.resolve({
    user_id: id,
    username: id === 1 ? 'admin1' : 'faculty1',
    role: id === 1 ? 'admin' : 'faculty',
    is_active: 1,
  }));
});

test('authorized faculty generates a correctly grouped date-range report from database rows', async () => {
  reportModel.getAttendanceRows.mockResolvedValue([
    row(1, 'Present', filters.from),
    row(1, 'Late', '2026-10-15'),
    row(1, 'Absent', filters.to),
    row(2, 'Present', filters.from),
    row(2, 'Present', '2026-10-15'),
    row(2, 'Present', filters.to),
    row(2, 'Absent', '2026-10-20'),
  ]);

  const response = await request(app)
    .get('/api/reports/attendance')
    .query(filters)
    .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

  expect(response.status).toBe(200);
  expect(response.body.dateRange).toEqual({ from: filters.from, to: filters.to });
  expect(response.body.class).toMatchObject({ classId: 10, courseId: 3, courseCode: 'CS301' });
  expect(response.body.students[0]).toMatchObject({
    studentId: 1,
    presentCount: 1,
    lateCount: 1,
    absentCount: 1,
    attendanceCount: 2,
    eligibleClassesHeld: 3,
    attendancePercentage: 66.67,
    belowThreshold: true,
  });
  expect(response.body.students[1]).toMatchObject({
    studentId: 2,
    eligibleClassesHeld: 4,
    attendancePercentage: 75,
    belowThreshold: false,
  });
  expect(response.body.summary.overallAttendancePercentage).toBe(71.43);
  expect(new Date(response.body.generatedAt).toISOString()).toBe(response.body.generatedAt);
  expect(reportModel.getAttendanceRows).toHaveBeenCalledWith({
    classId: 10,
    courseId: 3,
    studentId: null,
    from: filters.from,
    to: filters.to,
    userId: 2,
    role: 'faculty',
  });
  expect(auditModel.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'REPORT_ATTENDANCE' }));
});

test('administrator can generate report for any class without faculty-scoped access', async () => {
  reportModel.getAttendanceRows.mockResolvedValue([row(null, null, null)]);
  userModel.findById.mockResolvedValue({ user_id: 1, username: 'admin1', role: 'admin', is_active: 1 });

  const response = await request(app)
    .get('/api/reports/attendance')
    .query(filters)
    .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`);

  expect(response.status).toBe(200);
  expect(response.body.students).toEqual([]);
  expect(response.body.summary.overallAttendancePercentage).toBeNull();
  expect(reportModel.getAttendanceRows).toHaveBeenCalledWith(expect.objectContaining({ role: 'admin', userId: 1 }));
});

test.each([
  [{ ...filters, classId: 'abc' }],
  [{ ...filters, courseId: '1.5' }],
  [{ ...filters, from: '2026-02-30' }],
  [{ ...filters, to: '10/31/2026' }],
  [{ ...filters, from: '2026-11-01', to: '2026-10-31' }],
])('rejects invalid report filter %j before querying attendance', async (query) => {
  const response = await request(app)
    .get('/api/reports/attendance')
    .query(query)
    .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

  expect(response.status).toBe(400);
  expect(reportModel.getAttendanceRows).not.toHaveBeenCalled();
});

test('class/course mismatch or unauthorized faculty class returns a non-disclosing 404', async () => {
  reportModel.getAttendanceRows.mockResolvedValue([]);
  const response = await request(app)
    .get('/api/reports/attendance')
    .query(filters)
    .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

  expect(response.status).toBe(404);
  expect(response.body).not.toHaveProperty('students');
});

test('student filter is validated against class membership and applied with other filters', async () => {
  reportModel.hasReportStudent.mockResolvedValue(true);
  reportModel.getAttendanceRows.mockResolvedValue([row(2, 'Present', filters.from)]);
  const response = await request(app)
    .get('/api/reports/attendance')
    .query({ ...filters, studentId: '2' })
    .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

  expect(response.status).toBe(200);
  expect(response.body.students).toHaveLength(1);
  expect(response.body.students[0].studentId).toBe(2);
  expect(reportModel.hasReportStudent).toHaveBeenCalledWith(10, 2, 3, 2, 'faculty');
  expect(reportModel.getAttendanceRows).toHaveBeenCalledWith(expect.objectContaining({
    classId: 10, courseId: 3, studentId: 2, from: filters.from, to: filters.to,
  }));
});

test('rejects a student who is not associated with the selected class', async () => {
  reportModel.hasReportStudent.mockResolvedValue(false);
  const response = await request(app)
    .get('/api/reports/attendance')
    .query({ ...filters, studentId: '999' })
    .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

  expect(response.status).toBe(404);
  expect(reportModel.getAttendanceRows).not.toHaveBeenCalled();
});

test('rejects malformed student IDs before querying the database', async () => {
  const response = await request(app)
    .get('/api/reports/attendance')
    .query({ ...filters, studentId: '1.5' })
    .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

  expect(response.status).toBe(400);
  expect(reportModel.hasReportStudent).not.toHaveBeenCalled();
});

test('student and unauthenticated users cannot access attendance reports', async () => {
  userModel.findById.mockResolvedValue({ user_id: 3, username: 'student1', role: 'student', is_active: 1 });
  const studentResponse = await request(app)
    .get('/api/reports/attendance')
    .query(filters)
    .set('Authorization', `Bearer ${tokenFor(3, 'student')}`);
  const anonymousResponse = await request(app).get('/api/reports/attendance').query(filters);

  expect(studentResponse.status).toBe(403);
  expect(anonymousResponse.status).toBe(401);
  expect(reportModel.getAttendanceRows).not.toHaveBeenCalled();
});

test('report class selection uses actual role-scoped database classes', async () => {
  reportModel.listReportClasses.mockResolvedValue([{ classId: 10, courseId: 3, courseCode: 'CS301' }]);
  const response = await request(app)
    .get('/api/reports/classes')
    .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

  expect(response.status).toBe(200);
  expect(response.body.classes).toEqual([{ classId: 10, courseId: 3, courseCode: 'CS301' }]);
  expect(reportModel.listReportClasses).toHaveBeenCalledWith(2, 'faculty');
});

test('report students are listed only after the requested class passes the role-scoped class check', async () => {
  reportModel.listReportClasses.mockResolvedValue([{ classId: 10, courseId: 3 }]);
  reportModel.listReportStudents.mockResolvedValue([{ studentId: 2, studentNumber: 'PES2', fullName: 'Student 2' }]);
  const response = await request(app)
    .get('/api/reports/students?classId=10')
    .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

  expect(response.status).toBe(200);
  expect(response.body.students[0].studentId).toBe(2);
  expect(reportModel.listReportStudents).toHaveBeenCalledWith(10, 2, 'faculty');
});

test('database failures return a generic report error without leaking database details', async () => {
  reportModel.getAttendanceRows.mockRejectedValue(new Error('sensitive SQL details'));
  const response = await request(app)
    .get('/api/reports/attendance')
    .query(filters)
    .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

  expect(response.status).toBe(500);
  expect(response.body.message).toBe('Unable to generate attendance report. Please try again.');
  expect(JSON.stringify(response.body)).not.toContain('sensitive SQL details');
});

test('client-supplied attendance totals and percentages are ignored by the backend', async () => {
  reportModel.getAttendanceRows.mockResolvedValue([
    row(1, 'Present', filters.from),
    row(1, 'Absent', filters.to),
  ]);
  const response = await request(app)
    .get('/api/reports/attendance')
    .query({ ...filters, attendancePercentage: '100', attendanceCount: '500' })
    .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

  expect(response.status).toBe(200);
  expect(response.body.students[0].attendancePercentage).toBe(50);
  expect(response.body.students[0].attendanceCount).toBe(1);
});
