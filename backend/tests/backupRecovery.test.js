/**
 * backupRecovery.test.js
 * Tests for SAM-NF-004 — Preserve attendance data with backups and recovery.
 *
 * TC-REC-01: Recovery test restores a valid backup without inconsistent records.
 *
 * Tests cover:
 *   1. dbIntegrity.checkDuplicateAttendance — detects duplicate violations
 *   2. dbIntegrity.checkAttendanceStatuses  — detects invalid status values
 *   3. dbIntegrity.checkOrphanedAttendance  — detects broken foreign keys
 *   4. dbIntegrity.checkTablesExist         — detects missing tables
 *   5. dbIntegrity.runIntegrityChecks       — combined OK result
 *   6. dbIntegrity.runIntegrityChecks       — combined FAIL result
 *   7. GET /api/admin/db/health             — 200 when all checks pass
 *   8. GET /api/admin/db/health             — 503 when a check fails
 *   9. GET /api/admin/db/health             — 401 without token
 *  10. GET /api/admin/db/health             — 403 for non-admin role
 *  11. backup.sh exists and is executable
 *  12. restore.sh exists and is executable
 *  13. Attendance model uses a transaction (rollback on failure)
 */

jest.mock('../src/config/database', () => ({
  pool: { execute: jest.fn(), getConnection: jest.fn(), on: jest.fn() },
}));
jest.mock('../src/models/userModel');
jest.mock('../src/models/auditModel');

process.env.JWT_SECRET     = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_PASSWORD    = 'test';

const fs      = require('fs');
const path    = require('path');
const request = require('supertest');
const jwt     = require('jsonwebtoken');
const app     = require('../src/server');
const { pool } = require('../src/config/database');
const userModel  = require('../src/models/userModel');
const auditModel = require('../src/models/auditModel');

const {
  checkTablesExist,
  checkDuplicateAttendance,
  checkAttendanceStatuses,
  checkOrphanedAttendance,
  runIntegrityChecks,
} = require('../src/utils/dbIntegrity');

// ── Helpers ──────────────────────────────────────────────────────────────────
function adminToken() {
  return jwt.sign(
    { userId: 1, username: 'admin', role: 'admin' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'sams-api' }
  );
}
function facultyToken() {
  return jwt.sign(
    { userId: 2, username: 'faculty', role: 'faculty' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '1h', issuer: 'sams-api' }
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  auditModel.logEvent = jest.fn().mockResolvedValue(undefined);
  userModel.findById  = jest.fn().mockResolvedValue({
    user_id: 1, username: 'admin', role: 'admin', is_active: 1,
  });
});

