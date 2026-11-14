/**
 * StudentDashboard.js
 *
 * SAM-F-008 — Student views attendance history by course and date.
 * SAM-F-009 — System calculates and displays attendance percentage per course.
 *
 * TC-REP-01: Percentage card shows attended/total and % for each course.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as studentService from '../../services/studentService';
import { isValidAttendanceDate } from '../../utils/attendanceDate';
import './StudentDashboard.css';

// Threshold below which the percentage chip turns red (SAM-F-010 uses this too)
const LOW_THRESHOLD = 75;

function PercentageChip({ value }) {
  const cls = value >= LOW_THRESHOLD ? 'pct-chip pct-chip--ok' : 'pct-chip pct-chip--low';
  return <span className={cls}>{value.toFixed(2)}%</span>;
}

function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // ── Courses ──────────────────────────────────────────────────────────────
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState('');

  // ── Attendance history (SAM-F-008) ────────────────────────────────────────
  const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState('');
  const [records, setRecords] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [filterError, setFilterError] = useState('');
  const requestId = useRef(0);

  // ── Attendance percentages (SAM-F-009) ────────────────────────────────────
  const [percentages, setPercentages] = useState(null);
  const [pctLoading, setPctLoading] = useState(true);
  const [pctError, setPctError] = useState('');

  // ── Load enrolled courses ─────────────────────────────────────────────────
  const loadCourses = useCallback(async () => {
    setCoursesLoading(true);
    setCoursesError('');
    try {
      const result = await studentService.getEnrolledCourses();
      setCourses(result.courses);
    } catch (err) {
      setCourses([]);
      setCoursesError(err.message || 'Unable to load your courses. Please try again.');
    } finally {
      setCoursesLoading(false);
    }
  }, []);

  // ── Load attendance history ───────────────────────────────────────────────
  const loadHistory = useCallback(async (filters = {}) => {
    const currentRequest = ++requestId.current;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const result = await studentService.getAttendanceHistory(filters);
      if (requestId.current === currentRequest) setRecords(result.records);
    } catch (err) {
      if (requestId.current === currentRequest) {
        setRecords(null);
        setHistoryError(err.message || 'Unable to load attendance history. Please try again.');
      }
    } finally {
      if (requestId.current === currentRequest) setHistoryLoading(false);
    }
  }, []);

  // ── SAM-F-009: Load attendance percentages ────────────────────────────────
  const loadPercentages = useCallback(async () => {
    setPctLoading(true);
    setPctError('');
    try {
      const result = await studentService.getAttendancePercentages();
      setPercentages(result.percentages);
    } catch (err) {
      setPctError(err.message || 'Unable to calculate attendance percentages. Please try again.');
    } finally {
      setPctLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCourses();
    loadHistory();
    loadPercentages();
    return () => { requestId.current += 1; };
  }, [loadCourses, loadHistory, loadPercentages]);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  function handleFilterChange(setter) {
    return (event) => {
      setter(event.target.value);
      requestId.current += 1;
      setRecords(null);
      setHistoryLoading(false);
      setHistoryError('');
      setFilterError('');
    };
  }

  function handleSubmit(event) {
    event.preventDefault();
    setRecords(null);
    setFilterError('');
    if (date && !isValidAttendanceDate(date)) {
      setFilterError('Enter a valid attendance date.');
      return;
    }
    loadHistory({ courseId, date });
  }

  function clearFilters() {
    setCourseId('');
    setDate('');
    setRecords(null);
    setFilterError('');
    setHistoryError('');
    loadHistory();
  }

  return (
    <main className="student-page">

      {/* Header */}
      <header className="student-header">
        <div>
          <p className="student-eyebrow">Student Attendance Management System</p>
          <h1>Welcome, {user?.fullName || 'Student'}</h1>
          <p className="student-subtitle">View your attendance percentage and history.</p>
        </div>
        <button className="student-signout" type="button" onClick={handleLogout}>Sign out</button>
      </header>

      {/* ── SAM-F-009: Attendance Percentage Section ───────────────────── */}
      <section className="student-card" aria-labelledby="pct-title">
        <div className="pct-heading">
          <h2 id="pct-title">Attendance percentage</h2>
          {!pctLoading && !pctError && (
            <button
              className="student-secondary-button"
              type="button"
              onClick={loadPercentages}
              aria-label="Refresh percentages"
            >
              Refresh
            </button>
          )}
        </div>

        {pctLoading && <p role="status">Calculating your attendance percentages…</p>}

        {pctError && (
          <div className="student-error" role="alert">
            <p>{pctError}</p>
            <button className="student-secondary-button" type="button" onClick={loadPercentages}>
              Try again
            </button>
          </div>
        )}

        {!pctLoading && !pctError && percentages !== null && (
          percentages.length === 0 ? (
            <p className="student-empty" role="status">
              No attendance records yet. Percentages will appear once attendance is marked.
            </p>
          ) : (
            <div className="pct-grid" aria-label="Attendance percentages by course">
              {percentages.map((item) => (
                <div
                  key={`${item.courseId}-${item.classId}`}
                  className={`pct-card ${item.percentage < LOW_THRESHOLD ? 'pct-card--low' : 'pct-card--ok'}`}
                  role="article"
                  aria-label={`${item.courseCode} attendance ${item.percentage.toFixed(2)}%`}
                >
                  <div className="pct-card-top">
                    <div>
                      <p className="pct-code">{item.courseCode}</p>
                      <p className="pct-name">{item.courseName}</p>
                      {item.section && (
                        <p className="pct-meta">
                          Section {item.section}
                          {item.academicYear ? ` · ${item.academicYear}` : ''}
                        </p>
                      )}
                    </div>
                    <PercentageChip value={item.percentage} />
                  </div>

                  {/* Progress bar */}
                  <div className="pct-bar-track" aria-hidden="true">
                    <div
                      className={`pct-bar-fill ${item.percentage < LOW_THRESHOLD ? 'pct-bar-fill--low' : ''}`}
                      style={{ width: `${Math.min(item.percentage, 100)}%` }}
                    />
                  </div>

                  {/* Breakdown */}
                  <div className="pct-breakdown" aria-label="Attendance breakdown">
                    <span className="pct-stat pct-stat--present">
                      ✓ {item.present} Present
                    </span>
                    <span className="pct-stat pct-stat--late">
                      ◷ {item.late} Late
                    </span>
                    <span className="pct-stat pct-stat--absent">
                      ✗ {item.absent} Absent
                    </span>
                    <span className="pct-stat pct-stat--total">
                      {item.attended}/{item.totalClasses} classes
                    </span>
                  </div>

                  {item.percentage < LOW_THRESHOLD && (
                    <p className="pct-warning" role="alert">
                      ⚠ Below {LOW_THRESHOLD}% attendance threshold
                    </p>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </section>

      {/* ── SAM-F-008: Attendance History Section ─────────────────────── */}
      <section className="student-card" aria-labelledby="history-filter-title">
        <h2 id="history-filter-title">Attendance history</h2>
        {coursesLoading ? (
          <p role="status">Loading your courses…</p>
        ) : coursesError ? (
          <div className="student-error" role="alert">
            <p>{coursesError}</p>
            <button className="student-secondary-button" type="button" onClick={loadCourses}>Try again</button>
          </div>
        ) : courses.length === 0 ? (
          <p className="student-empty" role="status">You are not enrolled in any courses yet.</p>
        ) : (
          <form className="student-filter-form" onSubmit={handleSubmit} noValidate>
            <label className="student-field" htmlFor="history-course">
              <span>Course</span>
              <select id="history-course" value={courseId} onChange={handleFilterChange(setCourseId)}>
                <option value="">All my courses</option>
                {courses.map((course) => (
                  <option key={course.course_id} value={String(course.course_id)}>
                    {course.course_code} — {course.course_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="student-field" htmlFor="history-date">
              <span>Attendance date</span>
              <input id="history-date" type="date" value={date} onChange={handleFilterChange(setDate)} />
            </label>
            {filterError && <p className="student-error" role="alert">{filterError}</p>}
            <div className="student-filter-actions">
              <button className="student-primary-button" type="submit" disabled={historyLoading}>
                {historyLoading ? 'Loading history…' : 'Apply filters'}
              </button>
              <button className="student-secondary-button" type="button" onClick={clearFilters} disabled={historyLoading}>
                Clear filters
              </button>
            </div>
          </form>
        )}
      </section>

      {historyLoading && <p className="student-inline-status" role="status">Loading your attendance history…</p>}
      {historyError && (
        <div className="student-card student-error" role="alert">
          <p>{historyError}</p>
          <button className="student-secondary-button" type="button" onClick={() => loadHistory({ courseId, date })}>
            Try again
          </button>
        </div>
      )}

      {records && (
        <section className="student-card" aria-labelledby="history-results-title">
          <div className="student-results-heading">
            <div>
              <h2 id="history-results-title">Your records</h2>
              <p>
                {courseId ? courses.find((c) => String(c.course_id) === courseId)?.course_code : 'All courses'}
                {date ? ` · ${date}` : ' · All dates'}
              </p>
            </div>
            <span className="student-record-count">
              {records.length} {records.length === 1 ? 'record' : 'records'}
            </span>
          </div>
          {records.length === 0 ? (
            <p className="student-empty" role="status">No attendance records found for the selected filters.</p>
          ) : (
            <div className="student-table-scroll">
              <table className="student-history-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Course</th>
                    <th scope="col">Section</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.attendance_id}>
                      <td>{String(record.attendance_date).slice(0, 10)}</td>
                      <td>
                        <strong>{record.course_code}</strong>
                        <span className="student-course-name">{record.course_name}</span>
                      </td>
                      <td>{record.section || '—'}</td>
                      <td>
                        <span className={`student-status student-status-${record.status.toLowerCase()}`}>
                          {record.status}
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

export default StudentDashboard;
