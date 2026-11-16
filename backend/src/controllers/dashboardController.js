/**
 * dashboardController.js
 * SAM-F-017 — Attendance summaries on the dashboard.
 *
 * GET /api/dashboard/summary
 *   Returns role-appropriate summary data:
 *   - admin   → system-wide totals + recent audit events
 *   - faculty → today's session stats + recent sessions
 *   - student → overall attendance snapshot
 *
 * TC-DASH-01: Dashboard shows attendance summaries and report-generation status.
 */

const dashboardModel = require('../models/dashboardModel');
const { attendanceThreshold } = require('../config/attendancePolicy');
const { logOperationalError } = require('../utils/logOperationalError');

async function getDashboardSummary(req, res) {
  const { role, userId } = req.user;

  try {
    if (role === 'admin') {
      const summary = await dashboardModel.getAdminSummary(attendanceThreshold);
      return res.status(200).json({ role, summary });
    }

    if (role === 'faculty') {
      // Allow optional ?date= override for testing; defaults to today
      const date = req.query.date || null;
      const summary = await dashboardModel.getFacultySummary(userId, date);
      return res.status(200).json({ role, summary });
    }

    if (role === 'student') {
      const summary = await dashboardModel.getStudentSummary(userId, attendanceThreshold);
      return res.status(200).json({ role, summary });
    }

    return res.status(400).json({ message: 'Unknown role.' });

  } catch (err) {
    logOperationalError('dashboard.summary_failed', err, res);
    return res.status(500).json({ message: 'Unable to load dashboard summary. Please try again.' });
  }
}

module.exports = { getDashboardSummary };
