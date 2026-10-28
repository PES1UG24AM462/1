/**
 * attendanceController.js
 * Handles attendance marking and corrections for SAM-F-005 / SAM-F-007.
 *
 * Requirements:
 *   SAM-F-005 — Faculty marks each enrolled student Present, Absent, or Late.
 *   SAM-F-006 — Duplicate attendance for same (student, class, date) is prevented.
 *   SAM-SR-003 — Only authenticated faculty may save attendance (enforced by middleware).
 *   SAM-F-016 / SAM-SR-005: Attendance corrections are written to the audit log in the transaction.
 *
 * Test cases: TC-ATT-02 and TC-ATT-04
 * API (SAD v1.0 §4.3): POST /api/attendance
 *   Request:  { classId, date, records: [{ studentId, status }] }
 *   Response: { message, savedCount, correctionCount, corrections[] }
 *   Errors:   400 Invalid data
 *             409 Duplicate attendance (status already saved, can be updated)
 */

const attendanceModel = require('../models/attendanceModel');
const facultyModel = require('../models/facultyModel');
const { isValidAttendanceDate } = require('./facultyController');

const VALID_STATUSES = new Set(['Present', 'Absent', 'Late']);

function parsePositiveInteger(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

/**
 * submitAttendance
 * POST /api/attendance
 *
 * @route  POST /api/attendance
 * @access Faculty only (authenticate + authorise('faculty') applied in router)
 */
async function submitAttendance(req, res) {
  const { classId, date, records } = req.body || {};
  const facultyUserId = req.user.userId;

  // ── Input validation ──────────────────────────────────────────────────────
  const parsedClassId = parsePositiveInteger(classId);

  if (parsedClassId === null) {
    return res.status(400).json({ message: 'A valid class ID is required.' });
  }

  if (!isValidAttendanceDate(date)) {
    return res.status(400).json({ message: 'Enter a valid attendance date in YYYY-MM-DD format.' });
  }

  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ message: 'At least one student attendance record is required.' });
  }

  // Validate every record and prevent duplicates in the same submission batch (SAM-F-006)
  const seenStudentIds = new Set();
  const validatedRecords = [];
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return res.status(400).json({ message: 'Each record must be a valid attendance object.' });
    }

    const sid = parsePositiveInteger(record.studentId);
    if (sid === null) {
      return res.status(400).json({ message: 'Each record must have a valid studentId.' });
    }
    if (seenStudentIds.has(sid)) {
      return res.status(400).json({ message: `Duplicate student ID ${sid} in submission.` });
    }
    seenStudentIds.add(sid);

    let attendanceId;
    if (Object.prototype.hasOwnProperty.call(record, 'attendanceId')) {
      attendanceId = parsePositiveInteger(record.attendanceId);
      if (attendanceId === null) {
        return res.status(400).json({ message: 'Each correction must have a valid attendanceId.' });
      }
    }

    if (!VALID_STATUSES.has(record.status)) {
      return res.status(400).json({
        message: `Invalid status "${record.status}". Must be Present, Absent, or Late.`,
      });
    }

    validatedRecords.push({
      ...(attendanceId !== undefined && { attendanceId }),
      studentId: sid,
      status: record.status,
    });
  }

  // ── Authorization check: class must belong to this faculty member ─────────
  try {
    const assignedClass = await facultyModel.getAssignedClassRoster(facultyUserId, parsedClassId);
    if (!assignedClass) {
      return res.status(404).json({ message: 'Class not found or not assigned to you.' });
    }

    // Verify every submitted studentId is actually enrolled in this class
    const enrolledIds = new Set(assignedClass.students.map((s) => s.studentId));
    for (const record of validatedRecords) {
      if (!enrolledIds.has(record.studentId)) {
        return res.status(400).json({
          message: `Student ${record.studentId} is not enrolled in this class.`,
        });
      }
    }
  } catch (err) {
    console.error('[Attendance] Class verification failed:', err.message);
    return res.status(500).json({ message: 'Unable to verify class assignment. Please try again.' });
  }

  // ── Save attendance records ───────────────────────────────────────────────
  try {
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim()
      || req.socket.remoteAddress || 'unknown';
    const result = await attendanceModel.saveAttendanceRecords({
      classId: parsedClassId,
      date,
      recordedBy: facultyUserId,
      actor: req.user.username,
      ipAddress: clientIp,
      records: validatedRecords,
    });

    return res.status(200).json({
      message: 'Attendance saved successfully.',
      savedCount: result.savedCount,
      correctionCount: result.corrections.length,
      corrections: result.corrections,
    });
  } catch (err) {
    if (err.code === 'ATTENDANCE_NOT_FOUND') {
      return res.status(404).json({ message: 'Attendance record not found for this class session.' });
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Duplicate attendance record detected for this session.' });
    }
    console.error('[Attendance] Save failed:', err.message);
    return res.status(500).json({ message: 'Unable to save attendance. Please try again.' });
  }
}

/**
 * getSessionAttendance
 * GET /api/attendance?classId=&date=
 * Returns existing attendance for a session so faculty can see/edit prior entries.
 *
 * @route  GET /api/attendance
 * @access Faculty only
 */
async function getSessionAttendance(req, res) {
  const { classId, date } = req.query;
  const facultyUserId = req.user.userId;

  const parsedClassId = parsePositiveInteger(classId);

  if (parsedClassId === null) {
    return res.status(400).json({ message: 'A valid class ID is required.' });
  }
  if (!isValidAttendanceDate(date)) {
    return res.status(400).json({ message: 'Enter a valid attendance date in YYYY-MM-DD format.' });
  }

  try {
    // Verify this class belongs to the requesting faculty member
    const assignedClass = await facultyModel.getAssignedClassRoster(facultyUserId, parsedClassId);
    if (!assignedClass) {
      return res.status(404).json({ message: 'Class not found or not assigned to you.' });
    }

    const existing = await attendanceModel.getAttendanceForSession(parsedClassId, date);
    return res.status(200).json({ attendance: existing });
  } catch (err) {
    console.error('[Attendance] Fetch failed:', err.message);
    return res.status(500).json({ message: 'Unable to load attendance. Please try again.' });
  }
}

module.exports = { submitAttendance, getSessionAttendance };
