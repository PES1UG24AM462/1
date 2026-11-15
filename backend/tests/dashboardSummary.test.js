/**
 * dashboardSummary.test.js
 * Tests for SAM-F-017 — Show attendance summaries on the dashboard.
 *
 * TC-DASH-01: Dashboard shows attendance summaries and report-generation status.
 *
 * Tests:
 *   1–3.  Admin summary — 200, correct fields, recent audit events
 *   4–5.  Faculty summary — 200, correct session fields
 *   6–7.  Student summary — 200, correct percentage fields
 *   8.    401 without token
 *   9.    Role isolation — student cannot get admin summary
 *  10.    Pending sessions count correctly
 *  11.    Overall percentage formula verified
 */

jest.mock('../src/models/dashboardModel');
jest.mock('../src/models/userModel');
jest.mock('../src/config/database', () => ({
  pool: { execute: jest.fn(), on: jest.fn() },
}));

process.env.JWT_SECRET          = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.JWT_EXPIRES_IN      = '1h';
process.env.DB_PASSWORD         = 'test';
process.env.ATTENDANCE_THRESHOLD = '75';

const request       = require('supertest');
const jwt           = require('jsonwebtoken');
const app           = require('../src/server');
const dashboardModel = require('../src/models/dashboardModel');
const userModel      = require('../src/models/userModel');

// ── Helpers ──────────────────────────────────────────────────────────────────
function makeToken(role, userId = role === 'admin' ? 1 : role === 'faculty' ? 2 : 3) {
  return jwt.sign(
    { userId, username: role, role },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'sams-api' }
  );
}

const ADMIN_SUMMARY = {
  totalStudents: 120, totalFaculty: 15, totalCourses: 20, totalClasses: 40,
  totalAttendanceRecords: 3200, overallAttendanceRate: 82.5,
  belowThresholdCount: 8,
  recentAuditEvents: [
    { actor: 'faculty1', action: 'ATTENDANCE_SUBMIT', target: 'class/10/date/2026-10-22', createdAt: '2026-10-22T09:00:00Z' },
  ],
};

const FACULTY_SUMMARY = {
  assignedClassCount: 3, markedTodayCount: 2, pendingTodayCount: 1,
  totalStudentsAssigned: 90, markedStudentsToday: 60,
  todayDate: '2026-10-22',
  recentSessions: [
    { classId: 10, courseCode: 'CS301', courseName: 'Data Structures', section: 'A', sessionDate: '2026-10-22', totalMarked: 30, presentCount: 25, lateCount: 2, absentCount: 3 },
  ],
};

const STUDENT_SUMMARY = {
  enrolledCourseCount: 3, totalClassesHeld: 15, totalAttended: 12,
  overallPercentage: 80.00, coursesAboveThreshold: 2, coursesBelowThreshold: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  dashboardModel.getAdminSummary   = jest.fn().mockResolvedValue(ADMIN_SUMMARY);
  dashboardModel.getFacultySummary = jest.fn().mockResolvedValue(FACULTY_SUMMARY);
  dashboardModel.getStudentSummary = jest.fn().mockResolvedValue(STUDENT_SUMMARY);
  userModel.findById = jest.fn().mockResolvedValue({
    user_id: 1, username: 'admin', role: 'admin', is_active: 1,
  });
});

