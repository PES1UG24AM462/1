import { isValidAttendanceDate } from './attendanceDate';

describe('isValidAttendanceDate', () => {
  test.each([
    '2026-10-23',
    '2024-02-29',
    '2000-02-29',
    '1000-01-01',
    '9999-12-31',
  ])('accepts valid calendar date %s', (date) => {
    expect(isValidAttendanceDate(date)).toBe(true);
  });

  test.each([
    '',
    '2026-2-03',
    '2026-02-30',
    '2025-02-29',
    '1900-02-29',
    '0999-12-31',
    '2026-13-01',
  ])('rejects invalid calendar date %s', (date) => {
    expect(isValidAttendanceDate(date)).toBe(false);
  });
});
