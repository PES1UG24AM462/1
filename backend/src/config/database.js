/**
 * database.js
 * MySQL connection pool using mysql2/promise.
 * Credentials loaded from environment variables — never hardcoded (SAM-SR-002).
 */

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  database: process.env.DB_NAME || 'student_attendance_db',
  user: process.env.DB_USER || 'sam_user',
  password: process.env.DB_PASSWORD,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  // Enable timezone-aware timestamps
  timezone: '+00:00',
});

/**
 * Test the database connection on startup.
 * Logs success or exits process on failure.
 */
async function testConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('[DB] MySQL connection pool established successfully.');
    connection.release();
  } catch (err) {
    console.error('[DB] Failed to connect to MySQL:', err.message);
    process.exit(1);
  }
}

module.exports = { pool, testConnection };