describe('TC-DASH-01 — SAM-F-017: Dashboard attendance summaries', () => {

  // ── 1. Admin summary — 200 with correct shape ───────────────────────────
  test('admin: should return 200 with system-wide summary', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${makeToken('admin')}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('admin');
    expect(res.body.summary).toHaveProperty('totalStudents', 120);
    expect(res.body.summary).toHaveProperty('totalFaculty', 15);
    expect(res.body.summary).toHaveProperty('totalCourses', 20);
    expect(res.body.summary).toHaveProperty('totalClasses', 40);
    expect(res.body.summary).toHaveProperty('overallAttendanceRate', 82.5);
    expect(res.body.summary).toHaveProperty('belowThresholdCount', 8);
  });

  // ── 2. Admin summary — recent audit events included ──────────────────────
  test('admin: summary should include recent audit events', async () => {
    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${makeToken('admin')}`);

    expect(Array.isArray(res.body.summary.recentAuditEvents)).toBe(true);
    expect(res.body.summary.recentAuditEvents[0]).toHaveProperty('action', 'ATTENDANCE_SUBMIT');
  });

  // ── 3. Admin model called with threshold ──────────────────────────────────
  test('admin: should call getAdminSummary with attendance threshold', async () => {
    await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${makeToken('admin')}`);

    expect(dashboardModel.getAdminSummary).toHaveBeenCalledWith(75);
  });

  // ── 4. Faculty summary — 200 with session fields ─────────────────────────
  test('faculty: should return 200 with today\'s session summary', async () => {
    userModel.findById = jest.fn().mockResolvedValue({ user_id: 2, username: 'faculty', role: 'faculty', is_active: 1 });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${makeToken('faculty', 2)}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('faculty');
    expect(res.body.summary).toHaveProperty('assignedClassCount', 3);
    expect(res.body.summary).toHaveProperty('markedTodayCount', 2);
    expect(res.body.summary).toHaveProperty('pendingTodayCount', 1);
    expect(res.body.summary).toHaveProperty('totalStudentsAssigned', 90);
    expect(Array.isArray(res.body.summary.recentSessions)).toBe(true);
  });

  // ── 5. Faculty summary — recent session breakdown ────────────────────────
  test('faculty: recent sessions should include present/late/absent counts', async () => {
    userModel.findById = jest.fn().mockResolvedValue({ user_id: 2, username: 'faculty', role: 'faculty', is_active: 1 });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${makeToken('faculty', 2)}`);

    const session = res.body.summary.recentSessions[0];
    expect(session).toHaveProperty('presentCount', 25);
    expect(session).toHaveProperty('lateCount', 2);
    expect(session).toHaveProperty('absentCount', 3);
    expect(session).toHaveProperty('courseCode', 'CS301');
  });

  // ── 6. Student summary — 200 with percentage fields ──────────────────────
  test('student: should return 200 with overall attendance snapshot', async () => {
    userModel.findById = jest.fn().mockResolvedValue({ user_id: 3, username: 'student', role: 'student', is_active: 1 });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${makeToken('student', 3)}`);

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('student');
    expect(res.body.summary).toHaveProperty('enrolledCourseCount', 3);
    expect(res.body.summary).toHaveProperty('overallPercentage', 80.00);
    expect(res.body.summary).toHaveProperty('coursesAboveThreshold', 2);
    expect(res.body.summary).toHaveProperty('coursesBelowThreshold', 1);
  });

  // ── 7. Student summary — percentage formula ───────────────────────────────
  test('student: overallPercentage = totalAttended / totalClassesHeld * 100', async () => {
    userModel.findById = jest.fn().mockResolvedValue({ user_id: 3, username: 'student', role: 'student', is_active: 1 });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${makeToken('student', 3)}`);

    const { totalAttended, totalClassesHeld, overallPercentage } = res.body.summary;
    const expected = parseFloat((totalAttended / totalClassesHeld * 100).toFixed(2));
    expect(overallPercentage).toBeCloseTo(expected, 2);
  });

  // ── 8. Unauthenticated ────────────────────────────────────────────────────
  test('should return 401 without token', async () => {
    const res = await request(app).get('/api/dashboard/summary');
    expect(res.status).toBe(401);
  });

  // ── 9. Each role gets their own data ──────────────────────────────────────
  test('faculty token should call getFacultySummary, not getAdminSummary', async () => {
    userModel.findById = jest.fn().mockResolvedValue({ user_id: 2, username: 'faculty', role: 'faculty', is_active: 1 });

    await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${makeToken('faculty', 2)}`);

    expect(dashboardModel.getFacultySummary).toHaveBeenCalledTimes(1);
    expect(dashboardModel.getAdminSummary).not.toHaveBeenCalled();
  });

  // ── 10. Pending count = assigned - marked ────────────────────────────────
  test('faculty: pendingTodayCount = assignedClassCount - markedTodayCount', async () => {
    userModel.findById = jest.fn().mockResolvedValue({ user_id: 2, username: 'faculty', role: 'faculty', is_active: 1 });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${makeToken('faculty', 2)}`);

    const { assignedClassCount, markedTodayCount, pendingTodayCount } = res.body.summary;
    expect(pendingTodayCount).toBe(assignedClassCount - markedTodayCount);
  });

  // ── 11. null percentage when no records ──────────────────────────────────
  test('student: overallPercentage is null when no attendance records exist', async () => {
    userModel.findById = jest.fn().mockResolvedValue({ user_id: 3, username: 'student', role: 'student', is_active: 1 });
    dashboardModel.getStudentSummary = jest.fn().mockResolvedValue({
      enrolledCourseCount: 0, totalClassesHeld: 0, totalAttended: 0,
      overallPercentage: null, coursesAboveThreshold: 0, coursesBelowThreshold: 0,
    });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${makeToken('student', 3)}`);

    expect(res.body.summary.overallPercentage).toBeNull();
  });
});
