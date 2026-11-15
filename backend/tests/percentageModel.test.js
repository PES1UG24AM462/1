jest.mock('../src/config/database', () => ({
  pool: { execute: jest.fn() },
}));

const { pool } = require('../src/config/database');
const percentageModel = require('../src/models/percentageModel');

beforeEach(() => jest.clearAllMocks());

test('percentage query scopes attendance to the authenticated user and selected course', async () => {
  pool.execute.mockResolvedValue([[]]);

  await percentageModel.getAttendancePercentages(7, 4);

  const [query, values] = pool.execute.mock.calls[0];
  expect(query).toContain('WHERE s.user_id = ? AND co.course_id = ?');
  expect(query).toContain('JOIN students   s  ON s.student_id  = a.student_id');
  expect(values).toEqual([7, 4]);
});
