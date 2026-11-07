/**
 * percentageController.js
 * Handles GET /api/student/attendance/percentage (SAM-F-009).
 *
 * Requirements:
 *   SAM-F-009  — System shall calculate attendance percentage per student/course.
 *   SAM-SR-005 — Students can only access their own data (server-side check).
 *   SAM-SR-003 — Student-only route enforced by RBAC middleware.
 *
 * Test case: TC-REP-01
 *
 * Query params:
 *   courseId (optional) — filter to one specific course
 */

const percentageModel = require('../models/percentageModel');
const studentModel = require('../models/studentModel');

/**
 * getAttendancePercentage
 * GET /api/student/attendance/percentage
 *
 * @route  GET /api/student/attendance/percentage
 * @access Student only
 */
async function getAttendancePercentage(req, res) {
  const { courseId } = req.query;

  // Validate optional courseId
  let parsedCourseId = null;
  if (courseId !== undefined) {
    const n = Number(courseId);
    if (!Number.isInteger(n) || n <= 0) {
      return res.status(400).json({ message: 'Select a valid course.' });
    }
    parsedCourseId = n;
  }

  try {
    // SAM-SR-005: if a specific course is requested, verify the student
    // is enrolled in (or has attendance records for) it before returning data.
    if (parsedCourseId !== null) {
      const hasAccess = await studentModel.hasCourseAccess(req.user.userId, parsedCourseId);
      if (!hasAccess) {
        return res.status(404).json({ message: 'Course not found.' });
      }
    }

    const percentages = await percentageModel.getAttendancePercentages(
      req.user.userId,
      parsedCourseId
    );

    return res.status(200).json({ percentages });
  } catch (err) {
    console.error('[Percentage] Calculation failed:', err.message);
    return res
      .status(500)
      .json({ message: 'Unable to calculate attendance percentage. Please try again.' });
  }
}

module.exports = { getAttendancePercentage };
