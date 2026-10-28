/**
 * FacultyDashboard.js
 *
 * SAM-F-003 — Faculty selects an assigned class and attendance date.
 * SAM-F-004 — System displays the enrolled student roster.
 * SAM-F-005 — Faculty marks each student Present, Absent, or Late and saves.
 * SAM-F-007 — Existing records are prefilled and corrections are submitted with their IDs.
 *
 * TC-ATT-02: After roster loads, faculty can set a status per student and submit.
 * Statuses: Present | Absent | Late  (exactly as per SRS)
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as facultyService from '../../services/facultyService';
import { isValidAttendanceDate } from '../../utils/attendanceDate';
import './FacultyDashboard.css';

const STATUSES = ['Present', 'Absent', 'Late'];

function classLabel(item) {
  const section = item.section ? ` · Section ${item.section}` : '';
  const year = item.academic_yr ? ` · ${item.academic_yr}` : '';
  return `${item.course_code} — ${item.course_name}${section}${year}`;
}

function FacultyDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // ── Class selection state (SAM-F-003) ────────────────────────────────────
  const [classes, setClasses] = useState([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError, setClassesError] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [attendanceDate, setAttendanceDate] = useState('');
  const [formError, setFormError] = useState('');

  // ── Roster state (SAM-F-004) ─────────────────────────────────────────────
  const [roster, setRoster] = useState(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterError, setRosterError] = useState('');
  const rosterRequestId = useRef(0);

  // ── Attendance marking state (SAM-F-005) ─────────────────────────────────
  // marks: { [studentId]: 'Present' | 'Absent' | 'Late' }
  const [marks, setMarks] = useState({});
  const [existingAttendance, setExistingAttendance] = useState({});
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // ── Load assigned classes on mount ───────────────────────────────────────
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

  useEffect(() => { loadClasses(); }, [loadClasses]);

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
    setMarks({});
    setExistingAttendance({});
    setSubmitError('');
    setSubmitSuccess('');
  }

  function handleClassChange(e) {
    setSelectedClassId(e.target.value);
    clearRoster();
  }

  function handleDateChange(e) {
    setAttendanceDate(e.target.value);
    clearRoster();
  }

  // ── Load roster + pre-fill existing attendance ───────────────────────────
  async function handleSubmitRoster(e) {
    e?.preventDefault();
    clearRoster();

    if (!selectedClassId) { setFormError('Select an assigned class to continue.'); return; }
    if (!attendanceDate)  { setFormError('Select an attendance date to continue.'); return; }
    if (!isValidAttendanceDate(attendanceDate)) { setFormError('Enter a valid attendance date.'); return; }

    setRosterLoading(true);
    const requestId = ++rosterRequestId.current;

    try {
      // Load roster and existing attendance in parallel
      const [rosterResult, existingResult] = await Promise.allSettled([
        facultyService.getClassRoster(selectedClassId, attendanceDate),
        facultyService.getSessionAttendance(selectedClassId, attendanceDate),
      ]);

      if (rosterRequestId.current !== requestId) return;

      if (rosterResult.status === 'rejected') {
        setRosterError(rosterResult.reason?.message || 'Unable to load this class roster. Please try again.');
        return;
      }

      const rosterData = rosterResult.value;
      setRoster(rosterData);

      // Pre-fill marks from existing records; default new students to 'Present'
      const prefill = {};
      const existingMap = {};
      if (existingResult.status === 'fulfilled') {
        (existingResult.value.attendance || []).forEach(({ attendanceId, studentId, status }) => {
          existingMap[studentId] = { attendanceId, status };
        });
      }
      rosterData.students.forEach((s) => {
        prefill[s.studentId] = existingMap[s.studentId]?.status || 'Present';
      });
      setMarks(prefill);
      setExistingAttendance(existingMap);
    } catch (err) {
      if (rosterRequestId.current === requestId) {
        setRosterError(err.message || 'Unable to load this class roster. Please try again.');
      }
    } finally {
      if (rosterRequestId.current === requestId) setRosterLoading(false);
    }
  }

  // ── Handle per-student status change (SAM-F-005) ─────────────────────────
  function handleMarkChange(studentId, status) {
    setMarks((prev) => ({ ...prev, [studentId]: status }));
    setSubmitError('');
    setSubmitSuccess('');
  }

  // ── Quick-mark all students ───────────────────────────────────────────────
  function markAll(status) {
    const updated = {};
    roster.students.forEach((s) => { updated[s.studentId] = status; });
    setMarks(updated);
    setSubmitError('');
    setSubmitSuccess('');
  }

  // ── Submit attendance (SAM-F-005) ─────────────────────────────────────────
  async function handleSaveAttendance(e) {
    e.preventDefault();
    setSubmitError('');
    setSubmitSuccess('');

    if (!roster || roster.students.length === 0) return;

    // Build records array
    const records = roster.students.map((s) => ({
      ...(existingAttendance[s.studentId]?.attendanceId && {
        attendanceId: existingAttendance[s.studentId].attendanceId,
      }),
      studentId: s.studentId,
      status: marks[s.studentId] || 'Absent',
    }));

    setSubmitLoading(true);
    try {
      const result = await facultyService.submitAttendance(
        roster.class.classId,
        roster.date,
        records
      );
      setSubmitSuccess(result.correctionCount
        ? `Attendance saved — ${result.correctionCount} correction(s) recorded with audit timestamps.`
        : `Attendance saved — ${result.savedCount} student(s) recorded.`);
    } catch (err) {
      setSubmitError(err.message || 'Unable to save attendance. Please try again.');
    } finally {
      setSubmitLoading(false);
    }
  }

  // ── Count summary ─────────────────────────────────────────────────────────
  function getSummary() {
    const counts = { Present: 0, Absent: 0, Late: 0 };
    Object.values(marks).forEach((s) => { if (counts[s] !== undefined) counts[s]++; });
    return counts;
  }

  const summary = roster ? getSummary() : null;

  return (
    <main className="faculty-page">
      {/* Header */}
      <header className="faculty-header">
        <div>
          <p className="faculty-eyebrow">Student Attendance Management System</p>
          <h1>Welcome, {user?.fullName || 'Faculty'}</h1>
          <p className="faculty-subtitle">Select a class and date to mark attendance.</p>
        </div>
        <button className="faculty-signout" type="button" onClick={handleLogout}>Sign out</button>
      </header>

      {/* Class + Date selection (SAM-F-003) */}
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
          <form className="faculty-selection-form" onSubmit={handleSubmitRoster} noValidate>
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
            <button className="faculty-primary-button" type="submit" disabled={rosterLoading}>
              {rosterLoading ? 'Loading roster…' : 'Load roster'}
            </button>
          </form>
        )}
      </section>

      {/* Loading / error states */}
      {rosterLoading && <p className="faculty-inline-status" role="status">Loading the enrolled student roster…</p>}
      {rosterError && (
        <div className="faculty-message faculty-message-error" role="alert">
          <p>{rosterError}</p>
          <button type="button" className="faculty-secondary-button" onClick={() => handleSubmitRoster()}>Try again</button>
        </div>
      )}

      {/* Attendance marking table (SAM-F-004 + SAM-F-005) */}
      {roster && (
        <section className="faculty-card faculty-roster" aria-labelledby="roster-title">
          <div className="faculty-roster-heading">
            <div>
              <h2 id="roster-title">
                {Object.keys(existingAttendance).length ? 'Review or correct attendance' : 'Mark attendance'}
              </h2>
              <p>
                {roster.class.courseCode} — {roster.class.courseName}
                {roster.class.section ? ` · Section ${roster.class.section}` : ''}
              </p>
            </div>
            <p className="faculty-date-chip">{roster.date}</p>
          </div>

          {roster.students.length === 0 ? (
            <p className="faculty-empty" role="status">There are no students enrolled in this class.</p>
          ) : (
            <form onSubmit={handleSaveAttendance} noValidate>

              {Object.keys(existingAttendance).length > 0 && (
                <p className="faculty-inline-status" role="status">
                  Existing attendance is loaded. Changed statuses are recorded with an audit timestamp.
                </p>
              )}

              {/* Quick-mark buttons */}
              <div className="att-quick-mark" role="group" aria-label="Mark all students">
                <span className="att-quick-label">Mark all:</span>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`att-quick-btn att-quick-btn--${s.toLowerCase()}`}
                    onClick={() => markAll(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Summary chips */}
              {summary && (
                <div className="att-summary" aria-live="polite">
                  <span className="att-chip att-chip--present">Present: {summary.Present}</span>
                  <span className="att-chip att-chip--absent">Absent: {summary.Absent}</span>
                  <span className="att-chip att-chip--late">Late: {summary.Late}</span>
                </div>
              )}

              {/* Student table */}
              <div className="faculty-table-scroll">
                <table className="faculty-student-table">
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Student</th>
                      <th scope="col">USN</th>
                      <th scope="col">Department</th>
                      <th scope="col">Sem</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.students.map((student, idx) => {
                      const current = marks[student.studentId] || 'Present';
                      return (
                        <tr key={student.studentId} className={`att-row att-row--${current.toLowerCase()}`}>
                          <td>{idx + 1}</td>
                          <td>{student.fullName || 'Name unavailable'}</td>
                          <td>{student.usn}</td>
                          <td>{student.department || '—'}</td>
                          <td>{student.semester ?? '—'}</td>
                          <td>
                            <div className="att-status-group" role="group" aria-label={`Status for ${student.fullName}`}>
                              {STATUSES.map((s) => (
                                <label
                                  key={s}
                                  className={`att-status-btn att-status-btn--${s.toLowerCase()} ${current === s ? 'att-status-btn--active' : ''}`}
                                >
                                  <input
                                    type="radio"
                                    name={`status-${student.studentId}`}
                                    value={s}
                                    checked={current === s}
                                    onChange={() => handleMarkChange(student.studentId, s)}
                                    className="att-radio-hidden"
                                  />
                                  {s}
                                </label>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Submit feedback */}
              {submitError && (
                <div className="faculty-message faculty-message-error" role="alert">{submitError}</div>
              )}
              {submitSuccess && (
                <div className="faculty-message faculty-message-success" role="status">{submitSuccess}</div>
              )}

              {/* Save button */}
              <div className="att-submit-row">
                <button
                  type="submit"
                  className="faculty-primary-button"
                  disabled={submitLoading}
                  aria-busy={submitLoading}
                >
                  {submitLoading ? 'Saving…' : `Save attendance (${roster.students.length} students)`}
                </button>
              </div>

            </form>
          )}
        </section>
      )}
    </main>
  );
}

export default FacultyDashboard;
