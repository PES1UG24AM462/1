/**
 * DashboardLayout.js
 * Shared responsive shell for the student / faculty / admin dashboards (SAM-NF-005).
 * Renders a header with the page title, the signed-in user, and a Sign Out button,
 * then the page content. Layout rules live in styles/global.css.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

function DashboardLayout({ title, children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>{title}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {user?.fullName} · <strong>{user?.role}</strong>
          </p>
        </div>
        <button className="btn btn-danger" onClick={handleLogout}>Sign Out</button>
      </header>
      <main className="page-main">{children}</main>
    </div>
  );
}

export default DashboardLayout;
