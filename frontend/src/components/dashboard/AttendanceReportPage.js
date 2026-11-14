import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

function AttendanceReportPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError, setClassesError] = useState('');
  const [courseId, setCourseId] = useState('');
  const [classId, setClassId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [formError, setFormError] = useState('');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState('');

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
    return [...byId.values()].sort((left, right) => left.courseCode.localeCompare(right.courseCode));
  }, [classes]);

  const courseClasses = useMemo(
    () => classes.filter((item) => String(item.courseId) === courseId),
    [classes, courseId]
  );

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  function handleGenerate(event) {
    event.preventDefault();
    setFormError('');
    setReportError('');
    setReport(null);

    if (!courseId) { setFormError('Select a course to continue.'); return; }
    if (!classId || !courseClasses.some((item) => String(item.classId) === classId)) {
      setFormError('Select a class belonging to the selected course.');
      return;
    }
    if (!isValidAttendanceDate(from) || !isValidAttendanceDate(to)) {
      setFormError('Enter valid start and end dates.');
      return;
    }
    if (to < from) {
      setFormError('The end date must be on or after the start date.');
      return;
    }

    setReportLoading(true);
    reportService.generateAttendanceReport({ courseId, classId, from, to })
      .then(setReport)
      .catch((err) => setReportError(err.message || 'Unable to generate attendance report. Please try again.'))
      .finally(() => setReportLoading(false));
  }

  const dashboard = user?.role === 'admin' ? '/admin/dashboard' : '/faculty/dashboard';

  return (
    <main className="attendance-report-page">
      <header className="report-page-header">
        <div>
          <p className="report-eyebrow">Student Attendance Management System</p>
          <h1>Attendance reports</h1>
          <p className="report-subtitle">Generate a class report for a selected course and date range.</p>
        </div>
        <div className="report-header-actions">
          <Link className="report-secondary-button" to={dashboard}>Back to dashboard</Link>
          <button className="report-signout" type="button" onClick={handleLogout}>Sign out</button>
        </div>
      </header>

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
                <select
                  id="report-course"
                  value={courseId}
                  onChange={(event) => { setCourseId(event.target.value); setClassId(''); setReport(null); setReportError(''); setFormError(''); }}
                  disabled={reportLoading}
                  required
                >
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
                <select
                  id="report-class"
                  value={classId}
                  onChange={(event) => { setClassId(event.target.value); setReport(null); setReportError(''); setFormError(''); }}
                  disabled={!courseId || reportLoading}
                  required
                >
                  <option value="">Choose a class</option>
                  {courseClasses.map((item) => (
                    <option key={item.classId} value={String(item.classId)}>{classLabel(item)}</option>
                  ))}
                </select>
              </label>
              <label className="report-field" htmlFor="report-from">
                <span>Start date</span>
                <input
                  id="report-from"
                  type="date"
                  value={from}
                  onChange={(event) => { setFrom(event.target.value); setReport(null); setReportError(''); setFormError(''); }}
                  disabled={reportLoading}
                  required
                />
              </label>
              <label className="report-field" htmlFor="report-to">
                <span>End date</span>
                <input
                  id="report-to"
                  type="date"
                  value={to}
                  onChange={(event) => { setTo(event.target.value); setReport(null); setReportError(''); setFormError(''); }}
                  disabled={reportLoading}
                  required
                />
              </label>
            </div>
            {formError && <p className="report-error" role="alert">{formError}</p>}
            {reportError && <p className="report-error" role="alert">{reportError}</p>}
            <button className="report-primary-button" type="submit" disabled={reportLoading} aria-busy={reportLoading}>
              {reportLoading ? 'Generating report…' : 'Generate report'}
            </button>
          </form>
        )}
      </section>

      {reportLoading && <p className="report-status" role="status">Loading attendance report…</p>}
      {report && (
        <section className="report-card" aria-labelledby="generated-report-title">
          <div className="generated-report-header">
            <div>
              <p className="report-eyebrow">Generated report</p>
              <h2 id="generated-report-title">{report.class.courseCode} — {report.class.courseName}</h2>
              <p className="report-subtitle">
                Class {report.class.classId}{report.class.section ? ` · Section ${report.class.section}` : ''}
                {report.class.academicYear ? ` · ${report.class.academicYear}` : ''}
              </p>
              <p className="report-range">{report.dateRange.from} through {report.dateRange.to}</p>
            </div>
            <p className="report-generated-at">
              Generated <time dateTime={report.generatedAt}>{new Date(report.generatedAt).toLocaleString()}</time>
            </p>
          </div>

          <div className="report-summary" aria-label="Attendance summary">
            <div><span>Students with records</span><strong>{report.summary.studentCount}</strong></div>
            <div><span>Overall attendance</span><strong>{formatPercentage(report.summary.overallAttendancePercentage)}</strong></div>
            <div><span>Average student attendance</span><strong>{formatPercentage(report.summary.averageAttendancePercentage)}</strong></div>
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
                    <th scope="col">Student ID</th>
                    <th scope="col">Student name</th>
                    <th scope="col">Present</th>
                    <th scope="col">Late</th>
                    <th scope="col">Absent</th>
                    <th scope="col">Attended</th>
                    <th scope="col">Eligible classes</th>
                    <th scope="col">Attendance</th>
                    <th scope="col">Threshold status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.students.map((student) => (
                    <tr key={student.studentId}>
                      <td>{student.studentNumber || student.studentId}</td>
                      <td>{student.fullName || '—'}</td>
                      <td>{student.presentCount}</td>
                      <td>{student.lateCount}</td>
                      <td>{student.absentCount}</td>
                      <td>{student.attendanceCount}</td>
                      <td>{student.eligibleClassesHeld}</td>
                      <td>{formatPercentage(student.attendancePercentage)}</td>
                      <td>{student.belowThreshold ? `Below ${report.threshold}%` : 'At or above threshold'}</td>
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
