/** SAM-F-008: student views their own attendance history (TC-STU-01). */

jest.mock('../src/models/userModel');
jest.mock('../src/models/studentModel');

process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_PASSWORD = 'test';

const request = require('supertest');
const app = require('../src/server');
const userModel = require('../src/models/userModel');
const studentModel = require('../src/models/studentModel');
const { generateToken } = require('../src/utils/jwtHelper');

const expectedRecords = [{
  attendance_id: 6,
  attendance_date: '2026-10-20',
  status: 'Present',
  course_id: 4,
  course_code: 'CS301',
  course_name: 'Database Systems',
  section: 'A',
}];

function tokenFor(userId = 7, role = 'student') {
  return generateToken({ userId, username: `${role}${userId}`, role });
}

function authenticateAs(role = 'student', userId = 7) {
  userModel.findById.mockResolvedValue({
    user_id: userId,
    username: `${role}${userId}`,
    role,
    is_active: 1,
    full_name: 'Test User',
  });
  return tokenFor(userId, role);
}

beforeEach(() => {
  jest.clearAllMocks();
  studentModel.listEnrolledCourses.mockResolvedValue([{ course_id: 4, course_code: 'CS301', course_name: 'Database Systems' }]);
  studentModel.hasCourseAccess.mockResolvedValue(true);
  studentModel.getAttendanceHistory.mockResolvedValue(expectedRecords);
});

describe('SAM-F-008: student attendance history (TC-STU-01)', () => {
  test('authenticated student retrieves own history filtered by course and date', async () => {
    const response = await request(app)
      .get('/api/student/attendance/history?courseId=4&date=2026-10-20&userId=999')
      .set('Authorization', `Bearer ${authenticateAs()}`);

    expect(response.status).toBe(200);
    expect(response.body.records).toEqual(expectedRecords);
    expect(studentModel.getAttendanceHistory).toHaveBeenCalledWith(7, 4, '2026-10-20');
  });

  test('omitted filters return the authenticated student history without a date limit', async () => {
    const response = await request(app)
      .get('/api/student/attendance/history')
      .set('Authorization', `Bearer ${authenticateAs()}`);

    expect(response.status).toBe(200);
    expect(studentModel.getAttendanceHistory).toHaveBeenCalledWith(7, null, null);
  });

  test.each([
    ['malformed', '2026-1-02'],
    ['impossible', '2026-02-30'],
    ['non-leap', '2025-02-29'],
  ])('rejects %s dates before querying history', async (_label, date) => {
    const response = await request(app)
      .get(`/api/student/attendance/history?date=${date}`)
      .set('Authorization', `Bearer ${authenticateAs()}`);

    expect(response.status).toBe(400);
    expect(studentModel.getAttendanceHistory).not.toHaveBeenCalled();
  });

  test.each(['0', 'abc', '9007199254740992'])('rejects invalid course id %s', async (courseId) => {
    const response = await request(app)
      .get(`/api/student/attendance/history?courseId=${courseId}`)
      .set('Authorization', `Bearer ${authenticateAs()}`);

    expect(response.status).toBe(400);
    expect(studentModel.getAttendanceHistory).not.toHaveBeenCalled();
  });

  test('an unauthenticated user cannot retrieve attendance history', async () => {
    const response = await request(app).get('/api/student/attendance/history');
    expect(response.status).toBe(401);
    expect(studentModel.getAttendanceHistory).not.toHaveBeenCalled();
  });

  test.each(['faculty', 'admin'])('%s cannot retrieve student history', async (role) => {
    const response = await request(app)
      .get('/api/student/attendance/history')
      .set('Authorization', `Bearer ${authenticateAs(role)}`);
    expect(response.status).toBe(403);
    expect(studentModel.getAttendanceHistory).not.toHaveBeenCalled();
  });

  test('course selector returns courses associated with the authenticated student', async () => {
    const response = await request(app)
      .get('/api/student/courses')
      .set('Authorization', `Bearer ${authenticateAs()}`);
    expect(response.status).toBe(200);
    expect(response.body.courses).toEqual([{ course_id: 4, course_code: 'CS301', course_name: 'Database Systems' }]);
    expect(studentModel.listEnrolledCourses).toHaveBeenCalledWith(7);
  });

  test('empty history is returned as a successful empty result', async () => {
    studentModel.getAttendanceHistory.mockResolvedValue([]);
    const response = await request(app)
      .get('/api/student/attendance/history?courseId=4&date=2026-10-21')
      .set('Authorization', `Bearer ${authenticateAs()}`);
    expect(response.status).toBe(200);
    expect(response.body.records).toEqual([]);
  });

  test('a course outside the student enrollment/history is hidden', async () => {
    studentModel.hasCourseAccess.mockResolvedValue(false);
    const response = await request(app)
      .get('/api/student/attendance/history?courseId=99')
      .set('Authorization', `Bearer ${authenticateAs()}`);
    expect(response.status).toBe(404);
    expect(studentModel.getAttendanceHistory).not.toHaveBeenCalled();
  });

  test('database errors return a safe history error', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    studentModel.getAttendanceHistory.mockRejectedValue(new Error('private database detail'));
    const response = await request(app)
      .get('/api/student/attendance/history')
      .set('Authorization', `Bearer ${authenticateAs()}`);
    expect(response.status).toBe(500);
    expect(response.body.message).toMatch(/unable to load attendance history/i);
    expect(response.body.message).not.toContain('private database detail');
    errorLog.mockRestore();
  });
});
