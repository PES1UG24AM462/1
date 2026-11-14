/**
 * csvHelper.js
 * Converts an attendance report object into a CSV string.
 *
 * SAM-F-013 — Export attendance reports in CSV format.
 * TC-REP-05  — The exported file must contain all required columns
 *              and be downloadable as a .csv file.
 *
 * CSV format:
 *   Section 1 — Report metadata (course, class, date range, generated at)
 *   Section 2 — Summary row (total students, classes held, overall %)
 *   Section 3 — Per-student rows (USN, Name, Present, Late, Absent, Total, %)
 *
 * RFC 4180 rules applied:
 *   - Fields containing commas, double-quotes, or newlines are quoted.
 *   - Double-quotes inside a field are escaped as "".
 *   - Lines end with CRLF.
 */

/**
 * Escape a single CSV field value.
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function escapeField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // If the field contains comma, double-quote, or newline — wrap in quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a single CSV line from an array of field values.
 * @param {Array} fields
 * @returns {string}  line ending with CRLF
 */
function csvLine(fields) {
  return fields.map(escapeField).join(',') + '\r\n';
}

/**
 * reportToCsv
 * Converts the attendance report object (output of buildAttendanceReport)
 * into a complete CSV string ready to be sent as a file download.
 *
 * @param {Object} report  - as returned by attendanceReportService.buildAttendanceReport
 * @returns {string}        - full CSV content
 */
function reportToCsv(report) {
  const lines = [];

  // ── Section 1: Metadata ───────────────────────────────────────────────────
  lines.push(csvLine(['Student Attendance Management System — Attendance Report']));
  lines.push(csvLine([]));  // blank line
  lines.push(csvLine(['Course Code',   report.class.courseCode]));
  lines.push(csvLine(['Course Name',   report.class.courseName]));
  lines.push(csvLine(['Class ID',      report.class.classId]));
  lines.push(csvLine(['Section',       report.class.section || '—']));
  lines.push(csvLine(['Academic Year', report.class.academicYear || '—']));
  lines.push(csvLine(['Date From',     report.dateRange.from]));
  lines.push(csvLine(['Date To',       report.dateRange.to]));
  lines.push(csvLine(['Threshold',     `${report.threshold}%`]));
  lines.push(csvLine(['Generated At',  report.generatedAt]));
  lines.push(csvLine([]));  // blank line

  // ── Section 2: Summary ────────────────────────────────────────────────────
  lines.push(csvLine(['--- Summary ---']));
  lines.push(csvLine(['Total Students',         report.summary.studentCount]));
  lines.push(csvLine(['Total Class Dates Held', report.summary.recordedClassDates]));
  lines.push(csvLine(['Total Present',          report.summary.totalPresent]));
  lines.push(csvLine(['Total Late',             report.summary.totalLate]));
  lines.push(csvLine(['Total Absent',           report.summary.totalAbsent]));
  lines.push(csvLine(['Overall Attendance %',
    report.summary.overallAttendancePercentage !== null
      ? `${report.summary.overallAttendancePercentage}%`
      : '—',
  ]));
  lines.push(csvLine(['Average Attendance %',
    report.summary.averageAttendancePercentage !== null
      ? `${report.summary.averageAttendancePercentage}%`
      : '—',
  ]));
  lines.push(csvLine(['Below Threshold Count',  report.summary.belowThresholdCount]));
  lines.push(csvLine([]));  // blank line

  // ── Section 3: Per-student data ───────────────────────────────────────────
  lines.push(csvLine(['--- Student Records ---']));
  lines.push(csvLine([
    'USN',
    'Student Name',
    'Classes Held',
    'Present',
    'Late',
    'Absent',
    'Attended (Present + Late)',
    'Attendance %',
    'Below Threshold',
  ]));

  report.students.forEach((student) => {
    lines.push(csvLine([
      student.studentNumber || '—',
      student.fullName      || '—',
      student.eligibleClassesHeld,
      student.presentCount,
      student.lateCount,
      student.absentCount,
      student.attendanceCount,
      student.attendancePercentage !== null ? `${student.attendancePercentage}%` : '—',
      student.belowThreshold ? 'Yes' : 'No',
    ]));
  });

  return lines.join('');
}

/**
 * csvFilename
 * Generates a safe, descriptive filename for the download.
 * Example: SAMS_CS301_SectionA_2026-10-01_2026-10-31.csv
 *
 * @param {Object} report
 * @returns {string}
 */
function csvFilename(report) {
  const code    = report.class.courseCode.replace(/[^a-zA-Z0-9]/g, '');
  const section = report.class.section ? `_Section${report.class.section.replace(/[^a-zA-Z0-9]/g, '')}` : '';
  const from    = report.dateRange.from;
  const to      = report.dateRange.to;
  return `SAMS_${code}${section}_${from}_${to}.csv`;
}

module.exports = { reportToCsv, csvFilename, escapeField };
