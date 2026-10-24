import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as facultyService from '../../services/facultyService';
import { isValidAttendanceDate } from '../../utils/attendanceDate';
import './FacultyDashboard.css';

function classLabel(item) {
  const section = item.section ? ` · Section ${item.section}` : '';
  const year = item.academic_yr ? ` · ${item.academic_yr}` : '';
  return `${item.course_code} — ${item.course_name}${section}${year}`;
}

function FacultyDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError, setClassesError] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [attendanceDate, setAttendanceDate] = useState('');
  const [roster, setRoster] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const [formError, setFormError] = useState('');
  const rosterRequestId = useRef(0);

  const loadClasses = useCallback(async () => {
    setClassesLoading(true);
    setClassesError('');
    try {
      const result = await facultyService.getAssignedClasses();
      setClasses(result.classes);
    } catch (err) {
      setClasses([]);
      setClassesError(err.message || 'Unable to load assigned classes. Please try again.');
    } finally {
      setClassesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  function clearRoster() {
    rosterRequestId.current += 1;
    setRoster(null);
    setRosterLoading(false);
    setRosterError('');
    setFormError('');
  }

  function handleClassChange(event) {
    setSelectedClassId(event.target.value);
    clearRoster();
  }

  function handleDateChange(event) {
    setAttendanceDate(event.target.value);
    clearRoster();
  }

  async function handleSubmit(event) {
    event?.preventDefault();
    clearRoster();

    if (!selectedClassId) {
      setFormError('Select an assigned class to continue.');
      return;
    }
    if (!attendanceDate) {
      setFormError('Select an attendance date to continue.');
      return;
    }
    if (!isValidAttendanceDate(attendanceDate)) {
      setFormError('Enter a valid attendance date.');
      return;
    }

    setRosterLoading(true);
    const requestId = ++rosterRequestId.current;
    try {
      const result = await facultyService.getClassRoster(selectedClassId, attendanceDate);
      if (rosterRequestId.current === requestId) setRoster(result);
    } catch (err) {
      if (rosterRequestId.current === requestId) {
        setRosterError(err.message || 'Unable to load this class roster. Please try again.');
      }
    } finally {
      if (rosterRequestId.current === requestId) setRosterLoading(false);
    }
  }

  return (
    <main className="faculty-page">
      <header className="faculty-header">
        <div>
          <p className="faculty-eyebrow">Student Attendance Management System</p>
          <h1>Welcome, {user?.fullName || 'Faculty'}</h1>
          <p className="faculty-subtitle">Choose an assigned class and attendance date to view its enrolled students.</p>
        </div>
        <button className="faculty-signout" type="button" onClick={handleLogout}>Sign out</button>
      </header>

      <section className="faculty-card" aria-labelledby="selection-title">
        <h2 id="selection-title">Select class and date</h2>

        {classesLoading ? (
          <p role="status">Loading your assigned classes…</p>
        ) : classesError ? (
          <div className="faculty-message faculty-message-error" role="alert">
            <p>{classesError}</p>
            <button type="button" className="faculty-secondary-button" onClick={loadClasses}>Try again</button>
          </div>
        ) : classes.length === 0 ? (
          <p className="faculty-empty" role="status">No classes are currently assigned to your account.</p>
        ) : (
          <form className="faculty-selection-form" onSubmit={handleSubmit} noValidate>
            <div className="faculty-fields">
              <label className="faculty-field" htmlFor="assigned-class">
                <span>Assigned class</span>
                <select id="assigned-class" value={selectedClassId} onChange={handleClassChange} required>
                  <option value="">Choose a class</option>
                  {classes.map((item) => (
                    <option key={item.class_id} value={String(item.class_id)}>{classLabel(item)}</option>
                  ))}
                </select>
              </label>

              <label className="faculty-field" htmlFor="attendance-date">
                <span>Attendance date</span>
                <input
                  id="attendance-date"
                  type="date"
                  value={attendanceDate}
                  onChange={handleDateChange}
                  required
                />
              </label>
            </div>

            {formError && <p className="faculty-message faculty-message-error" role="alert">{formError}</p>}

            <button
              className="faculty-primary-button"
              type="submit"
              disabled={rosterLoading}
            >
              {rosterLoading ? 'Loading roster…' : 'View enrolled students'}
            </button>
          </form>
        )}
      </section>

      {rosterLoading && <p className="faculty-inline-status" role="status">Loading the enrolled student roster…</p>}
      {rosterError && (
        <div className="faculty-message faculty-message-error" role="alert">
          <p>{rosterError}</p>
          <button type="button" className="faculty-secondary-button" onClick={() => handleSubmit()}>
            Try again
          </button>
        </div>
      )}

      {roster && (
        <section className="faculty-card faculty-roster" aria-labelledby="roster-title">
          <div className="faculty-roster-heading">
            <div>
              <h2 id="roster-title">Enrolled students</h2>
              <p>{roster.class.courseCode} — {roster.class.courseName}{roster.class.section ? ` · Section ${roster.class.section}` : ''}</p>
            </div>
            <p className="faculty-date-chip">{roster.date}</p>
          </div>

          {roster.students.length === 0 ? (
            <p className="faculty-empty" role="status">There are no students enrolled in this class.</p>
          ) : (
            <div className="faculty-table-scroll">
              <table className="faculty-student-table">
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    <th scope="col">USN</th>
                    <th scope="col">Department</th>
                    <th scope="col">Semester</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.students.map((student) => (
                    <tr key={student.studentId}>
                      <td>{student.fullName || 'Name unavailable'}</td>
                      <td>{student.usn}</td>
                      <td>{student.department || '—'}</td>
                      <td>{student.semester ?? '—'}</td>
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

export default FacultyDashboard;
