import axios from 'axios';
import { getToken } from './authService';

const API_BASE = '/api/faculty';

function authConfig() {
  const token = getToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return { headers: { Authorization: `Bearer ${token}` } };
}

function errorFromResponse(err, fallback) {
  return new Error(err.response?.data?.message || fallback);
}

export async function getAssignedClasses() {
  try {
    const { data } = await axios.get(`${API_BASE}/classes`, authConfig());
    if (!Array.isArray(data.classes)) throw new Error('The server returned an invalid class list.');
    return data;
  } catch (err) {
    if (err.response) throw errorFromResponse(err, 'Unable to load assigned classes. Please try again.');
    throw err;
  }
}

export async function getClassRoster(classId, date) {
  try {
    const { data } = await axios.get(
      `${API_BASE}/classes/${encodeURIComponent(classId)}/roster`,
      { ...authConfig(), params: { date } }
    );
    return data;
  } catch (err) {
    if (err.response) throw errorFromResponse(err, 'Unable to load this class roster. Please try again.');
    throw err;
  }
}

const ATTENDANCE_BASE = '/api/attendance';

/**
 * SAM-F-005 — Submit attendance records for a class session.
 * @param {number} classId
 * @param {string} date    - YYYY-MM-DD
 * @param {Array}  records - [{ studentId, status }]
 */
export async function submitAttendance(classId, date, records) {
  try {
    const { data } = await axios.post(
      ATTENDANCE_BASE,
      { classId, date, records },
      authConfig()
    );
    return data;
  } catch (err) {
    if (err.response) throw errorFromResponse(err, 'Unable to save attendance. Please try again.');
    throw err;
  }
}

/**
 * Fetch existing attendance for a session (pre-fill when faculty revisit a date).
 */
export async function getSessionAttendance(classId, date) {
  try {
    const { data } = await axios.get(ATTENDANCE_BASE, {
      ...authConfig(),
      params: { classId, date },
    });
    return data;
  } catch (err) {
    if (err.response) throw errorFromResponse(err, 'Unable to load existing attendance.');
    throw err;
  }
}