// ── 1. No duplicate attendance records ───────────────────────────────────────
describe('TC-REC-01 — SAM-NF-004: Database integrity checks', () => {

  test('checkDuplicateAttendance should return ok=true when no duplicates exist', async () => {
    pool.execute = jest.fn().mockResolvedValue([[ { duplicateCount: 0 } ]]);
    const result = await checkDuplicateAttendance();
    expect(result.ok).toBe(true);
    expect(result.duplicateCount).toBe(0);
  });

  test('checkDuplicateAttendance should return ok=false when duplicates exist', async () => {
    pool.execute = jest.fn().mockResolvedValue([[ { duplicateCount: 3 } ]]);
    const result = await checkDuplicateAttendance();
    expect(result.ok).toBe(false);
    expect(result.duplicateCount).toBe(3);
  });

  // ── 2. Valid attendance statuses ──────────────────────────────────────────
  test('checkAttendanceStatuses should return ok=true when all statuses are valid', async () => {
    pool.execute = jest.fn().mockResolvedValue([[ { invalidCount: 0 } ]]);
    const result = await checkAttendanceStatuses();
    expect(result.ok).toBe(true);
    expect(result.invalidCount).toBe(0);
  });

  test('checkAttendanceStatuses should return ok=false when invalid statuses exist', async () => {
    pool.execute = jest.fn().mockResolvedValue([[ { invalidCount: 2 } ]]);
    const result = await checkAttendanceStatuses();
    expect(result.ok).toBe(false);
    expect(result.invalidCount).toBe(2);
  });

  // ── 3. No orphaned attendance rows ────────────────────────────────────────
  test('checkOrphanedAttendance should return ok=true when no orphans exist', async () => {
    pool.execute = jest.fn().mockResolvedValue([[ { orphanCount: 0 } ]]);
    const result = await checkOrphanedAttendance();
    expect(result.ok).toBe(true);
  });

  test('checkOrphanedAttendance should return ok=false when orphaned rows exist', async () => {
    pool.execute = jest.fn().mockResolvedValue([[ { orphanCount: 5 } ]]);
    const result = await checkOrphanedAttendance();
    expect(result.ok).toBe(false);
    expect(result.orphanCount).toBe(5);
  });

  // ── 4. All required tables exist ──────────────────────────────────────────
  test('checkTablesExist should return ok=true when all tables are present', async () => {
    const TABLES = ['users','students','faculty','courses','classes','enrollments','attendance','audit_log'];
    pool.execute = jest.fn().mockResolvedValue([ TABLES.map(t => ({ TABLE_NAME: t })) ]);
    const result = await checkTablesExist();
    expect(result.ok).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  test('checkTablesExist should return ok=false and list missing tables', async () => {
    // Simulate missing audit_log and enrollments
    const PRESENT = ['users','students','faculty','courses','classes','attendance'];
    pool.execute = jest.fn().mockResolvedValue([ PRESENT.map(t => ({ TABLE_NAME: t })) ]);
    const result = await checkTablesExist();
    expect(result.ok).toBe(false);
    expect(result.missing).toContain('audit_log');
    expect(result.missing).toContain('enrollments');
  });

  // ── 5. runIntegrityChecks — all pass ──────────────────────────────────────
  test('runIntegrityChecks should return ok=true when all checks pass', async () => {
    const TABLES = ['users','students','faculty','courses','classes','enrollments','attendance','audit_log'];
    pool.execute = jest.fn()
      .mockResolvedValueOnce([ TABLES.map(t => ({ TABLE_NAME: t })) ])  // tables
      .mockResolvedValueOnce([[ { duplicateCount: 0 } ]])                // duplicates
      .mockResolvedValueOnce([[ { invalidCount: 0 } ]])                  // statuses
      .mockResolvedValueOnce([[ { orphanCount: 0 } ]])                   // orphans
      .mockResolvedValueOnce([[ { auditRowCount: 42 } ]]);               // audit log

    const result = await runIntegrityChecks();
    expect(result.ok).toBe(true);
    expect(result.checks.tables.ok).toBe(true);
    expect(result.checks.duplicates.ok).toBe(true);
    expect(result.checks.statuses.ok).toBe(true);
    expect(result.checks.orphans.ok).toBe(true);
    expect(result.checks.auditLog.ok).toBe(true);
    expect(result.checkedAt).toBeDefined();
  });

  // ── 6. runIntegrityChecks — one check fails ───────────────────────────────
  test('runIntegrityChecks should return ok=false when any check fails', async () => {
    const TABLES = ['users','students','faculty','courses','classes','enrollments','attendance','audit_log'];
    pool.execute = jest.fn()
      .mockResolvedValueOnce([ TABLES.map(t => ({ TABLE_NAME: t })) ])
      .mockResolvedValueOnce([[ { duplicateCount: 2 } ]])   // <-- duplicates found
      .mockResolvedValueOnce([[ { invalidCount: 0 } ]])
      .mockResolvedValueOnce([[ { orphanCount: 0 } ]])
      .mockResolvedValueOnce([[ { auditRowCount: 10 } ]]);

    const result = await runIntegrityChecks();
    expect(result.ok).toBe(false);
    expect(result.checks.duplicates.ok).toBe(false);
  });

  // ── 7. GET /api/admin/db/health — 200 all checks pass ────────────────────
  test('GET /api/admin/db/health should return 200 when all checks pass', async () => {
    const TABLES = ['users','students','faculty','courses','classes','enrollments','attendance','audit_log'];
    pool.execute = jest.fn()
      .mockResolvedValueOnce([ TABLES.map(t => ({ TABLE_NAME: t })) ])
      .mockResolvedValueOnce([[ { duplicateCount: 0 } ]])
      .mockResolvedValueOnce([[ { invalidCount: 0 } ]])
      .mockResolvedValueOnce([[ { orphanCount: 0 } ]])
      .mockResolvedValueOnce([[ { auditRowCount: 100 } ]]);

    const res = await request(app)
      .get('/api/admin/db/health')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.checks).toHaveProperty('tables');
    expect(res.body.checks).toHaveProperty('duplicates');
    expect(res.body.checks).toHaveProperty('statuses');
    expect(res.body.checks).toHaveProperty('orphans');
    expect(res.body.checks).toHaveProperty('auditLog');
    expect(res.body.checkedAt).toBeDefined();
  });

  // ── 8. GET /api/admin/db/health — 503 when a check fails ─────────────────
  test('GET /api/admin/db/health should return 503 when a check fails', async () => {
    const TABLES = ['users','students','faculty','courses','classes','enrollments','attendance','audit_log'];
    pool.execute = jest.fn()
      .mockResolvedValueOnce([ TABLES.map(t => ({ TABLE_NAME: t })) ])
      .mockResolvedValueOnce([[ { duplicateCount: 1 } ]])   // fail
      .mockResolvedValueOnce([[ { invalidCount: 0 } ]])
      .mockResolvedValueOnce([[ { orphanCount: 0 } ]])
      .mockResolvedValueOnce([[ { auditRowCount: 50 } ]]);

    const res = await request(app)
      .get('/api/admin/db/health')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
  });

  // ── 9. Unauthenticated ────────────────────────────────────────────────────
  test('GET /api/admin/db/health should return 401 without token', async () => {
    const res = await request(app).get('/api/admin/db/health');
    expect(res.status).toBe(401);
  });

  // ── 10. Non-admin blocked ─────────────────────────────────────────────────
  test('GET /api/admin/db/health should return 403 for faculty role', async () => {
    userModel.findById = jest.fn().mockResolvedValue({
      user_id: 2, username: 'faculty', role: 'faculty', is_active: 1,
    });

    const res = await request(app)
      .get('/api/admin/db/health')
      .set('Authorization', `Bearer ${facultyToken()}`);

    expect(res.status).toBe(403);
  });

  // ── 11. backup.sh exists and is executable ────────────────────────────────
  test('backup.sh script should exist and be executable', () => {
    const scriptPath = path.resolve(__dirname, '../scripts/backup.sh');
    expect(fs.existsSync(scriptPath)).toBe(true);
    // Check executable bit
    const stats = fs.statSync(scriptPath);
    const isExecutable = !!(stats.mode & 0o111);
    expect(isExecutable).toBe(true);
  });

  // ── 12. restore.sh exists and is executable ───────────────────────────────
  test('restore.sh script should exist and be executable', () => {
    const scriptPath = path.resolve(__dirname, '../scripts/restore.sh');
    expect(fs.existsSync(scriptPath)).toBe(true);
    const stats = fs.statSync(scriptPath);
    const isExecutable = !!(stats.mode & 0o111);
    expect(isExecutable).toBe(true);
  });

  // ── 13. Attendance model uses a transaction ───────────────────────────────
  test('saveAttendanceRecords should rollback the transaction on DB failure', async () => {
    const mockConnection = {
      beginTransaction: jest.fn().mockResolvedValue(undefined),
      execute:          jest.fn().mockRejectedValue(new Error('DB write failed')),
      rollback:         jest.fn().mockResolvedValue(undefined),
      commit:           jest.fn().mockResolvedValue(undefined),
      release:          jest.fn(),
    };
    pool.getConnection = jest.fn().mockResolvedValue(mockConnection);

    const { saveAttendanceRecords } = require('../src/models/attendanceModel');
    await expect(
      saveAttendanceRecords({
        classId: 10,
        date: '2026-10-22',
        recordedBy: 2,
        records: [{ studentId: 1, status: 'Present' }],
      })
    ).rejects.toThrow('DB write failed');

    // Transaction was started and then rolled back — data integrity preserved
    expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(mockConnection.release).toHaveBeenCalledTimes(1);
  });
});
