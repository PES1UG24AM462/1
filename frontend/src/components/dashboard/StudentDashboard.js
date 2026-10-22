/**
 * StudentDashboard.js
 * Placeholder dashboard for students after login.
 * Full functionality covered in later sprints (SAM-F-008, SAM-F-009).
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function StudentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Welcome, {user?.fullName || 'Student'}</h1>
      <p>Role: <strong>{user?.role}</strong></p>
      <p style={{ color: '#718096', marginTop: '0.5rem' }}>
        Your attendance features will be available in the next sprint.
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

export default StudentDashboard;
