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

const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const fs = require('fs');
const https = require('https');
const compression = require('compression');
const responseTime = require('./middleware/responseTime');
const requestId = require('./middleware/requestId');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const { testConnection, checkDatabaseConnectivity, closeDatabase } = require('./config/database');
const authRoutes = require('./routes/authRoutes');
const roleRoutes = require('./routes/roleRoutes');
const userRoutes = require('./routes/userRoutes');
const { authenticate } = require('./middleware/authMiddleware');
const facultyRoutes = require('./routes/facultyRoutes');
const studentRoutes = require('./routes/studentRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const reportRoutes = require('./routes/reportRoutes');
const auditRoutes = require('./routes/auditRoutes');
const academicRoutes = require('./routes/academicRoutes');
const dbHealthRoutes = require('./routes/dbHealthRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;
const isProduction = process.env.NODE_ENV === 'production';
const trustedProxyIps = (process.env.TRUSTED_PROXY_IPS || '')
  .split(',')
  .map((ip) => ip.trim())
  .filter(Boolean);

// Forwarded protocol headers are trusted only from explicitly configured proxy IPs.
if (trustedProxyIps.length) app.set('trust proxy', trustedProxyIps);

function positiveIntegerEnv(name, fallback, maximum) {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}
const DB_STARTUP_ATTEMPTS = positiveIntegerEnv('DB_STARTUP_ATTEMPTS', 3, 5);
const DB_STARTUP_RETRY_DELAY_MS = positiveIntegerEnv('DB_STARTUP_RETRY_DELAY_MS', 250, 30000);
const SHUTDOWN_TIMEOUT_MS = positiveIntegerEnv('SHUTDOWN_TIMEOUT_MS', 10000, 120000);
let server;
let shuttingDown = false;
let shutdownPromise;

// ─── Security middleware ────────────────────────────────────────────────────
// Helmet sets secure HTTP headers (X-Content-Type-Options, HSTS, etc.)
// This supports SAM-NF-003 / SAM-SR-001 (HTTPS/TLS enforcement at proxy level)
app.use(helmet({ hsts: false }));

// SAM-NF-001: measure every request and gzip responses to keep payloads small
app.use(requestId);
app.use(responseTime);
app.use(compression());

// Do not redirect API requests: redirects can replay or expose sensitive POST bodies.
// Reject before body parsing so credentials and other payloads are never processed.
app.use((req, res, next) => {
  if (isProduction && !req.secure) {
    return res.status(426).json({ message: 'HTTPS is required.' });
  }
  if (isProduction && req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  }
  return next();
});

// CORS — restrict to the React dev server and production origin
const allowedOrigins = (process.env.ALLOWED_ORIGINS || (isProduction ? '' : 'http://localhost:3000'))
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
if (isProduction && (!allowedOrigins.length || allowedOrigins.some((origin) => !origin.startsWith('https://')))) {
  throw new Error('Production ALLOWED_ORIGINS must contain only HTTPS origins.');
}
if (isProduction && allowedOrigins.some((origin) => {
  try {
    const parsed = new URL(origin);
    return parsed.protocol !== 'https:' || parsed.origin !== origin;
  } catch (_err) {
    return true;
  }
})) {
  throw new Error('Each production ALLOWED_ORIGINS entry must be a valid HTTPS origin without a path.');
}
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., Postman, server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        const err = new Error('Not allowed by CORS policy');
        err.status = 403;
        err.publicMessage = 'Origin not allowed.';
        callback(err);
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

// Dependency readiness is separate from the process-only liveness endpoint.
// Do not disclose hostnames, database names, credentials, or driver errors here.
app.get('/api/ready', async (req, res) => {
  if (shuttingDown) {
    return res.status(503).json({ status: 'not_ready', requestId: req.requestId });
  }

  try {
    await checkDatabaseConnectivity();
    return res.status(200).json({ status: 'ready', checkedAt: new Date().toISOString() });
  } catch (_err) {
    logger.warn('http.readiness_failed', { requestId: req.requestId });
    return res.status(503).json({ status: 'not_ready', requestId: req.requestId });
  }
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

// SAM-F-014: admin account management
app.use('/api/admin/users', userRoutes);
app.use('/api/admin/audit-logs', auditRoutes);
// SAM-F-015: administrator course, class, and enrollment management
app.use('/api/admin', academicRoutes);

// SAM-F-003 / SAM-F-004: faculty class selection and enrolled roster
app.use('/api/faculty', facultyRoutes);

// SAM-F-008: student-only attendance history
app.use('/api/student', studentRoutes);

// SAM-F-005: mark attendance — POST /api/attendance
app.use('/api/attendance', attendanceRoutes);

// SAM-F-010: reporting & low attendance threshold alerts (faculty / admin)
app.use('/api/reports', reportRoutes);

// SAM-NF-004: database integrity health check (admin only)
app.use('/api/admin/db', dbHealthRoutes);

// SAM-F-017: dashboard attendance summaries (all roles)
app.use('/api/dashboard', dashboardRoutes);

// 404 handler for unknown routes
app.use((_req, res) => {
  res.status(404).json({ message: 'Resource not found.' });
});

// Global error handler — do not leak stack traces in production
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────
function validateStartupConfiguration(env = process.env) {
  const required = env.NODE_ENV === 'production'
    ? ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'JWT_SECRET']
    : ['JWT_SECRET'];
  const missing = required.filter((name) => !String(env[name] || '').trim());
  if (missing.length > 0) {
    const err = new Error(`Missing required startup configuration: ${missing.join(', ')}`);
    err.code = 'MISSING_CONFIGURATION';
    err.missingConfiguration = missing;
    throw err;
  }
  if (env.JWT_SECRET.length < 32) {
    const err = new Error('JWT_SECRET must contain at least 32 characters.');
    err.code = 'INVALID_JWT_CONFIGURATION';
    throw err;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Retry only the idempotent database connectivity probe, with bounded backoff. */
async function verifyDatabaseWithRetry({
  check = testConnection,
  attempts = DB_STARTUP_ATTEMPTS,
  retryDelayMs = DB_STARTUP_RETRY_DELAY_MS,
  wait = delay,
  random = Math.random,
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await check();
      return;
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      const backoffMs = Math.min(retryDelayMs * (2 ** (attempt - 1)), 30000);
      const jitterMs = Math.floor(Math.max(0, Math.min(1, random())) * backoffMs * 0.2);
      const nextDelayMs = backoffMs + jitterMs;
      logger.warn('database.startup_retry', {
        attempt,
        nextDelayMs,
        errorCode: err.code || 'UNKNOWN',
      });
      await wait(nextDelayMs);
    }
  }
  throw lastError;
}

async function start() {
  const keyPath = process.env.TLS_KEY_PATH;
  const certPath = process.env.TLS_CERT_PATH;
  if (Boolean(keyPath) !== Boolean(certPath)) {
    throw new Error('TLS_KEY_PATH and TLS_CERT_PATH must be configured together.');
  }
  if (isProduction && !keyPath && !trustedProxyIps.length) {
    throw new Error('Production requires direct TLS certificate paths or explicitly trusted TLS proxy IPs.');
  }
  validateStartupConfiguration();
  await verifyDatabaseWithRetry();

  if (keyPath && certPath) {
    server = https.createServer({
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
      minVersion: 'TLSv1.2',
    }, app);
  } else {
    server = http.createServer(app);
  }
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, resolve);
  });
  logger.info('server.started', {
    port: server.address().port,
    environment: process.env.NODE_ENV || 'development',
  });
  return server;
}

function closeHttpServer(serverToClose, timeoutMs) {
  if (!serverToClose || !serverToClose.listening) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    timer = setTimeout(() => {
      logger.warn('server.shutdown_timeout', { timeoutMs });
      if (typeof serverToClose.closeAllConnections === 'function') {
        serverToClose.closeAllConnections();
      }
      finish();
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();
    serverToClose.close(finish);
  });
}

async function shutdown(signal = 'manual', options = {}) {
  if (shutdownPromise) return shutdownPromise;
  shuttingDown = true;
  shutdownPromise = (async () => {
    logger.info('server.shutdown_started', { signal });
    await closeHttpServer(options.server || server, options.timeoutMs || SHUTDOWN_TIMEOUT_MS);
    await (options.closeDatabase || closeDatabase)();
    logger.info('server.shutdown_complete', { signal });
  })();
  return shutdownPromise;
}

// Export app for supertest in integration tests
module.exports = app;
module.exports.start = start;
module.exports.shutdown = shutdown;
module.exports.verifyDatabaseWithRetry = verifyDatabaseWithRetry;
module.exports.validateStartupConfiguration = validateStartupConfiguration;

// Only start the server if this file is run directly (not imported by tests)
if (require.main === module) {
  const handleSignal = (signal) => {
    shutdown(signal).catch((err) => {
      logger.error('server.shutdown_failed', { errorCode: err.code || 'UNKNOWN' });
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', () => handleSignal('SIGINT'));
  process.once('SIGTERM', () => handleSignal('SIGTERM'));

  start().catch(async (err) => {
    logger.error('server.startup_failed', {
      errorCode: err.code || 'UNKNOWN',
      errorName: err.name || 'Error',
      missingConfiguration: err.missingConfiguration,
      invalidConfiguration: err.code === 'INVALID_JWT_CONFIGURATION' ? ['JWT_SECRET'] : undefined,
    });
    process.exitCode = 1;
    try {
      await closeDatabase();
    } catch (_closeError) {
      // Keep the startup failure as the process exit reason.
    }
  });
}
