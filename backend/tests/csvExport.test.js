/**
 * csvExport.test.js
 * Unit tests for SAM-F-013 — Export attendance reports as CSV.
 *
 * TC-REP-05: The exported CSV file contains all required columns,
 *            is downloaded with correct headers, and is valid RFC 4180 CSV.
 *
 * Tests cover:
 *   1. csvHelper.reportToCsv — output format, required columns, escaping
 *   2. GET /api/reports/attendance/export — HTTP 200, correct headers, CSV body
 *   3. Auth: 401 without token, 403 for student role
 *   4. Validation: 400 for missing/invalid params
 */

jest.mock('../src/models/reportModel');
jest.mock('../src/models/userModel');
jest.mock('../src/models/auditModel');
jest.mock('../src/config/database', () => ({ pool: { execute: jest.fn(), on: jest.fn() } }));

process.env.JWT_SECRET     = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_PASSWORD    = 'test';
process.env.ATTENDANCE_THRESHOLD = '75';

const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../src/server');
const reportModel = require('../src/models/reportModel');
const userModel   = require('../src/models/userModel');
const auditModel  = require('../src/models/auditModel');
const { reportToCsv, csvFilename, escapeField } = require('../src/utils/csvHelper');

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeToken(role) {
  return jwt.sign(
    { userId: role === 'faculty' ? 2 : 3, username: role, role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'sams-api' }
  );
}

// Minimal report object matching buildAttendanceReport output
const MOCK_REPORT = {
  class: { classId: 10, courseId: 1, courseCode: 'CS301', courseName: 'Data Structures', section: 'A', academicYear: '2026-27' },
  dateRange: { from: '2026-10-01', to: '2026-10-31' },
  generatedAt: '2026-10-31T12:00:00.000Z',
  threshold: 75,
  summary: {
    studentCount: 2,
    totalEligibleClasses: 10,
    recordedClassDates: 5,
    totalPresent: 7,
    totalLate: 1,
    totalAbsent: 2,
    totalAttended: 8,
    overallAttendancePercentage: 80.00,
    averageAttendancePercentage: 80.00,
    belowThresholdCount: 1,
  },
  students: [
    { studentId: 1, studentNumber: 'PES001', fullName: 'Alice',       eligibleClassesHeld: 5, presentCount: 4, lateCount: 1, absentCount: 0, attendanceCount: 5, attendancePercentage: 100.00, belowThreshold: false },
    { studentId: 2, studentNumber: 'PES002', fullName: 'Bob, Jr.',    eligibleClassesHeld: 5, presentCount: 3, lateCount: 0, absentCount: 2, attendanceCount: 3, attendancePercentage: 60.00,  belowThreshold: true  },
  ],
};

// DB rows that reportModel.getAttendanceRows returns (simplified)
const MOCK_DB_ROWS = [
  { classId: 10, courseId: 1, courseCode: 'CS301', courseName: 'Data Structures', section: 'A', academicYear: '2026-27', attendanceId: 1, studentId: 1, studentNumber: 'PES001', fullName: 'Alice',    attendanceDate: '2026-10-01', status: 'Present' },
  { classId: 10, courseId: 1, courseCode: 'CS301', courseName: 'Data Structures', section: 'A', academicYear: '2026-27', attendanceId: 2, studentId: 2, studentNumber: 'PES002', fullName: 'Bob, Jr.', attendanceDate: '2026-10-01', status: 'Absent'  },
];

const VALID_PARAMS = '?classId=10&courseId=1&from=2026-10-01&to=2026-10-31';

beforeEach(() => {
  jest.clearAllMocks();
  auditModel.logEvent = jest.fn().mockResolvedValue(undefined);
  reportModel.getAttendanceRows   = jest.fn().mockResolvedValue(MOCK_DB_ROWS);
  reportModel.hasReportStudent    = jest.fn().mockResolvedValue(true);
  reportModel.listReportClasses   = jest.fn().mockResolvedValue([]);
  userModel.findById = jest.fn().mockResolvedValue({ user_id: 2, username: 'faculty', role: 'faculty', is_active: 1 });
});

