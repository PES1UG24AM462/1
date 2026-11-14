/**
 * AdminDashboard.js
 * Administrator dashboard and protected audit-history view (SAM-F-016).
 */

import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getToken } from '../../services/authService';

const AUDIT_PAGE_SIZE = 25;

function AuditHistory() {
  const [events, setEvents] = useState([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/admin/audit-logs', {
        params: { limit: AUDIT_PAGE_SIZE, offset },
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setEvents(response.data.events);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to load audit history.');
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  return (
    <section aria-labelledby="audit-heading" style={{ marginTop: '2rem' }}>
      <h2 id="audit-heading">Audit history</h2>
      {loading && <p role="status">Loading audit history…</p>}
      {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
      {!loading && !error && events.length === 0 && <p>No audit events found.</p>}
      {!loading && !error && events.length > 0 && (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead><tr>{['Time (UTC)', 'Actor', 'Action', 'Affected record', 'Details'].map((label) => (
                <th key={label} scope="col" style={{ padding: '0.6rem', borderBottom: '1px solid #cbd5e0' }}>{label}</th>
              ))}</tr></thead>
              <tbody>{events.map((event) => {
                let details = event.details;
                try { details = details ? JSON.stringify(JSON.parse(details)) : '—'; } catch (_) { /* Legacy text detail. */ }
                return (
                  <tr key={event.auditId}>
                    <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{new Date(event.createdAt).toLocaleString(undefined, { timeZone: 'UTC' })}</td>
                    <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0' }}>{event.actor || 'System'}</td>
                    <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0' }}>{event.action}</td>
                    <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0' }}>{event.target}</td>
                    <td style={{ padding: '0.6rem', borderBottom: '1px solid #e2e8f0', overflowWrap: 'anywhere' }}>{details}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <nav aria-label="Audit history pages" style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="button" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - AUDIT_PAGE_SIZE))}>Newer events</button>
            <button type="button" disabled={events.length < AUDIT_PAGE_SIZE || loading} onClick={() => setOffset(offset + AUDIT_PAGE_SIZE)}>Older events</button>
          </nav>
        </>
      )}
    </section>
  );
}

function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Admin Dashboard</h1>
      <p>Logged in as: <strong>{user?.fullName || 'Administrator'}</strong></p>
      <p>Role: <strong>{user?.role}</strong></p>
      <p><Link to="/reports/attendance">Generate attendance report</Link></p>
      <AuditHistory />
      <button
        onClick={handleLogout}
        style={{
          marginTop: '1.5rem',
          padding: '0.6rem 1.2rem',
          background: '#e53e3e',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Sign Out
      </button>
    </main>
  );
}

export default AdminDashboard;
