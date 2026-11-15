/**
 * DashboardSummary.js
 * SAM-F-017 — Attendance summaries on the dashboard (TC-DASH-01).
 *
 * Renders role-specific summary widgets:
 *   admin   → system-wide stats + recent audit events
 *   faculty → today's session progress + recent sessions
 *   student → overall attendance snapshot
 */

import React, { useCallback, useEffect, useState } from 'react';
import { getDashboardSummary } from '../../services/dashboardService';
import './DashboardSummary.css';

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`ds-stat-card ${accent ? `ds-stat-card--${accent}` : ''}`}>
      <p className="ds-stat-value">{value ?? '—'}</p>
      <p className="ds-stat-label">{label}</p>
      {sub && <p className="ds-stat-sub">{sub}</p>}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ value, max, label }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const low = pct < 75;
  return (
    <div className="ds-progress-wrap" aria-label={label}>
      <div className="ds-progress-track">
        <div
          className={`ds-progress-fill ${low ? 'ds-progress-fill--low' : ''}`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <span className="ds-progress-label">{label}</span>
    </div>
  );
}

// ── Admin summary ─────────────────────────────────────────────────────────────
function AdminSummary({ summary }) {
  const rate = summary.overallAttendanceRate;
  return (
    <div className="ds-section">
      <h2 className="ds-section-title">System overview</h2>
      <div className="ds-stat-grid">
        <StatCard label="Students"       value={summary.totalStudents}        />
        <StatCard label="Faculty"        value={summary.totalFaculty}         />
        <StatCard label="Courses"        value={summary.totalCourses}         />
        <StatCard label="Classes"        value={summary.totalClasses}         />
        <StatCard
          label="Overall attendance"
          value={rate !== null ? `${rate}%` : '—'}
          accent={rate !== null && rate < 75 ? 'low' : 'ok'}
        />
        <StatCard
          label="Students below threshold"
          value={summary.belowThresholdCount}
          accent={summary.belowThresholdCount > 0 ? 'low' : 'ok'}
        />
        <StatCard label="Total records"  value={summary.totalAttendanceRecords} />
      </div>

      {summary.recentAuditEvents && summary.recentAuditEvents.length > 0 && (
        <div className="ds-recent" aria-labelledby="ds-audit-title">
          <h3 id="ds-audit-title" className="ds-recent-title">Recent activity</h3>
          <ul className="ds-audit-list">
            {summary.recentAuditEvents.map((e, i) => (
              <li key={i} className="ds-audit-item">
                <span className="ds-audit-action">{e.action}</span>
                <span className="ds-audit-actor">{e.actor || 'System'}</span>
                <span className="ds-audit-target">{e.target}</span>
                <span className="ds-audit-time">
                  {new Date(e.createdAt).toLocaleString(undefined, { timeZone: 'UTC' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Faculty summary ───────────────────────────────────────────────────────────
function FacultySummary({ summary }) {
  return (
    <div className="ds-section">
      <h2 className="ds-section-title">
        Today's attendance — <span className="ds-today-date">{summary.todayDate}</span>
      </h2>
      <div className="ds-stat-grid">
        <StatCard label="Assigned classes"     value={summary.assignedClassCount}    />
        <StatCard
          label="Marked today"
          value={summary.markedTodayCount}
          sub={`${summary.pendingTodayCount} pending`}
          accent={summary.pendingTodayCount > 0 ? 'warn' : 'ok'}
        />
        <StatCard label="Students enrolled"   value={summary.totalStudentsAssigned}  />
        <StatCard label="Students marked today" value={summary.markedStudentsToday}  />
      </div>

      {/* Session progress bar */}
      {summary.assignedClassCount > 0 && (
        <ProgressBar
          value={summary.markedTodayCount}
          max={summary.assignedClassCount}
          label={`${summary.markedTodayCount} of ${summary.assignedClassCount} classes marked today`}
        />
      )}

      {/* Recent sessions */}
      {summary.recentSessions && summary.recentSessions.length > 0 && (
        <div className="ds-recent" aria-labelledby="ds-sessions-title">
          <h3 id="ds-sessions-title" className="ds-recent-title">Recent sessions</h3>
          <div className="ds-sessions-grid">
            {summary.recentSessions.map((s, i) => (
              <div key={i} className="ds-session-card">
                <div className="ds-session-header">
                  <strong>{s.courseCode}</strong>
                  {s.section && <span className="ds-session-section">§{s.section}</span>}
                  <span className="ds-session-date">{s.sessionDate}</span>
                </div>
                <div className="ds-session-stats">
                  <span className="ds-badge ds-badge--present">✓ {s.presentCount}</span>
                  <span className="ds-badge ds-badge--late">◷ {s.lateCount}</span>
                  <span className="ds-badge ds-badge--absent">✗ {s.absentCount}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Student summary ───────────────────────────────────────────────────────────
function StudentSummary({ summary }) {
  const pct = summary.overallPercentage;
  return (
    <div className="ds-section">
      <h2 className="ds-section-title">Your attendance at a glance</h2>
      <div className="ds-stat-grid">
        <StatCard label="Courses tracked"     value={summary.enrolledCourseCount} />
        <StatCard label="Classes held"        value={summary.totalClassesHeld}    />
        <StatCard label="Classes attended"    value={summary.totalAttended}       />
        <StatCard
          label="Overall attendance"
          value={pct !== null ? `${pct}%` : '—'}
          accent={pct !== null && pct < 75 ? 'low' : 'ok'}
        />
        <StatCard
          label="Courses above 75%"
          value={summary.coursesAboveThreshold}
          accent="ok"
        />
        <StatCard
          label="Courses below 75%"
          value={summary.coursesBelowThreshold}
          accent={summary.coursesBelowThreshold > 0 ? 'low' : 'ok'}
        />
      </div>

      {pct !== null && (
        <ProgressBar
          value={summary.totalAttended}
          max={summary.totalClassesHeld}
          label={`Overall: ${pct}% (${summary.totalAttended}/${summary.totalClassesHeld} classes)`}
        />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DashboardSummary() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getDashboardSummary();
      setData(result);
    } catch (err) {
      setError(err.message || 'Unable to load dashboard summary.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="ds-loading" role="status">Loading attendance summary…</div>;
  }
  if (error) {
    return (
      <div className="ds-error" role="alert">
        <p>{error}</p>
        <button className="ds-retry-btn" type="button" onClick={load}>Try again</button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="ds-container" aria-label="Attendance summary">
      {data.role === 'admin'   && <AdminSummary   summary={data.summary} />}
      {data.role === 'faculty' && <FacultySummary summary={data.summary} />}
      {data.role === 'student' && <StudentSummary summary={data.summary} />}
    </div>
  );
}
