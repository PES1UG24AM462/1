import axios from 'axios';
import { getToken } from './authService';
import { createCourse, getClassEnrollments, enrollStudent } from './academicService';

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn(), patch: jest.fn() }));
jest.mock('./authService', () => ({ getToken: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  getToken.mockReturnValue('admin-token');
});

test('course creation sends the authenticated administrator token and entered record', async () => {
  const course = { courseCode: 'CS301', courseName: 'Databases' };
  axios.post.mockResolvedValue({ data: { course } });
  await expect(createCourse(course)).resolves.toEqual({ course });
  expect(axios.post).toHaveBeenCalledWith('/api/admin/courses', course, {
    headers: { Authorization: 'Bearer admin-token' },
  });
});

test('enrollment roster is loaded for the selected class', async () => {
  const result = { class: { classId: 12 }, enrollments: [] };
  axios.get.mockResolvedValue({ data: result });
  await expect(getClassEnrollments(12)).resolves.toEqual(result);
  expect(axios.get).toHaveBeenCalledWith('/api/admin/classes/12/enrollments', {
    headers: { Authorization: 'Bearer admin-token' },
  });
});

test('enrollment operation sends only the selected student relationship', async () => {
  axios.post.mockResolvedValue({ data: { enrollmentId: 9 } });
  await expect(enrollStudent(12, 21)).resolves.toEqual({ enrollmentId: 9 });
  expect(axios.post).toHaveBeenCalledWith('/api/admin/classes/12/enrollments', { studentId: 21 }, {
    headers: { Authorization: 'Bearer admin-token' },
  });
});
