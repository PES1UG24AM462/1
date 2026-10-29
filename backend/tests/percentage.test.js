/**
 * percentage.test.js
 * Unit tests for GET /api/student/attendance/percentage (SAM-F-009)
 *
 * TC-REP-01 — System calculates accurate attendance percentage per student/course.
 *
 * All DB layers mocked — no live MySQL required.
 */

jest.mock('../src/models/percentageModel');
jest.mock('../src/models/studentModel');
jest.mock('../src/models/userModel');

process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_PASSWORD = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/server');
const percentageModel = require('../src/models/percentageModel');
const studentModel = require('../src/models/studentModel');
const userModel = require('../src/models/userModel');

// ── Helpers ──────────────────────────────────────────────────────────────────
function studentToken() {
  return jwt.sign(
    { userId: 3, username: 'student1', role: 'student' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'sams-api' }
  );
}

function facultyToken() {
  return jwt.sign(
    { userId: 2, username: 'faculty1', role: 'faculty' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'sams-api' }
  );
}

// Realistic mock data: 4 Present + 1 Late + 1 Absent = 6 total → 83.33%
const MOCK_PERCENTAGES = [
  {
    courseId: 1,
    courseCode: 'CS101',
    courseName: 'Intro to CS',
    classId: 10,
    section: 'A',
    academicYear: '2026-27',
    totalClasses: 6,
    present: 4,
    late: 1,
    absent: 1,
    attended: 5,
    percentage: 83.33,
  },
  {
    courseId: 2,
    courseCode: 'MATH201',
    courseName: 'Linear Algebra',
    classId: 11,
    section: null,
    academicYear: '2026-27',
    totalClasses: 4,
    present: 2,
    late: 0,
    absent: 2,
    attended: 2,
    percentage: 50.00,   // below 75% threshold
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  // Default: authMiddleware account lookup returns a student
  userModel.findById = jest.fn().mockResolvedValue({
    user_id: 3, username: 'student1', role: 'student', is_active: 1,
  });
  percentageModel.getAttendancePercentages = jest.fn().mockResolvedValue(MOCK_PERCENTAGES);
  studentModel.hasCourseAccess = jest.fn().mockResolvedValue(true);
});

// ── TC-REP-01 ────────────────────────────────────────────────────────────────
describe('TC-REP-01 — SAM-F-009: Calculate accurate attendance percentages', () => {

  // ── All courses ───────────────────────────────────────────────────────────
  test('should return 200 with percentage array for all courses', async () => {
    const res = await request(app)
      .get('/api/student/attendance/percentage')
      .set('Authorization', `Bearer ${studentToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('percentages');
    expect(Array.isArray(res.body.percentages)).toBe(true);
    expect(res.body.percentages).toHaveLength(2);

    const cs101 = res.body.percentages[0];
    expect(cs101.courseCode).toBe('CS101');
    expect(cs101.totalClasses).toBe(6);
    expect(cs101.present).toBe(4);
    expect(cs101.late).toBe(1);
    expect(cs101.absent).toBe(1);
    expect(cs101.attended).toBe(5);
    expect(cs101.percentage).toBe(83.33);
  });

  // ── Percentage formula: (present + late) / total * 100 ───────────────────
  test('percentage = (present + late) / total * 100 rounded to 2dp', async () => {
    // 4 present + 1 late = 5 attended / 6 total = 83.3333... → 83.33
    const res = await request(app)
      .get('/api/student/attendance/percentage')
      .set('Authorization', `Bearer ${studentToken()}`);

    const cs101 = res.body.percentages[0];
    const expected = parseFloat(((cs101.present + cs101.late) / cs101.totalClasses * 100).toFixed(2));
    expect(cs101.percentage).toBeCloseTo(expected, 2);
  });

  // ── Low attendance flagged ────────────────────────────────────────────────
  test('should include courses below 75% threshold in the response', async () => {
    const res = await request(app)
      .get('/api/student/attendance/percentage')
      .set('Authorization', `Bearer ${studentToken()}`);

    const math = res.body.percentages.find((p) => p.courseCode === 'MATH201');
    expect(math).toBeDefined();
    expect(math.percentage).toBeLessThan(75);
  });

  // ── Filter by courseId ────────────────────────────────────────────────────
  test('should return percentages for a specific courseId', async () => {
    percentageModel.getAttendancePercentages = jest.fn().mockResolvedValue([MOCK_PERCENTAGES[0]]);

    const res = await request(app)
      .get('/api/student/attendance/percentage?courseId=1')
      .set('Authorization', `Bearer ${studentToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.percentages).toHaveLength(1);
    expect(res.body.percentages[0].courseCode).toBe('CS101');
    expect(percentageModel.getAttendancePercentages).toHaveBeenCalledWith(3, 1);
  });

  // ── No records yet ────────────────────────────────────────────────────────
  test('should return empty array when student has no attendance records', async () => {
    percentageModel.getAttendancePercentages = jest.fn().mockResolvedValue([]);

    const res = await request(app)
      .get('/api/student/attendance/percentage')
      .set('Authorization', `Bearer ${studentToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.percentages).toHaveLength(0);
  });

  // ── 100% attendance ───────────────────────────────────────────────────────
  test('should correctly return 100% when all classes attended', async () => {
    percentageModel.getAttendancePercentages = jest.fn().mockResolvedValue([{
      ...MOCK_PERCENTAGES[0],
      totalClasses: 10, present: 10, late: 0, absent: 0, attended: 10, percentage: 100.00,
    }]);

    const res = await request(app)
      .get('/api/student/attendance/percentage')
      .set('Authorization', `Bearer ${studentToken()}`);

    expect(res.body.percentages[0].percentage).toBe(100);
  });

  // ── 0% attendance ─────────────────────────────────────────────────────────
  test('should correctly return 0% when all classes absent', async () => {
    percentageModel.getAttendancePercentages = jest.fn().mockResolvedValue([{
      ...MOCK_PERCENTAGES[0],
      totalClasses: 5, present: 0, late: 0, absent: 5, attended: 0, percentage: 0.00,
    }]);

    const res = await request(app)
      .get('/api/student/attendance/percentage')
      .set('Authorization', `Bearer ${studentToken()}`);

    expect(res.body.percentages[0].percentage).toBe(0);
  });

  // ── Course not found / no access ─────────────────────────────────────────
  test('should return 404 if student does not have access to the requested course', async () => {
    studentModel.hasCourseAccess = jest.fn().mockResolvedValue(false);

    const res = await request(app)
      .get('/api/student/attendance/percentage?courseId=99')
      .set('Authorization', `Bearer ${studentToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  // ── Invalid courseId ──────────────────────────────────────────────────────
  test('should return 400 for non-numeric courseId', async () => {
    const res = await request(app)
      .get('/api/student/attendance/percentage?courseId=abc')
      .set('Authorization', `Bearer ${studentToken()}`);

    expect(res.status).toBe(400);
  });

  // ── Unauthenticated ───────────────────────────────────────────────────────
  test('should return 401 with no token', async () => {
    const res = await request(app)
      .get('/api/student/attendance/percentage');

    expect(res.status).toBe(401);
  });

  // ── Faculty blocked (SAM-SR-003 / SAM-SR-005) ─────────────────────────────
  test('should return 403 if faculty tries to access student percentages', async () => {
    userModel.findById = jest.fn().mockResolvedValue({
      user_id: 2, username: 'faculty1', role: 'faculty', is_active: 1,
    });

    const res = await request(app)
      .get('/api/student/attendance/percentage')
      .set('Authorization', `Bearer ${facultyToken()}`);

    expect(res.status).toBe(403);
  });
});
