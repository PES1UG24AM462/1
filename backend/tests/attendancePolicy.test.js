const originalThreshold = process.env.ATTENDANCE_THRESHOLD;

afterEach(() => {
  if (originalThreshold === undefined) delete process.env.ATTENDANCE_THRESHOLD;
  else process.env.ATTENDANCE_THRESHOLD = originalThreshold;
  jest.resetModules();
});

test('reads the configured attendance threshold and returns it as a number', () => {
  process.env.ATTENDANCE_THRESHOLD = '82.5';
  let policy;
  jest.isolateModules(() => { policy = require('../src/config/attendancePolicy'); });
  expect(policy.attendanceThreshold).toBe(82.5);
});

test.each(['0', '101', 'NaN', 'seventy-five'])(
  'rejects an invalid configured threshold: %s',
  (value) => {
    process.env.ATTENDANCE_THRESHOLD = value;
    expect(() => jest.isolateModules(() => require('../src/config/attendancePolicy')))
      .toThrow(/ATTENDANCE_THRESHOLD/);
  }
);
