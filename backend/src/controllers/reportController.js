/**
 * Reporting & analytics controller (SAM-F-010, SAM-F-011).
 */

const attendanceModel = require('../models/attendanceModel');
const reportModel = require('../models/reportModel');
const attendanceReportService = require('../services/attendanceReportService');
const facultyModel = require('../models/facultyModel');
const auditModel = require('../models/auditModel');
const { attendanceThreshold } = require('../config/attendancePolicy');

function parsePositiveId(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function getReportClasses(req, res) {
  try {
    const classes = await reportModel.listReportClasses(req.user.userId, req.user.role);
    return res.status(200).json({ classes });
  } catch (err) {
    console.error('[Report] Class list query failed:', err.message);
    return res.status(500).json({ message: 'Unable to load report classes. Please try again.' });
  }
}

async function getAttendanceReport(req, res) {
  const classId = parsePositiveId(req.query.classId);
  const courseId = parsePositiveId(req.query.courseId);
  const { from, to } = req.query;
  if (classId === null || courseId === null) {
    return res.status(400).json({ message: 'Select a valid course and class.' });
  }
  if (!attendanceReportService.isValidCalendarDate(from) || !attendanceReportService.isValidCalendarDate(to)) {
    return res.status(400).json({ message: 'Enter valid start and end dates in YYYY-MM-DD format.' });
  }
  if (to < from) {
    return res.status(400).json({ message: 'The end date must be on or after the start date.' });
  }

  try {
    const rows = await reportModel.getAttendanceRows({
      classId,
      courseId,
      from,
      to,
      userId: req.user.userId,
      role: req.user.role,
    });
    if (!rows || rows.length === 0) {
      return res.status(404).json({ message: 'Class and course were not found or you are not authorized to access this class.' });
    }

    const report = attendanceReportService.buildAttendanceReport(rows, {
      from,
      to,
      threshold: attendanceThreshold,
    });
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    await auditModel.logEvent({
      actor: req.user.username,
      action: 'REPORT_ATTENDANCE',
      target: `class/${classId}/course/${courseId}/${from}/${to}`,
      ipAddress: clientIp,
      details: `${report.students.length} students included in attendance report`,
    });
    return res.status(200).json(report);
  } catch (err) {
    console.error('[Report] Attendance report generation failed:', err.message);
    return res.status(500).json({ message: 'Unable to generate attendance report. Please try again.' });
  }
}

/** Existing SAM-F-010 low-attendance endpoint. */
async function getLowAttendanceReport(req, res) {
  const { classId, threshold = attendanceThreshold } = req.query;
  const numThreshold = Number(threshold);

  if (!Number.isFinite(numThreshold) || numThreshold < 1 || numThreshold > 100) {
    return res.status(400).json({ message: 'Threshold must be a percentage between 1 and 100.' });
  }

  const parsedClassId = parsePositiveId(classId);
  if (!parsedClassId) {
    return res.status(400).json({ message: 'A valid classId query parameter is required.' });
  }

  if (req.user.role === 'faculty') {
    try {
      const assigned = await facultyModel.getAssignedClassRoster(req.user.userId, parsedClassId);
      if (!assigned) {
        return res.status(404).json({ message: 'Class not found or not assigned to you.' });
      }
    } catch (err) {
      console.error('[Report] Class verification failed:', err.message);
      return res.status(500).json({ message: 'Unable to verify class assignment. Please try again.' });
    }
  }

  try {
    const flaggedStudents = await attendanceModel.getStudentsBelowThreshold({
      classId: parsedClassId,
      threshold: numThreshold,
    });
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    await auditModel.logEvent({
      actor: req.user.username,
      action: 'REPORT_LOW_ATTENDANCE',
      target: `class/${parsedClassId}/threshold/${numThreshold}`,
      ipAddress: clientIp,
      details: `${flaggedStudents.length} students flagged below ${numThreshold}%`,
    });

    return res.status(200).json({
      classId: parsedClassId,
      threshold: numThreshold,
      flaggedCount: flaggedStudents.length,
      students: flaggedStudents,
    });
  } catch (err) {
    console.error('[Report] Low attendance query failed:', err.message);
    return res.status(500).json({ message: 'Unable to generate low-attendance report. Please try again.' });
  }
}

module.exports = { getReportClasses, getAttendanceReport, getLowAttendanceReport, parsePositiveId };
