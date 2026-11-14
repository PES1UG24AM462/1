import axios from 'axios';
import { getToken } from './authService';
import { generateAttendanceReport, getReportClasses } from './reportService';

jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('./authService', () => ({ getToken: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  getToken.mockReturnValue('test-token');
});

test('loads role-scoped report classes with the session token', async () => {
  const classes = [{ classId: 10, courseId: 3, courseCode: 'CS301' }];
  axios.get.mockResolvedValue({ data: { classes } });

  await expect(getReportClasses()).resolves.toEqual({ classes });
  expect(axios.get).toHaveBeenCalledWith('/api/reports/classes', {
    headers: { Authorization: 'Bearer test-token' },
  });
});

test('requests a report with course, class, and calendar date filters', async () => {
  const report = { students: [] };
  const filters = { courseId: '3', classId: '10', from: '2026-10-01', to: '2026-10-31' };
  axios.get.mockResolvedValue({ data: report });

  await expect(generateAttendanceReport(filters)).resolves.toBe(report);
  expect(axios.get).toHaveBeenCalledWith('/api/reports/attendance', {
    headers: { Authorization: 'Bearer test-token' },
    params: filters,
  });
});

test('surfaces backend validation messages and missing session errors', async () => {
  axios.get.mockRejectedValue({ response: { data: { message: 'The end date must be on or after the start date.' } } });
  await expect(generateAttendanceReport({})).rejects.toThrow(/end date/i);

  getToken.mockReturnValue(null);
  await expect(getReportClasses()).rejects.toThrow(/session has expired/i);
});
