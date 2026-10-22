/**
 * FacultyDashboard.js
 * Placeholder dashboard for faculty after login.
 * Full attendance marking (SAM-F-003 to SAM-F-007) is covered in later sprints.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function FacultyDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Welcome, {user?.fullName || 'Faculty'}</h1>
      <p>Role: <strong>{user?.role}</strong></p>
      <p style={{ color: '#718096', marginTop: '0.5rem' }}>
        Attendance marking and reporting features will be available in the next sprint.
      </p>
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

export default FacultyDashboard;
