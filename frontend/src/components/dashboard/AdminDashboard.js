/**
 * AdminDashboard.js
 * Placeholder dashboard for administrators after login.
 * Full admin functionality (SAM-F-014, SAM-F-015, SAM-F-016) covered in later sprints.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

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
      <p style={{ color: '#718096', marginTop: '0.5rem' }}>
        User management, class management, and audit features will be available in the next sprint.
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

export default AdminDashboard;
