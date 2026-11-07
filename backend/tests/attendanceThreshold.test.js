/**
 * attendanceThreshold.test.js
 * SAM-F-010 — Flag students below attendance threshold (TC-REP-02).
 *
 * Requirements:
 * - SAM-F-010: Flag students below configured attendance threshold for follow-up.
 * - AC-SAM-F-010: Students below the configured threshold are flagged.
 * - TC-REP-02: Students below the configured attendance threshold are flagged.
 */

jest.mock('../src/models/attendanceModel');
jest.mock('../src/models/facultyModel');
jest.mock('../src/models/auditModel');
jest.mock('../src/models/userModel');

process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_PASSWORD = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/server');
const attendanceModel = require('../src/models/attendanceModel');
const facultyModel = require('../src/models/facultyModel');
const auditModel = require('../src/models/auditModel');
const userModel = require('../src/models/userModel');

function tokenFor(userId, role) {
  return jwt.sign(
    { userId, username: `${role}${userId}`, role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'sams-api' }
  );
}

const MOCK_CLASS = {
  classId: 10,
  courseCode: 'CS101',
  courseName: 'Intro to CS',
  students: [
    { studentId: 1, usn: 'PES001', fullName: 'Alice' },
    { studentId: 2, usn: 'PES002', fullName: 'Bob' },
  ],
};

const MOCK_LOW_ATTENDANCE_STUDENTS = [
  {
    studentId: 2,
    usn: 'PES002',
    fullName: 'Bob',
    classId: 10,
    totalSessions: 10,
    attendedSessions: 6,
    attendancePercentage: 60.0,
    isFlagged: true,
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  auditModel.logEvent = jest.fn().mockResolvedValue(undefined);
  facultyModel.getAssignedClassRoster = jest.fn().mockResolvedValue(MOCK_CLASS);
  attendanceModel.getStudentsBelowThreshold = jest.fn().mockResolvedValue(MOCK_LOW_ATTENDANCE_STUDENTS);
  userModel.findById = jest.fn().mockImplementation((id) => {
    if (id === 1) return Promise.resolve({ user_id: 1, username: 'admin1', role: 'admin', is_active: 1 });
    if (id === 2) return Promise.resolve({ user_id: 2, username: 'faculty1', role: 'faculty', is_active: 1 });
    return Promise.resolve({ user_id: 3, username: 'student1', role: 'student', is_active: 1 });
  });
});

describe('TC-REP-02 — SAM-F-010: Flag students below attendance threshold', () => {
  test('faculty can retrieve low attendance report with default 75% threshold', async () => {
    const res = await request(app)
      .get('/api/reports/low-attendance?classId=10')
      .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

    expect(res.status).toBe(200);
    expect(res.body.threshold).toBe(75);
    expect(res.body.classId).toBe(10);
    expect(res.body.flaggedCount).toBe(1);
    expect(res.body.students[0].isFlagged).toBe(true);
    expect(res.body.students[0].attendancePercentage).toBe(60.0);
    expect(attendanceModel.getStudentsBelowThreshold).toHaveBeenCalledWith({
      classId: 10,
      threshold: 75,
    });
    expect(auditModel.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REPORT_LOW_ATTENDANCE' })
    );
  });

  test('accepts custom configured threshold (e.g. 85%)', async () => {
    const res = await request(app)
      .get('/api/reports/low-attendance?classId=10&threshold=85')
      .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

    expect(res.status).toBe(200);
    expect(res.body.threshold).toBe(85);
    expect(attendanceModel.getStudentsBelowThreshold).toHaveBeenCalledWith({
      classId: 10,
      threshold: 85,
    });
  });

  test('admin can access low-attendance report for any class', async () => {
    const res = await request(app)
      .get('/api/reports/low-attendance?classId=10')
      .set('Authorization', `Bearer ${tokenFor(1, 'admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.flaggedCount).toBe(1);
    // Faculty class assignment check is bypassed for admin
    expect(facultyModel.getAssignedClassRoster).not.toHaveBeenCalled();
  });

  test('rejects threshold outside 1-100 range with 400', async () => {
    const res = await request(app)
      .get('/api/reports/low-attendance?classId=10&threshold=150')
      .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/between 1 and 100/i);
  });

  test('rejects missing or non-integer classId with 400', async () => {
    const res = await request(app)
      .get('/api/reports/low-attendance')
      .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid classId/i);
  });

  test('returns 404 if faculty requests a class not assigned to them', async () => {
    facultyModel.getAssignedClassRoster = jest.fn().mockResolvedValue(null);

    const res = await request(app)
      .get('/api/reports/low-attendance?classId=99')
      .set('Authorization', `Bearer ${tokenFor(2, 'faculty')}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not assigned to you/i);
  });

  test('denies access to student role with 403', async () => {
    const res = await request(app)
      .get('/api/reports/low-attendance?classId=10')
      .set('Authorization', `Bearer ${tokenFor(3, 'student')}`);

    expect(res.status).toBe(403);
  });

  test('denies unauthenticated requests with 401', async () => {
    const res = await request(app)
      .get('/api/reports/low-attendance?classId=10');

    expect(res.status).toBe(401);
  });
});
