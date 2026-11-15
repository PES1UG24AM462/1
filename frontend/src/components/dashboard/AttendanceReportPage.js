/**
 * AttendanceReportPage.js
 *
 * SAM-F-011 — Generate attendance reports for class / date range.
 * SAM-F-013 — Export attendance reports in CSV format (TC-REP-05).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as reportService from '../../services/reportService';
import { isValidAttendanceDate } from '../../utils/attendanceDate';
import './AttendanceReportPage.css';

function classLabel(item) {
  const section = item.section ? ` · Section ${item.section}` : '';
  const year = item.academicYear ? ` · ${item.academicYear}` : '';
  return `${item.classId} — ${item.courseCode}${section}${year}`;
}

function formatPercentage(value) {
  return value === null || value === undefined ? '—' : `${Number(value).toFixed(2)}%`;
}

/**
 * triggerCsvDownload
 * Creates a temporary <a> element to download the CSV blob without
 * navigating away from the page.
 */
function triggerCsvDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function AttendanceReportPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [classes, setClasses]               = useState([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError, setClassesError]     = useState('');

  const [courseId, setCourseId]   = useState('');
  const [classId, setClassId]     = useState('');
  const [studentId, setStudentId] = useState('');
  const [students, setStudents]   = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError]     = useState('');

  const [from, setFrom] = useState('');
  const [to, setTo]     = useState('');

  const [formError, setFormError]     = useState('');
  const [report, setReport]           = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

  // ── SAM-F-013: CSV export state ───────────────────────────────────────────
  const [csvLoading, setCsvLoading] = useState(false);
  const [csvError, setCsvError]     = useState('');

  const studentRequest = useRef(0);

  const loadClasses = useCallback(async () => {
    setClassesLoading(true);
    setClassesError('');
    try {
      const result = await reportService.getReportClasses();
      setClasses(result.classes);
    } catch (err) {
      setClasses([]);
      setClassesError(err.message || 'Unable to load report classes. Please try again.');
    } finally {
      setClassesLoading(false);
    }
  }, []);

  useEffect(() => { loadClasses(); }, [loadClasses]);

  const courses = useMemo(() => {
    const byId = new Map();
    classes.forEach((item) => {
      byId.set(String(item.courseId), {
        courseId: item.courseId,
        courseCode: item.courseCode,
        courseName: item.courseName,
      });
    });
    return [...byId.values()].sort((l, r) => l.courseCode.localeCompare(r.courseCode));
  }, [classes]);

  const courseClasses = useMemo(
    () => classes.filter((item) => String(item.courseId) === courseId),
    [classes, courseId]
  );

  useEffect(() => {
    const requestId = ++studentRequest.current;
    setStudents([]);
    setStudentsError('');
    if (!classId || !courseClasses.some((item) => String(item.classId) === classId)) {
      setStudentsLoading(false);
      return undefined;
    }
    setStudentsLoading(true);
    reportService.getReportStudents(classId)
      .then((result) => { if (studentRequest.current === requestId) setStudents(result.students); })
      .catch((err)   => { if (studentRequest.current === requestId) setStudentsError(err.message || 'Unable to load students.'); })
      .finally(()    => { if (studentRequest.current === requestId) setStudentsLoading(false); });
    return () => { studentRequest.current += 1; };
  }, [classId, courseClasses]);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  function buildFilters() {
    const filters = { courseId, classId, from, to };
    if (studentId) filters.studentId = studentId;
    return filters;
  }

  function validateFilters() {
    if (!courseId) { setFormError('Select a course to continue.'); return false; }
    if (!classId || !courseClasses.some((item) => String(item.classId) === classId)) {
      setFormError('Select a class belonging to the selected course.'); return false;
    }
    if (!isValidAttendanceDate(from) || !isValidAttendanceDate(to)) {
      setFormError('Enter valid start and end dates.'); return false;
    }
    if (to < from) { setFormError('The end date must be on or after the start date.'); return false; }
    return true;
  }

  function handleGenerate(event) {
    event.preventDefault();
    setFormError('');
    setReportError('');
    setCsvError('');
    setReport(null);
    if (!validateFilters()) return;
    setReportLoading(true);
    reportService.generateAttendanceReport(buildFilters())
      .then(setReport)
      .catch((err) => setReportError(err.message || 'Unable to generate attendance report. Please try again.'))
      .finally(() => setReportLoading(false));
  }

  // ── SAM-F-013: Export handler ─────────────────────────────────────────────
  async function handleExportCsv() {
    setCsvError('');
    if (!validateFilters()) return;
    setCsvLoading(true);
    try {
      const { blob, filename } = await reportService.exportAttendanceCsv(buildFilters());
      triggerCsvDownload(blob, filename);
    } catch (err) {
      setCsvError(err.message || 'Unable to export CSV. Please try again.');
    } finally {
      setCsvLoading(false);
    }
  }

  function clearFilters() {
    studentRequest.current += 1;
    setCourseId(''); setClassId(''); setStudentId('');
    setFrom(''); setTo('');
    setStudents([]); setStudentsError('');
    setReport(null); setReportError('');
    setFormError(''); setCsvError('');
  }

  const dashboard = user?.role === 'admin' ? '/admin/dashboard' : '/faculty/dashboard';

  // Can we export? — filters must be valid and a report already generated (or just valid filters)
  const canExport = !csvLoading && !reportLoading && courseId && classId && from && to;

  return (
    <main className="attendance-report-page">
      <header className="report-page-header">
        <div>
          <p className="report-eyebrow">Student Attendance Management System</p>
          <h1>Attendance reports</h1>
          <p className="report-subtitle">Generate a class report and export it as CSV.</p>
        </div>
        <div className="report-header-actions">
          <Link className="report-secondary-button" to={dashboard}>Back to dashboard</Link>
          <button className="report-signout" type="button" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

      {/* Filters */}
      <section className="report-card" aria-labelledby="report-filter-title">
        <h2 id="report-filter-title">Report filters</h2>
        {classesLoading ? (
          <p role="status">Loading available classes…</p>
        ) : classesError ? (
          <div className="report-error" role="alert">
            <p>{classesError}</p>
            <button className="report-secondary-button" type="button" onClick={loadClasses}>Try again</button>
          </div>
        ) : classes.length === 0 ? (
          <p className="report-empty" role="status">No classes are available for report generation.</p>
        ) : (
          <form onSubmit={handleGenerate} noValidate>
            <div className="report-fields">
              <label className="report-field" htmlFor="report-course">
                <span>Course</span>
                <select id="report-course" value={courseId}
                  onChange={(e) => { setCourseId(e.target.value); setClassId(''); setStudentId(''); setReport(null); setReportError(''); setFormError(''); setCsvError(''); }}
                  disabled={reportLoading} required>
                  <option value="">Choose a course</option>
                  {courses.map((course) => (
                    <option key={course.courseId} value={String(course.courseId)}>
                      {course.courseCode} — {course.courseName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="report-field" htmlFor="report-class">
                <span>Class</span>
                <select id="report-class" value={classId}
                  onChange={(e) => { setClassId(e.target.value); setStudentId(''); setReport(null); setReportError(''); setFormError(''); setCsvError(''); }}
                  disabled={!courseId || reportLoading} required>
                  <option value="">Choose a class</option>
                  {courseClasses.map((item) => (
                    <option key={item.classId} value={String(item.classId)}>{classLabel(item)}</option>
                  ))}
                </select>
              </label>

              <label className="report-field" htmlFor="report-student">
                <span>Student</span>
                <select id="report-student" value={studentId}
                  onChange={(e) => { setStudentId(e.target.value); setReport(null); setReportError(''); setFormError(''); setCsvError(''); }}
                  disabled={!classId || studentsLoading || reportLoading}>
                  <option value="">All students</option>
                  {students.map((student) => (
                    <option key={student.studentId} value={String(student.studentId)}>
                      {student.studentNumber ? `${student.studentNumber} - ` : ''}{student.fullName || `Student ${student.studentId}`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="report-field" htmlFor="report-from">
                <span>Start date</span>
                <input id="report-from" type="date" value={from}
                  onChange={(e) => { setFrom(e.target.value); setReport(null); setReportError(''); setFormError(''); setCsvError(''); }}
                  disabled={reportLoading} required />
              </label>

              <label className="report-field" htmlFor="report-to">
                <span>End date</span>
                <input id="report-to" type="date" value={to}
                  onChange={(e) => { setTo(e.target.value); setReport(null); setReportError(''); setFormError(''); setCsvError(''); }}
                  disabled={reportLoading} required />
              </label>
            </div>

            {studentsLoading && <p role="status">Loading students for this class…</p>}
            {studentsError   && <p className="report-error" role="alert">{studentsError}</p>}
            {formError       && <p className="report-error" role="alert">{formError}</p>}
            {reportError     && <p className="report-error" role="alert">{reportError}</p>}

            <div className="report-filter-actions">
              <button className="report-primary-button" type="submit"
                disabled={reportLoading || studentsLoading} aria-busy={reportLoading}>
                {reportLoading ? 'Generating…' : 'Generate report'}
              </button>

              {/* SAM-F-013: Export CSV button */}
              <button
                className="report-export-button"
                type="button"
                onClick={handleExportCsv}
                disabled={!canExport}
                aria-busy={csvLoading}
                title="Export the current report as a CSV file"
              >
                {csvLoading ? 'Exporting…' : '⬇ Export CSV'}
              </button>

              <button className="report-secondary-button" type="button"
                onClick={clearFilters} disabled={reportLoading || csvLoading}>
                Clear filters
              </button>
            </div>

            {/* CSV export error */}
            {csvError && (
              <p className="report-error report-csv-error" role="alert">{csvError}</p>
            )}
          </form>
        )}
      </section>

      {reportLoading && <p className="report-status" role="status">Loading attendance report…</p>}

      {/* Generated report table */}
      {report && (
        <section className="report-card" aria-labelledby="generated-report-title">
          <div className="generated-report-header">
            <div>
              <p className="report-eyebrow">Generated report</p>
              <h2 id="generated-report-title">{report.class.courseCode} — {report.class.courseName}</h2>
              <p className="report-subtitle">
                Class {report.class.classId}
                {report.class.section    ? ` · Section ${report.class.section}`    : ''}
                {report.class.academicYear ? ` · ${report.class.academicYear}`     : ''}
              </p>
              <p className="report-range">{report.dateRange.from} through {report.dateRange.to}</p>
            </div>
            <div className="report-export-inline">
              <p className="report-generated-at">
                Generated <time dateTime={report.generatedAt}>{new Date(report.generatedAt).toLocaleString()}</time>
              </p>
              {/* Inline export button in results panel */}
              <button
                className="report-export-button"
                type="button"
                onClick={handleExportCsv}
                disabled={!canExport}
                aria-busy={csvLoading}
              >
                {csvLoading ? 'Exporting…' : '⬇ Export CSV'}
              </button>
            </div>
          </div>

          <div className="report-summary" aria-label="Attendance summary">
            <div><span>Students with records</span><strong>{report.summary.studentCount}</strong></div>
            <div><span>Overall attendance</span><strong>{formatPercentage(report.summary.overallAttendancePercentage)}</strong></div>
            <div><span>Average attendance</span><strong>{formatPercentage(report.summary.averageAttendancePercentage)}</strong></div>
            <div><span>Below {report.threshold}%</span><strong>{report.summary.belowThresholdCount}</strong></div>
          </div>

          {report.students.length === 0 ? (
            <p className="report-empty report-no-records" role="status">
              No attendance records found for the selected class and date range.
            </p>
          ) : (
            <div className="report-table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th scope="col">USN</th>
                    <th scope="col">Student Name</th>
                    <th scope="col">Present</th>
                    <th scope="col">Late</th>
                    <th scope="col">Absent</th>
                    <th scope="col">Attended</th>
                    <th scope="col">Classes Held</th>
                    <th scope="col">Attendance %</th>
                    <th scope="col">Threshold</th>
                  </tr>
                </thead>
                <tbody>
                  {report.students.map((student) => (
                    <tr key={student.studentId} className={student.belowThreshold ? 'report-row-low' : ''}>
                      <td>{student.studentNumber || student.studentId}</td>
                      <td>{student.fullName || '—'}</td>
                      <td>{student.presentCount}</td>
                      <td>{student.lateCount}</td>
                      <td>{student.absentCount}</td>
                      <td>{student.attendanceCount}</td>
                      <td>{student.eligibleClassesHeld}</td>
                      <td><strong>{formatPercentage(student.attendancePercentage)}</strong></td>
                      <td>
                        <span className={student.belowThreshold ? 'report-badge-low' : 'report-badge-ok'}>
                          {student.belowThreshold ? `Below ${report.threshold}%` : 'OK'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default AttendanceReportPage;
