/**
 * duplicateAttendance.test.js
 * SAM-F-006 — Prevent duplicate attendance records (TC-ATT-03).
 *
 * Requirements:
 * - SAM-F-006: Prevent duplicate attendance records for the same student, class, and date.
 * - AC-SAM-F-006: Duplicate submission is rejected or updates the existing record.
 * - TC-ATT-03: A duplicate attendance record for the same student, class, and date is rejected or safely updated.
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

function facultyToken() {
  return jwt.sign(
    { userId: 2, username: 'faculty1', role: 'faculty' },
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

beforeEach(() => {
  jest.clearAllMocks();
  auditModel.logEvent = jest.fn().mockResolvedValue(undefined);
  facultyModel.getAssignedClassRoster = jest.fn().mockResolvedValue(MOCK_CLASS);
  attendanceModel.saveAttendanceRecords = jest.fn().mockResolvedValue({
    savedCount: 2, insertedCount: 2, corrections: [],
  });
  userModel.findById = jest.fn().mockResolvedValue({
    user_id: 2, username: 'faculty1', role: 'faculty', is_active: 1,
  });
});

describe('TC-ATT-03 — SAM-F-006: Prevent duplicate attendance records', () => {
  test('rejects duplicate studentId within the same submission batch with 400', async () => {
    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${facultyToken()}`)
      .send({
        classId: 10,
        date: '2026-10-22',
        records: [
          { studentId: 1, status: 'Present' },
          { studentId: 1, status: 'Absent' }, // duplicate in payload
        ],
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Duplicate student ID 1 in submission/i);
    expect(attendanceModel.saveAttendanceRecords).not.toHaveBeenCalled();
  });

  test('safely updates existing attendance records on re-submission (no duplicate rows created)', async () => {
    // Existing rows are updated in place without creating duplicate records.
    attendanceModel.saveAttendanceRecords = jest.fn().mockResolvedValue({
      savedCount: 2, insertedCount: 0, corrections: [],
    });

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${facultyToken()}`)
      .send({
        classId: 10,
        date: '2026-10-22',
        records: [
          { studentId: 1, status: 'Late' }, // updated from Present to Late
          { studentId: 2, status: 'Present' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('savedCount', 2);
    expect(res.body.message).toMatch(/Attendance saved successfully/i);
  });

  test('surfaces 409 Conflict if database throws ER_DUP_ENTRY', async () => {
    const dbError = new Error('Duplicate entry for key uq_attendance');
    dbError.code = 'ER_DUP_ENTRY';
    attendanceModel.saveAttendanceRecords = jest.fn().mockRejectedValue(dbError);

    const res = await request(app)
      .post('/api/attendance')
      .set('Authorization', `Bearer ${facultyToken()}`)
      .send({
        classId: 10,
        date: '2026-10-22',
        records: [
          { studentId: 1, status: 'Present' },
          { studentId: 2, status: 'Absent' },
        ],
      });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/Duplicate attendance record detected/i);
  });
});
