/**
 * AdminDashboard.js
 * Placeholder dashboard for administrators after login (SAM-F-014 to SAM-F-016 in later sprints).
 * Uses the shared responsive layout (SAM-NF-005).
 */

import React from 'react';
import DashboardLayout from '../common/DashboardLayout';

function AdminDashboard() {
  return (
    <DashboardLayout title="Admin Dashboard">
      <div className="card-grid">
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Coming next sprint</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            User management, class management, and audit features will be available in the next sprint.
          </p>
        </section>
      </div>
    </DashboardLayout>
  );
}

export default AdminDashboard;
