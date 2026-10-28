import axios from 'axios';
import { getToken } from './authService';

async function get(path, params) {
  try {
    const { data } = await axios.get(path, {
      params,
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    return data;
  } catch (err) {
    throw new Error(err.response?.data?.message || 'Unable to load attendance history. Please try again.');
  }
}

export function getEnrolledCourses() {
  return get('/api/student/courses');
}

export function getAttendanceHistory(filters = {}) {
  const params = {};
  if (filters.courseId) params.courseId = filters.courseId;
  if (filters.date) params.date = filters.date;
  return get('/api/student/attendance/history', params);
}
