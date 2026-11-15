jest.mock('../src/config/database', () => ({ pool: { execute: jest.fn() } }));

const { pool } = require('../src/config/database');
const academicModel = require('../src/models/academicModel');

beforeEach(() => jest.clearAllMocks());

test('class rosters are selected through the enrollment relationship for one class', async () => {
  pool.execute.mockResolvedValue([[{ studentId: 4, fullName: 'Student' }]]);
  const rows = await academicModel.listClassEnrollments(12);
  const [sql, params] = pool.execute.mock.calls[0];
  expect(rows).toEqual([{ studentId: 4, fullName: 'Student' }]);
  expect(sql).toContain('FROM enrollments e');
  expect(sql).toContain('JOIN students s ON s.student_id = e.student_id');
  expect(sql).toContain('WHERE e.class_id = ?');
  expect(params).toEqual([12]);
});

test('enrollment creation writes only the enrollment relationship and leaves attendance history alone', async () => {
  pool.execute.mockResolvedValue([{ insertId: 19 }]);
  await expect(academicModel.enrollStudent(4, 12)).resolves.toBe(19);
  const [sql, params] = pool.execute.mock.calls[0];
  expect(sql).toMatch(/INSERT INTO enrollments \(student_id, class_id\)/);
  expect(params).toEqual([4, 12]);
  expect(pool.execute).toHaveBeenCalledTimes(1);
  expect(sql).not.toMatch(/DELETE|attendance/i);
});

test('course values are parameterized rather than interpolated into SQL', async () => {
  pool.execute.mockResolvedValue([{ insertId: 2 }]);
  const courseCode = "CS1' OR 1=1 --";
  await academicModel.createCourse({ courseCode, courseName: 'Course', description: null, credits: null });
  const [sql, params] = pool.execute.mock.calls[0];
  expect(sql).toContain('VALUES (?, ?, ?, ?)');
  expect(params[0]).toBe(courseCode);
});

test('class edits update only explicitly mapped schema columns', async () => {
  pool.execute.mockResolvedValue([{ affectedRows: 1 }]);
  await academicModel.updateClass(12, { facultyId: 8, section: 'B', academicYear: null });
  const [sql, params] = pool.execute.mock.calls[0];
  expect(sql).toContain('faculty_id = ?');
  expect(sql).toContain('section = ?');
  expect(sql).toContain('academic_yr = ?');
  expect(params).toEqual([8, 'B', null, 12]);
});

test.each([
  ['course creation', (connection) => academicModel.createCourse({ courseCode: 'CS1', courseName: 'Course', description: null, credits: null }, connection), /INSERT INTO courses/],
  ['course update', (connection) => academicModel.updateCourse(3, { courseName: 'New Name' }, connection), /UPDATE courses/],
  ['class creation', (connection) => academicModel.createClass({ courseId: 1, facultyId: 2, section: 'A', academicYear: '2026-27' }, connection), /INSERT INTO classes/],
  ['class update', (connection) => academicModel.updateClass(4, { section: 'B' }, connection), /UPDATE classes/],
  ['enrollment creation', (connection) => academicModel.enrollStudent(5, 4, connection), /INSERT INTO enrollments/],
])('%s uses the supplied transaction connection', async (_name, write, expectedSql) => {
  const connection = { execute: jest.fn().mockResolvedValue([{ insertId: 20, affectedRows: 1 }]) };

  await write(connection);

  expect(connection.execute).toHaveBeenCalledTimes(1);
  expect(connection.execute.mock.calls[0][0]).toMatch(expectedSql);
  expect(pool.execute).not.toHaveBeenCalled();
});
