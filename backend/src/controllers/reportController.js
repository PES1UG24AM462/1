/**
 * reportController.js
 * Reporting & analytics controller (SAM-F-010, TC-REP-02).
 *
 *   GET /api/reports/low-attendance
 *     Query params:
 *       - classId (required): integer ID of the class
 *       - threshold (optional): integer percentage (default: 75)
 *     Access:
 *       - Faculty: only for classes assigned to them
 *       - Admin: all classes
 */

const attendanceModel = require('../models/attendanceModel');
const facultyModel = require('../models/facultyModel');
const auditModel = require('../models/auditModel');

/**
 * getLowAttendanceReport
 * Identifies and flags students whose attendance falls below the configured threshold.
 * SAM-F-010, TC-REP-02
 *
 * @route  GET /api/reports/low-attendance
 * @access Faculty or Admin
 */
async function getLowAttendanceReport(req, res) {
  const { classId, threshold = 75 } = req.query;
  const numThreshold = Number(threshold);

  if (isNaN(numThreshold) || numThreshold < 1 || numThreshold > 100) {
    return res.status(400).json({ message: 'Threshold must be a percentage between 1 and 100.' });
  }

  const parsedClassId = Number.isInteger(Number(classId)) && Number(classId) > 0 ? Number(classId) : null;
  if (!parsedClassId) {
    return res.status(400).json({ message: 'A valid classId query parameter is required.' });
  }

  // If requester is faculty, verify class is assigned to them
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

    // SAM-SR-004: audit log for reporting access
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

module.exports = { getLowAttendanceReport };
