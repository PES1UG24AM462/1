/**
 * App.js
 * Root component — sets up routing and the AuthProvider context.
 *
 * Routes:
 *   /login                  → LoginPage (SAM-F-001)
 *   /student/dashboard      → StudentDashboard
 *   /faculty/dashboard      → FacultyDashboard
 *   /admin/dashboard        → AdminDashboard
 *   /                       → redirect to /login
 *   *                       → redirect to /login
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/auth/LoginPage';
import StudentDashboard from './components/dashboard/StudentDashboard';
import FacultyDashboard from './components/dashboard/FacultyDashboard';
import AdminDashboard from './components/dashboard/AdminDashboard';

/**
 * ProtectedRoute
 * Redirects unauthenticated users to /login.
 * Optionally restricts access to specific roles (SAM-F-002).
 */
function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Authenticated but wrong role → send back to their own dashboard
    const roleRoutes = {
      admin: '/admin/dashboard',
      faculty: '/faculty/dashboard',
      student: '/student/dashboard',
    };
    return <Navigate to={roleRoutes[user.role] || '/login'} replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/student/dashboard"
        element={
          <ProtectedRoute allowedRoles={['student']}>
            <StudentDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/faculty/dashboard"
        element={
          <ProtectedRoute allowedRoles={['faculty']}>
            <FacultyDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      {/* Default redirect */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
