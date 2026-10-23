jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('./authService', () => ({ getToken: jest.fn() }));

import axios from 'axios';
import { getToken } from './authService';
import { getAssignedClasses, getClassRoster } from './facultyService';

beforeEach(() => {
  jest.clearAllMocks();
  getToken.mockReturnValue('faculty-session-token');
});

test('assigned class request carries the active bearer token', async () => {
  const classes = [{ class_id: 12, course_code: 'CS301' }];
  axios.get.mockResolvedValue({ data: { classes } });

  await expect(getAssignedClasses()).resolves.toEqual({ classes });
  expect(axios.get).toHaveBeenCalledWith('/api/faculty/classes', {
    headers: { Authorization: 'Bearer faculty-session-token' },
  });
});

test('roster request carries the selected class and exact calendar date', async () => {
  axios.get.mockResolvedValue({ data: { date: '2026-10-23', students: [] } });

  await getClassRoster('12', '2026-10-23');

  expect(axios.get).toHaveBeenCalledWith('/api/faculty/classes/12/roster', {
    headers: { Authorization: 'Bearer faculty-session-token' },
    params: { date: '2026-10-23' },
  });
});

test('roster request surfaces safe API messages', async () => {
  axios.get.mockRejectedValue({ response: { data: { message: 'Class not found or not assigned to you.' } } });

  await expect(getClassRoster('99', '2026-10-23')).rejects.toThrow('Class not found or not assigned to you.');
});
