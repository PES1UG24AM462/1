/** SAM-F-003 / SAM-F-004: assigned class and date selection, with roster access. */

jest.mock('../src/models/userModel');
jest.mock('../src/models/facultyModel');

process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_PASSWORD = 'test';

const request = require('supertest');
const app = require('../src/server');
const userModel = require('../src/models/userModel');
const facultyModel = require('../src/models/facultyModel');
const { generateToken } = require('../src/utils/jwtHelper');

const assignedClass = {
  class_id: 12,
  course_code: 'CS301',
  course_name: 'Database Systems',
  section: 'A',
  academic_yr: '2026-27',
};

const populatedRoster = {
  classId: 12,
  courseId: 4,
  courseCode: 'CS301',
  courseName: 'Database Systems',
  section: 'A',
  academicYear: '2026-27',
  students: [{
    studentId: 81,
    usn: 'PES1UG24CS001',
    fullName: 'Aarav Sharma',
    department: 'Computer Science',
    semester: 3,
  }],
};

function tokenFor(userId, role = 'faculty') {
  return generateToken({ userId, username: `${role}${userId}`, role });
}

function authenticateAs(role = 'faculty', userId = 1) {
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
  facultyModel.listAssignedClasses.mockResolvedValue([assignedClass]);
  facultyModel.getAssignedClassRoster.mockResolvedValue(populatedRoster);
});

describe('SAM-F-003: faculty class and attendance date selection', () => {
  test('authenticated faculty retrieves only their assigned class list', async () => {
    const token = authenticateAs();
    const response = await request(app)
      .get('/api/faculty/classes')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.classes).toEqual([assignedClass]);
    expect(facultyModel.listAssignedClasses).toHaveBeenCalledWith(1);
  });

  test('valid assigned class and date return the selected class and enrolled roster', async () => {
    const token = authenticateAs();
    const response = await request(app)
      .get('/api/faculty/classes/12/roster?date=2026-10-23')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.class.classId).toBe(12);
    expect(response.body.date).toBe('2026-10-23');
    expect(response.body.students).toEqual(populatedRoster.students);
    expect(facultyModel.getAssignedClassRoster).toHaveBeenCalledWith(1, 12);
  });

  test('faculty with no assigned classes receives an empty list', async () => {
    facultyModel.listAssignedClasses.mockResolvedValue([]);
    const response = await request(app)
      .get('/api/faculty/classes')
      .set('Authorization', `Bearer ${authenticateAs()}`);

    expect(response.status).toBe(200);
    expect(response.body.classes).toEqual([]);
  });

  test('assigned class with no enrolled students returns an empty roster', async () => {
    facultyModel.getAssignedClassRoster.mockResolvedValue({ ...populatedRoster, students: [] });
    const response = await request(app)
      .get('/api/faculty/classes/12/roster?date=2026-10-23')
      .set('Authorization', `Bearer ${authenticateAs()}`);

    expect(response.status).toBe(200);
    expect(response.body.students).toEqual([]);
  });

  test.each([
    ['missing date', ''],
    ['non-ISO date', '2026-1-03'],
    ['impossible day', '2026-02-30'],
    ['non-leap date', '2025-02-29'],
    ['malformed date', 'yesterday'],
  ])('rejects %s before querying the roster', async (_description, date) => {
    const token = authenticateAs();
    const url = date
      ? `/api/faculty/classes/12/roster?date=${encodeURIComponent(date)}`
      : '/api/faculty/classes/12/roster';
    const response = await request(app).get(url).set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/attendance date/i);
    expect(facultyModel.getAssignedClassRoster).not.toHaveBeenCalled();
  });

  test.each(['0', 'abc', '9007199254740992'])('rejects invalid class id %s', async (classId) => {
    const response = await request(app)
      .get(`/api/faculty/classes/${classId}/roster?date=2026-10-23`)
      .set('Authorization', `Bearer ${authenticateAs()}`);

    expect(response.status).toBe(400);
    expect(facultyModel.getAssignedClassRoster).not.toHaveBeenCalled();
  });

  test('hides a class that is not assigned to the authenticated faculty member', async () => {
    facultyModel.getAssignedClassRoster.mockResolvedValue(null);
    const response = await request(app)
      .get('/api/faculty/classes/99/roster?date=2026-10-23')
      .set('Authorization', `Bearer ${authenticateAs()}`);

    expect(response.status).toBe(404);
    expect(facultyModel.getAssignedClassRoster).toHaveBeenCalledWith(1, 99);
  });

  test.each(['student', 'admin'])('%s cannot retrieve faculty classes', async (role) => {
    const response = await request(app)
      .get('/api/faculty/classes')
      .set('Authorization', `Bearer ${authenticateAs(role)}`);

    expect(response.status).toBe(403);
    expect(facultyModel.listAssignedClasses).not.toHaveBeenCalled();
  });

  test('unauthenticated requests cannot access faculty attendance data', async () => {
    const response = await request(app).get('/api/faculty/classes');
    expect(response.status).toBe(401);
    expect(facultyModel.listAssignedClasses).not.toHaveBeenCalled();
  });

  test('database errors return a safe error response', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
    facultyModel.listAssignedClasses.mockRejectedValue(new Error('private database detail'));
    const response = await request(app)
      .get('/api/faculty/classes')
      .set('Authorization', `Bearer ${authenticateAs()}`);

    expect(response.status).toBe(500);
    expect(response.body.message).toMatch(/unable to load assigned classes/i);
    expect(response.body.message).not.toContain('private database detail');
    errorLog.mockRestore();
  });
});
