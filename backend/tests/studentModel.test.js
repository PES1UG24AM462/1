jest.mock('../src/config/database', () => ({ pool: { execute: jest.fn() } }));

const { pool } = require('../src/config/database');
const studentModel = require('../src/models/studentModel');

beforeEach(() => jest.clearAllMocks());

test('history query scopes to the student and combines parameterized course and date filters', async () => {
  pool.execute.mockResolvedValue([[{ attendance_id: 2, status: 'Late' }]]);
  const result = await studentModel.getAttendanceHistory(7, 4, '2026-10-20');

  expect(result).toEqual([{ attendance_id: 2, status: 'Late' }]);
  const [query, values] = pool.execute.mock.calls[0];
  expect(query).toContain('s.user_id = ?');
  expect(query).toContain('co.course_id = ?');
  expect(query).toContain('a.attendance_date = ?');
  expect(values).toEqual([7, 4, '2026-10-20']);
});

test('history with no filters remains scoped to one student and does not add a date limit', async () => {
  pool.execute.mockResolvedValue([[]]);
  await studentModel.getAttendanceHistory(9);
  const [query, values] = pool.execute.mock.calls[0];
  expect(query).toContain('s.user_id = ?');
  expect(query).not.toContain('a.attendance_date = ?');
  expect(query).toContain('ORDER BY a.attendance_date DESC');
  expect(values).toEqual([9]);
});

test('course access is checked using the requesting student identity', async () => {
  pool.execute.mockResolvedValue([[{ 1: 1 }]]);
  await expect(studentModel.hasCourseAccess(7, 4)).resolves.toBe(true);
  const [query, values] = pool.execute.mock.calls[0];
  expect(query).toContain('s.user_id = ?');
  expect(values).toEqual([4, 7]);
});

test('course list includes enrolled courses and courses with the student’s persisted history', async () => {
  pool.execute.mockResolvedValue([[{ course_id: 4 }]]);
  await studentModel.listEnrolledCourses(7);
  const [query, values] = pool.execute.mock.calls[0];
  expect(query).toContain('FROM enrollments e');
  expect(query).toContain('FROM attendance a');
  expect(query).toContain('UNION');
  expect(values).toEqual([7, 7]);
});
