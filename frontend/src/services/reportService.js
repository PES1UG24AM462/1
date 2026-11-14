import axios from 'axios';
import { getToken } from './authService';

const API_BASE = '/api/reports';

function authConfig() {
  const token = getToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return { headers: { Authorization: `Bearer ${token}` } };
}

function errorFromResponse(err, fallback) {
  return new Error(err.response?.data?.message || fallback);
}

export async function getReportClasses() {
  try {
    const { data } = await axios.get(`${API_BASE}/classes`, authConfig());
    if (!Array.isArray(data.classes)) throw new Error('The server returned an invalid class list.');
    return data;
  } catch (err) {
    if (err.response) throw errorFromResponse(err, 'Unable to load report classes. Please try again.');
    throw err;
  }
}

export async function getReportStudents(classId) {
  try {
    const { data } = await axios.get(`${API_BASE}/students`, {
      ...authConfig(),
      params: { classId },
    });
    if (!Array.isArray(data.students)) throw new Error('The server returned an invalid student list.');
    return data;
  } catch (err) {
    if (err.response) throw errorFromResponse(err, 'Unable to load report students. Please try again.');
    throw err;
  }
}

export async function generateAttendanceReport(filters) {
  try {
    const { data } = await axios.get(`${API_BASE}/attendance`, {
      ...authConfig(),
      params: filters,
    });
    return data;
  } catch (err) {
    if (err.response) throw errorFromResponse(err, 'Unable to generate attendance report. Please try again.');
    throw err;
  }
}
