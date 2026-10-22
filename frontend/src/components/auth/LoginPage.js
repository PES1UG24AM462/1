/**
 * LoginPage.js
 * Sign-in screen for the Student Attendance Management System.
 *
 * Implements SAM-F-001 — Authenticate users with username and password.
 * Acceptance Criterion (AC-SAM-F-001): Valid credentials create an authenticated session.
 *
 * After successful login the user is redirected to the role-appropriate dashboard:
 *   - admin   → /admin/dashboard
 *   - faculty → /faculty/dashboard
 *   - student → /student/dashboard
 *
 * SAM-NF-005: Responsive layout — works on desktop and mobile viewports.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './LoginPage.css';

function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * handleSubmit
   * Calls the authentication service and redirects on success.
   * Displays a generic error message on failure — avoids leaking
   * whether the username exists (mitigates enumeration attacks).
   */
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await login(username.trim(), password);

      // Redirect based on role (SAM-F-002)
      const roleRoutes = {
        admin: '/admin/dashboard',
        faculty: '/faculty/dashboard',
        student: '/student/dashboard',
      };
      navigate(roleRoutes[data.role] || '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message || 'Invalid username or password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page" role="main">
      <div className="login-card" aria-labelledby="login-heading">
        {/* Branding */}
        <div className="login-brand">
          <h1 id="login-heading" className="login-title">SAMS</h1>
          <p className="login-subtitle">Student Attendance Management System</p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="login-error" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        {/* Sign-in form — SAM-F-001 */}
        <form
          className="login-form"
          onSubmit={handleSubmit}
          noValidate
          aria-label="Sign in form"
        >
          <div className="form-group">
            <label htmlFor="username" className="form-label">
              Username
            </label>
            <input
              id="username"
              type="text"
              className="form-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              required
              disabled={loading}
              aria-required="true"
              aria-describedby={error ? 'login-error-msg' : undefined}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              disabled={loading}
              aria-required="true"
            />
          </div>

          <button
            type="submit"
            className={`login-btn ${loading ? 'login-btn--loading' : ''}`}
            disabled={loading || !username || !password}
            aria-busy={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="login-footer">
          Contact your administrator if you have trouble signing in.
        </p>
      </div>
    </div>
  );
}

export default LoginPage;
