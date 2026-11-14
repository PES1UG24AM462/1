jest.mock('../src/config/database', () => ({
  pool: { execute: jest.fn() },
}));

const { pool } = require('../src/config/database');
const reportModel = require('../src/models/reportModel');

beforeEach(() => jest.clearAllMocks());

test('faculty class selector is limited to that faculty member', async () => {
  pool.execute.mockResolvedValue([[{ classId: 10, courseId: 3 }]]);
  await reportModel.listReportClasses(21, 'faculty');

  const [sql, params] = pool.execute.mock.calls[0];
  expect(sql).toContain('JOIN faculty f ON f.faculty_id = c.faculty_id WHERE f.user_id = ?');
  expect(params).toEqual([21]);
});

test('administrator class selector lists actual classes without a faculty assignment restriction', async () => {
  pool.execute.mockResolvedValue([[]]);
  await reportModel.listReportClasses(1, 'admin');

  const [sql, params] = pool.execute.mock.calls[0];
  expect(sql).toContain('FROM classes c');
  expect(sql).toContain('JOIN courses co');
  expect(sql).not.toContain('WHERE f.user_id');
  expect(params).toEqual([]);
});

test('attendance query applies inclusive date, course, class, status, and faculty filters using bound parameters', async () => {
  pool.execute.mockResolvedValue([[{ classId: 10, studentId: 1 }]]);
  await reportModel.getAttendanceRows({
    classId: 10,
    courseId: 3,
    from: '2026-10-01',
    to: '2026-10-31',
    userId: 21,
    role: 'faculty',
  });

  const [sql, params] = pool.execute.mock.calls[0];
  expect(sql).toContain('a.attendance_date BETWEEN ? AND ?');
  expect(sql).toContain("a.status IN ('Present', 'Absent', 'Late')");
  expect(sql).toContain('WHERE c.class_id = ? AND c.course_id = ?');
  expect(sql).toContain('f.user_id = ?');
  expect(sql).toContain("DATE_FORMAT(a.attendance_date, '%Y-%m-%d')");
  expect(params).toEqual(['2026-10-01', '2026-10-31', 10, 3, 21]);
});

test('administrator report query keeps class/course/date restrictions and does not add a faculty assignment bypass parameter', async () => {
  pool.execute.mockResolvedValue([[]]);
  await reportModel.getAttendanceRows({
    classId: 10,
    courseId: 3,
    from: '2026-10-01',
    to: '2026-10-31',
    userId: 1,
    role: 'admin',
  });

  const [sql, params] = pool.execute.mock.calls[0];
  expect(sql).toContain('WHERE c.class_id = ? AND c.course_id = ?');
  expect(sql).not.toContain('f.user_id = ?');
  expect(params).toEqual(['2026-10-01', '2026-10-31', 10, 3]);
});
