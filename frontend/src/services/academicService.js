import axios from 'axios';
import { getToken } from './authService';

const API_BASE = '/api/admin';

function authConfig() {
  const token = getToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return { headers: { Authorization: `Bearer ${token}` } };
}

function throwServiceError(err, fallback) {
  if (err.response) throw new Error(err.response.data?.message || fallback);
  throw err;
}

async function get(path, fallback) {
  try {
    const { data } = await axios.get(`${API_BASE}${path}`, authConfig());
    return data;
  } catch (err) {
    throwServiceError(err, fallback);
  }
}

async function send(method, path, body, fallback) {
  try {
    const { data } = await axios[method](`${API_BASE}${path}`, body, authConfig());
    return data;
  } catch (err) {
    throwServiceError(err, fallback);
  }
}

export const getCourses = () => get('/courses', 'Unable to load courses. Please try again.');
export const getClasses = () => get('/classes', 'Unable to load classes. Please try again.');
export const getFaculty = () => get('/faculty', 'Unable to load faculty. Please try again.');
export const getStudents = () => get('/students', 'Unable to load students. Please try again.');

export const createCourse = (course) => send('post', '/courses', course, 'Unable to create this course.');
export const updateCourse = (courseId, course) => send('patch', `/courses/${encodeURIComponent(courseId)}`, course, 'Unable to update this course.');
export const createClass = (classRecord) => send('post', '/classes', classRecord, 'Unable to create this class.');
export const updateClass = (classId, classRecord) => send('patch', `/classes/${encodeURIComponent(classId)}`, classRecord, 'Unable to update this class.');

export function getClassEnrollments(classId) {
  return get(`/classes/${encodeURIComponent(classId)}/enrollments`, 'Unable to load this class roster.');
}

export function enrollStudent(classId, studentId) {
  return send('post', `/classes/${encodeURIComponent(classId)}/enrollments`, { studentId }, 'Unable to enroll this student.');
}
