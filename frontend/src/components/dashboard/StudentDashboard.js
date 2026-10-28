import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as studentService from '../../services/studentService';
import { isValidAttendanceDate } from '../../utils/attendanceDate';
import './StudentDashboard.css';

function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesError, setCoursesError] = useState('');
  const [courseId, setCourseId] = useState('');
  const [date, setDate] = useState('');
  const [records, setRecords] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [filterError, setFilterError] = useState('');
  const requestId = useRef(0);

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

  useEffect(() => {
    loadCourses();
    loadHistory();
    return () => { requestId.current += 1; };
  }, [loadCourses, loadHistory]);

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
      <header className="student-header">
        <div>
          <p className="student-eyebrow">Student Attendance Management System</p>
          <h1>Welcome, {user?.fullName || 'Student'}</h1>
          <p className="student-subtitle">Review your attendance history by course and date.</p>
        </div>
        <button className="student-signout" type="button" onClick={handleLogout}>Sign out</button>
      </header>

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
          <button className="student-secondary-button" type="button" onClick={() => loadHistory({ courseId, date })}>Try again</button>
        </div>
      )}
      {records && (
        <section className="student-card" aria-labelledby="history-results-title">
          <div className="student-results-heading">
            <div>
              <h2 id="history-results-title">Your records</h2>
              <p>
                {courseId ? courses.find((course) => String(course.course_id) === courseId)?.course_code : 'All courses'}
                {date ? ` · ${date}` : ' · All dates'}
              </p>
            </div>
            <span className="student-record-count">{records.length} {records.length === 1 ? 'record' : 'records'}</span>
          </div>
          {records.length === 0 ? (
            <p className="student-empty" role="status">No attendance records found for the selected course and date.</p>
          ) : (
            <div className="student-table-scroll">
              <table className="student-history-table">
                <thead>
                  <tr><th scope="col">Date</th><th scope="col">Course</th><th scope="col">Section</th><th scope="col">Status</th></tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr key={record.attendance_id}>
                      <td>{String(record.attendance_date).slice(0, 10)}</td>
                      <td><strong>{record.course_code}</strong><span className="student-course-name">{record.course_name}</span></td>
                      <td>{record.section || '—'}</td>
                      <td><span className={`student-status student-status-${record.status.toLowerCase()}`}>{record.status}</span></td>
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
