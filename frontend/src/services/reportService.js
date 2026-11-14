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

/**
 * SAM-F-013 — Download attendance report as a CSV file.
 * Uses the same filters as generateAttendanceReport.
 * Returns a Blob so the caller can trigger a browser download.
 *
 * @param {Object} filters - { classId, courseId, from, to, studentId? }
 * @returns {Promise<{ blob: Blob, filename: string }>}
 */
export async function exportAttendanceCsv(filters) {
  const token = getToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');

  try {
    const response = await axios.get(`${API_BASE}/attendance/export`, {
      headers: { Authorization: `Bearer ${token}` },
      params: filters,
      // Tell axios to treat the response as binary so we get the raw CSV text
      responseType: 'blob',
    });

    // Extract filename from Content-Disposition header if present
    const disposition = response.headers['content-disposition'] || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match ? match[1] : `SAMS_attendance_${filters.from}_${filters.to}.csv`;

    return { blob: response.data, filename };
  } catch (err) {
    // Axios stores blob errors in err.response.data — convert to text to read the message
    if (err.response && err.response.data instanceof Blob) {
      const text = await err.response.data.text();
      try {
        const json = JSON.parse(text);
        throw new Error(json.message || 'Unable to export CSV. Please try again.');
      } catch {
        throw new Error('Unable to export CSV. Please try again.');
      }
    }
    if (err.response) throw new Error(err.response?.data?.message || 'Unable to export CSV. Please try again.');
    throw err;
  }
}
