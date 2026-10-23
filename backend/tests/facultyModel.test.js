jest.mock('../src/config/database', () => ({
  pool: { execute: jest.fn() },
}));

const { pool } = require('../src/config/database');
const facultyModel = require('../src/models/facultyModel');

beforeEach(() => jest.clearAllMocks());

test('assigned class lookup is scoped to the authenticated faculty user', async () => {
  pool.execute.mockResolvedValue([[{ class_id: 12, course_code: 'CS301' }], []]);

  await facultyModel.listAssignedClasses(23);

  const [query, values] = pool.execute.mock.calls[0];
  expect(query).toMatch(/JOIN faculty f ON f\.faculty_id = c\.faculty_id/);
  expect(query).toMatch(/WHERE f\.user_id = \?/);
  expect(values).toEqual([23]);
});

test('roster lookup scopes class and faculty in parameterized SQL and maps enrolled students', async () => {
  pool.execute.mockResolvedValue([[
    {
      class_id: 12,
      course_id: 4,
      course_code: 'CS301',
      course_name: 'Database Systems',
      section: 'A',
      academic_yr: '2026-27',
      student_id: 81,
      usn: 'PES1UG24CS001',
      full_name: 'Aarav Sharma',
      department: 'Computer Science',
      semester: 3,
    },
  ], []]);

  const result = await facultyModel.getAssignedClassRoster(23, 12);
  const [query, values] = pool.execute.mock.calls[0];

  expect(query).toMatch(/JOIN faculty f ON f\.faculty_id = c\.faculty_id/);
  expect(query).toMatch(/LEFT JOIN enrollments e ON e\.class_id = c\.class_id/);
  expect(query).toMatch(/WHERE f\.user_id = \? AND c\.class_id = \?/);
  expect(query).not.toContain('f.user_id = 23');
  expect(values).toEqual([23, 12]);
  expect(result.students).toEqual([{
    studentId: 81,
    usn: 'PES1UG24CS001',
    fullName: 'Aarav Sharma',
    department: 'Computer Science',
    semester: 3,
  }]);
});

test('class with no enrollments maps to an empty roster, while unassigned classes return null', async () => {
  pool.execute.mockResolvedValueOnce([[
    {
      class_id: 12,
      course_id: 4,
      course_code: 'CS301',
      course_name: 'Database Systems',
      section: 'A',
      academic_yr: '2026-27',
      student_id: null,
      usn: null,
      full_name: null,
      department: null,
      semester: null,
    },
  ], []]).mockResolvedValueOnce([[], []]);

  const emptyRoster = await facultyModel.getAssignedClassRoster(23, 12);
  const unassignedClass = await facultyModel.getAssignedClassRoster(23, 99);

  expect(emptyRoster.students).toEqual([]);
  expect(unassignedClass).toBeNull();
});
