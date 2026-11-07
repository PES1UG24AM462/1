const studentModel = require('../models/studentModel');

function parsePositiveId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || month < 1 || month > 12) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

async function getEnrolledCourses(req, res) {
  try {
    const courses = await studentModel.listEnrolledCourses(req.user.userId);
    return res.status(200).json({ courses });
  } catch (err) {
    console.error('[Student] Enrolled course lookup failed:', err.message);
    return res.status(500).json({ message: 'Unable to load your courses. Please try again.' });
  }
}

async function getAttendanceHistory(req, res) {
  const { courseId, date } = req.query;
  if (courseId !== undefined && parsePositiveId(courseId) === null) {
    return res.status(400).json({ message: 'Select a valid course.' });
  }
  if (date !== undefined && !isValidDate(date)) {
    return res.status(400).json({ message: 'Enter a valid attendance date in YYYY-MM-DD format.' });
  }

  try {
    const selectedCourseId = courseId === undefined ? null : Number(courseId);
    if (selectedCourseId !== null && !(await studentModel.hasCourseAccess(req.user.userId, selectedCourseId))) {
      return res.status(404).json({ message: 'Course not found.' });
    }
    const records = await studentModel.getAttendanceHistory(
      req.user.userId,
      selectedCourseId,
      date === undefined ? null : date
    );
    return res.status(200).json({ records });
  } catch (err) {
    console.error('[Student] Attendance history lookup failed:', err.message);
    return res.status(500).json({ message: 'Unable to load attendance history. Please try again.' });
  }
}

module.exports = { getEnrolledCourses, getAttendanceHistory, isValidDate, parsePositiveId };