// ── 1. csvHelper unit tests ───────────────────────────────────────────────────
describe('csvHelper — reportToCsv', () => {
  test('should include course code and name in the metadata section', () => {
    const csv = reportToCsv(MOCK_REPORT);
    expect(csv).toContain('CS301');
    expect(csv).toContain('Data Structures');
  });

  test('should include all required student columns', () => {
    const csv = reportToCsv(MOCK_REPORT);
    expect(csv).toContain('USN');
    expect(csv).toContain('Student Name');
    expect(csv).toContain('Present');
    expect(csv).toContain('Late');
    expect(csv).toContain('Absent');
    expect(csv).toContain('Attendance %');
    expect(csv).toContain('Below Threshold');
  });

  test('should include per-student data rows', () => {
    const csv = reportToCsv(MOCK_REPORT);
    expect(csv).toContain('PES001');
    expect(csv).toContain('Alice');
    expect(csv).toContain('100%');
    expect(csv).toContain('PES002');
    expect(csv).toContain('60%');
  });

  test('should correctly flag students below the threshold', () => {
    const csv = reportToCsv(MOCK_REPORT);
    // Alice is above — should say No
    // Bob is below  — should say Yes
    const lines = csv.split('\r\n');
    const aliceLine = lines.find(l => l.includes('PES001'));
    const bobLine   = lines.find(l => l.includes('PES002'));
    expect(aliceLine).toContain('No');
    expect(bobLine).toContain('Yes');
  });

  test('should properly escape fields containing commas (RFC 4180)', () => {
    // "Bob, Jr." contains a comma — must be wrapped in double-quotes in CSV
    const csv = reportToCsv(MOCK_REPORT);
    expect(csv).toContain('"Bob, Jr."');
  });

  test('escapeField should wrap comma-containing values in double quotes', () => {
    expect(escapeField('Smith, John')).toBe('"Smith, John"');
  });

  test('escapeField should escape embedded double-quotes as ""', () => {
    expect(escapeField('He said "hello"')).toBe('"He said ""hello"""');
  });

  test('escapeField should return empty string for null/undefined', () => {
    expect(escapeField(null)).toBe('');
    expect(escapeField(undefined)).toBe('');
  });

  test('csvFilename should build a descriptive safe filename', () => {
    const filename = csvFilename(MOCK_REPORT);
    expect(filename).toMatch(/^SAMS_CS301_SectionA_2026-10-01_2026-10-31\.csv$/);
  });
});

// ── 2. GET /api/reports/attendance/export — HTTP tests ────────────────────────
describe('TC-REP-05 — SAM-F-013: GET /api/reports/attendance/export', () => {

  test('should return 200 with text/csv content-type for valid faculty request', async () => {
    const res = await request(app)
      .get(`/api/reports/attendance/export${VALID_PARAMS}`)
      .set('Authorization', `Bearer ${makeToken('faculty')}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
  });

  test('should set Content-Disposition: attachment with .csv filename', async () => {
    const res = await request(app)
      .get(`/api/reports/attendance/export${VALID_PARAMS}`)
      .set('Authorization', `Bearer ${makeToken('faculty')}`);

    expect(res.headers['content-disposition']).toMatch(/attachment/);
    expect(res.headers['content-disposition']).toMatch(/\.csv/);
  });

  test('CSV body should contain course code and student columns', async () => {
    const res = await request(app)
      .get(`/api/reports/attendance/export${VALID_PARAMS}`)
      .set('Authorization', `Bearer ${makeToken('faculty')}`);

    expect(res.text).toContain('CS301');
    expect(res.text).toContain('USN');
    expect(res.text).toContain('Student Name');
    expect(res.text).toContain('Attendance %');
  });

  test('should audit the export action (SAM-SR-004)', async () => {
    await request(app)
      .get(`/api/reports/attendance/export${VALID_PARAMS}`)
      .set('Authorization', `Bearer ${makeToken('faculty')}`);

    expect(auditModel.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REPORT_EXPORT_CSV' })
    );
  });

  test('should return 401 with no token', async () => {
    const res = await request(app).get(`/api/reports/attendance/export${VALID_PARAMS}`);
    expect(res.status).toBe(401);
  });

  test('should return 403 for student role (SAM-SR-003)', async () => {
    userModel.findById = jest.fn().mockResolvedValue({ user_id: 3, username: 'student', role: 'student', is_active: 1 });
    const res = await request(app)
      .get(`/api/reports/attendance/export${VALID_PARAMS}`)
      .set('Authorization', `Bearer ${makeToken('student')}`);
    expect(res.status).toBe(403);
  });

  test('should return 400 when classId is missing', async () => {
    const res = await request(app)
      .get('/api/reports/attendance/export?courseId=1&from=2026-10-01&to=2026-10-31')
      .set('Authorization', `Bearer ${makeToken('faculty')}`);
    expect(res.status).toBe(400);
  });

  test('should return 400 for invalid date format', async () => {
    const res = await request(app)
      .get('/api/reports/attendance/export?classId=10&courseId=1&from=01-10-2026&to=31-10-2026')
      .set('Authorization', `Bearer ${makeToken('faculty')}`);
    expect(res.status).toBe(400);
  });

  test('should return 400 when end date is before start date', async () => {
    const res = await request(app)
      .get('/api/reports/attendance/export?classId=10&courseId=1&from=2026-10-31&to=2026-10-01')
      .set('Authorization', `Bearer ${makeToken('faculty')}`);
    expect(res.status).toBe(400);
  });

  test('should return 404 when no attendance rows found', async () => {
    reportModel.getAttendanceRows = jest.fn().mockResolvedValue([]);
    const res = await request(app)
      .get(`/api/reports/attendance/export${VALID_PARAMS}`)
      .set('Authorization', `Bearer ${makeToken('faculty')}`);
    expect(res.status).toBe(404);
  });
});
