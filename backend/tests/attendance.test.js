/**
 * attendance.test.js
 * Unit tests for POST /api/attendance (SAM-F-005)
 *
 * TC-ATT-02 — Faculty marks each student Present, Absent, or Late.
 *
 * DB layer and faculty model are mocked — no live MySQL required.
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

// Generate a valid faculty JWT for test requests
function facultyToken() {
  return jwt.sign(
    { userId: 2, username: 'faculty1', role: 'faculty' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'sams-api' }
  );
}

// Shared mock class roster
const MOCK_CLASS = {
  classId: 10,
  courseCode: 'CS101',
  courseName: 'Intro to CS',
  section: 'A',
  academicYear: '2026-27',
  students: [
    { studentId: 1, usn: 'PES001', fullName: 'Alice', department: 'CS', semester: 3 },
    { studentId: 2, usn: 'PES002', fullName: 'Bob',   department: 'CS', semester: 3 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  auditModel.logEvent = jest.fn().mockResolvedValue(undefined);
  facultyModel.getAssignedClassRoster = jest.fn().mockResolvedValue(MOCK_CLASS);
  attendanceModel.saveAttendanceRecords = jest.fn().mockResolvedValue(2);
  attendanceModel.getAttendanceForSession = jest.fn().mockResolvedValue([]);
  // Mock the DB account lookup inside authMiddleware
  userModel.findById = jest.fn().mockResolvedValue({
    user_id: 2, username: 'faculty1', role: 'faculty', is_active: 1,
  });
});

const VALID_BODY = {
  classId: 10,
  date: '2026-10-22',
  records: [
    { studentId: 1, status: 'Present' },
    { studentId: 2, status: 'Absent' },
  ],
};

// ── TC-ATT-02: Valid submission ──────────────────────────────────────────────
describe('TC-ATT-02 — SAM-F-005: Mark attendance with valid statuses', () => {

  test('should return 200 with savedCount for valid attendance submission', async () => {
    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${facultyToken()}`)
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('message', 'Attendance saved successfully.');
    expect(res.body).toHaveProperty('savedCount', 2);
    expect(attendanceModel.saveAttendanceRecords).toHaveBeenCalledWith(
      expect.objectContaining({ classId: 10, date: '2026-10-22' })
    );
    // SAM-SR-004: audit logged
    expect(auditModel.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ATTENDANCE_SUBMIT' })
    );
  });

  test('should accept all three valid statuses: Present, Absent, Late', async () => {
    attendanceModel.saveAttendanceRecords = jest.fn().mockResolvedValue(3);
    facultyModel.getAssignedClassRoster = jest.fn().mockResolvedValue({
      ...MOCK_CLASS,
      students: [
        { studentId: 1, usn: 'PES001', fullName: 'Alice' },
        { studentId: 2, usn: 'PES002', fullName: 'Bob' },
        { studentId: 3, usn: 'PES003', fullName: 'Carol' },
      ],
    });

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${facultyToken()}`)
      .send({
        classId: 10,
        date: '2026-10-22',
        records: [
          { studentId: 1, status: 'Present' },
          { studentId: 2, status: 'Absent' },
          { studentId: 3, status: 'Late' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.savedCount).toBe(3);
  });

  // ── Invalid status ────────────────────────────────────────────────────────
  test('should return 400 for an invalid status value', async () => {
    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${facultyToken()}`)
      .send({
        ...VALID_BODY,
        records: [{ studentId: 1, status: 'OnTime' }], // invalid
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Invalid status/);
  });

  // ── Student not enrolled ──────────────────────────────────────────────────
  test('should return 400 if a studentId is not enrolled in the class', async () => {
    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${facultyToken()}`)
      .send({
        ...VALID_BODY,
        records: [{ studentId: 99, status: 'Present' }], // not in roster
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not enrolled/);
  });

  // ── Class not assigned to faculty ─────────────────────────────────────────
  test('should return 404 if class is not assigned to the faculty', async () => {
    facultyModel.getAssignedClassRoster = jest.fn().mockResolvedValue(null);

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${facultyToken()}`)
      .send(VALID_BODY);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not assigned/);
  });

  // ── Unauthenticated ────────────────────────────────────────────────────────
  test('should return 401 with no token', async () => {
    const res = await request(app)
      .post('/api/attendance')
      .send(VALID_BODY);

    expect(res.status).toBe(401);
  });

  // ── Student role blocked (SAM-SR-003) ─────────────────────────────────────
  test('should return 403 if a student tries to submit attendance', async () => {
    const studentToken = jwt.sign(
      { userId: 3, username: 'student1', role: 'student' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h', issuer: 'sams-api' }
    );
    // Override the userModel mock for this test to return a student account
    userModel.findById = jest.fn().mockResolvedValue({
      user_id: 3, username: 'student1', role: 'student', is_active: 1,
    });

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${studentToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(403);
  });

  // ── Missing fields ─────────────────────────────────────────────────────────
  test('should return 400 when records array is empty', async () => {
    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${facultyToken()}`)
      .send({ classId: 10, date: '2026-10-22', records: [] });

    expect(res.status).toBe(400);
  });

  test('should return 400 for an invalid date format', async () => {
    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${facultyToken()}`)
      .send({ ...VALID_BODY, date: '22-10-2026' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/date/i);
  });
});
