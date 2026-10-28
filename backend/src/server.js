/**
 * server.js
 * Express application entry point for the Student Attendance Management System (SAMS).
 *
 * Architecture: Layered (Web UI → REST API → Business Services → Database)
 * Stack: Node.js / Express + MySQL + JWT   (per SAD v1.0)
 *
 * Security headers applied via Helmet (SAM-NF-003 / SAM-SR-001).
 * CORS restricted to configured origins.
 */

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { testConnection } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const roleRoutes = require('./routes/roleRoutes');
const { authenticate } = require('./middleware/authMiddleware');
const facultyRoutes = require('./routes/facultyRoutes');
const studentRoutes = require('./routes/studentRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;

// ─── Security middleware ────────────────────────────────────────────────────
// Helmet sets secure HTTP headers (X-Content-Type-Options, HSTS, etc.)
// This supports SAM-NF-003 / SAM-SR-001 (HTTPS/TLS enforcement at proxy level)
app.use(helmet());

// CORS — restrict to the React dev server and production origin
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., Postman, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS policy'));
      }
    },
    credentials: true,
  })
);

// ─── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' })); // 10 KB limit to prevent large-payload DoS
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// ─── Routes ─────────────────────────────────────────────────────────────────
// PUBLIC routes — the only endpoints reachable without a token (SAM-SR-003).
// SAM-F-001: POST /api/auth/login
app.use('/api/auth', authRoutes);

// SAM-F-002: role-gated endpoints (admin / faculty / student)
// Health-check endpoint (CI and monitoring)
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'SAMS API', timestamp: new Date().toISOString() });
});

// SAM-SR-003: everything mounted below this line requires a valid token, enforced
// server-side. New routers are protected by default; add role checks with authorise().
app.use('/api', authenticate);

// GET /api/me — current user's profile (also lets the UI confirm its session is valid)
app.get('/api/me', (req, res) => {
  const { userId, username, role, fullName } = req.user;
  res.status(200).json({ userId, username, role, fullName });
});

// SAM-F-002: role-gated endpoints (admin / faculty / student)
app.use('/api', roleRoutes);

// SAM-F-003 / SAM-F-004: faculty class selection and enrolled roster
app.use('/api/faculty', facultyRoutes);

// SAM-F-008: student-only attendance history
app.use('/api/student', studentRoutes);

// SAM-F-005: mark attendance — POST /api/attendance
app.use('/api/attendance', attendanceRoutes);

// 404 handler for unknown routes
app.use((_req, res) => {
  res.status(404).json({ message: 'Resource not found.' });
});

// Global error handler — do not leak stack traces in production
app.use((err, _req, res, _next) => {
  const isDev = process.env.NODE_ENV === 'development';
  console.error('[Server] Unhandled error:', err.message);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error.',
    ...(isDev && { stack: err.stack }),
  });
});

// ─── Start ───────────────────────────────────────────────────────────────────
async function start() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`[Server] SAMS API running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
}

// Export app for supertest in integration tests
module.exports = app;

// Only start the server if this file is run directly (not imported by tests)
if (require.main === module) {
  start();
}
