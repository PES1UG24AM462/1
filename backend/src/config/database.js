/**
 * database.js
 * MySQL connection pool using mysql2/promise.
 * Credentials loaded from environment variables — never hardcoded (SAM-SR-002).
 */

const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const connectionLimit = positiveInteger(process.env.DB_POOL_LIMIT, 10);
const queueLimit = positiveInteger(process.env.DB_QUEUE_LIMIT, 50);
const connectTimeoutMs = positiveInteger(process.env.DB_CONNECT_TIMEOUT_MS, 3000);
const queryTimeoutMs = positiveInteger(
  process.env.DB_PROBE_TIMEOUT_MS || process.env.DB_QUERY_TIMEOUT_MS,
  3000
);

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  database: process.env.DB_NAME || 'student_attendance_db',
  user: process.env.DB_USER || 'sam_user',
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit,
  // Bound queued requests so a stalled database cannot grow memory without limit.
  queueLimit,
  connectTimeout: connectTimeoutMs,
  // Enable timezone-aware timestamps
  timezone: '+00:00',
});

/** Run a bounded, read-only database probe used by startup and readiness. */
async function checkDatabaseConnectivity() {
  try {
    // SELECT 1 is safe to retry. The driver timeout turns a stalled probe into
    // a failure response without exposing its connection details to the caller.
    await pool.query({ sql: 'SELECT 1', timeout: queryTimeoutMs });
  } catch (err) {
    logger.warn('database.connectivity_check_failed', {
      errorCode: err.code || 'UNKNOWN',
    });
    throw err;
  }
}

/**
 * Test the database connection on startup.
 * Connection recovery/retry policy is owned by server startup, not this layer.
 */
async function testConnection() {
  await checkDatabaseConnectivity();
  logger.info('database.connected');
}

async function closeDatabase() {
  await pool.end();
}

module.exports = {
  pool,
  testConnection,
  checkDatabaseConnectivity,
  closeDatabase,
  queryTimeoutMs,
};
