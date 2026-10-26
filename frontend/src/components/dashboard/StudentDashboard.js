/**
 * StudentDashboard.js
 * Placeholder dashboard for students after login (SAM-F-008, SAM-F-009 in later sprints).
 * Uses the shared responsive layout (SAM-NF-005).
 */

import React from 'react';
import DashboardLayout from '../common/DashboardLayout';

function StudentDashboard() {
  return (
    <DashboardLayout title="Student Dashboard">
      <div className="card-grid">
        <section className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Coming next sprint</h2>
          <p className="muted" style={{ marginBottom: 0 }}>
            Your attendance features will be available in the next sprint.
          </p>
        </section>
      </div>
    </DashboardLayout>
  );
}

export default StudentDashboard;
