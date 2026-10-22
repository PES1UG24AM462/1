/**
 * auth.test.js
 * Integration tests for POST /api/auth/login (SAM-F-001)
 *
 * Test cases mapped from the Test Plan:
 *   TC-AUTH-01 — Valid credentials → 200 + { token, role }
 *   TC-AUTH-01 — Wrong password    → 401 + generic error message
 *   TC-AUTH-01 — Unknown username  → 401 + generic error message (no username enumeration)
 *   TC-AUTH-02 — Deactivated account → 401
 *   Extra      — Missing fields    → 400
 *
 * NOTE: These are unit/mock tests that do NOT require a live MySQL instance.
 *       The database layer (userModel, auditModel) is mocked via jest.mock.
 */

jest.mock('../src/models/userModel');
jest.mock('../src/models/auditModel');

const request = require('supertest');
const bcrypt = require('bcryptjs');

// Set required env vars before importing the app
process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_PASSWORD = 'test';

const app = require('../src/server');
const userModel = require('../src/models/userModel');
const auditModel = require('../src/models/auditModel');

// Pre-compute a known bcrypt hash for test assertions
const VALID_PASSWORD = 'Faculty@1234';
let validHash;

beforeAll(async () => {
  validHash = await bcrypt.hash(VALID_PASSWORD, 10);
});

beforeEach(() => {
  jest.clearAllMocks();
  // Default: auditModel.logEvent is a no-op in tests
  auditModel.logEvent = jest.fn().mockResolvedValue(undefined);
});

// ─── TC-AUTH-01: Valid Login ─────────────────────────────────────────────────
describe('TC-AUTH-01 — SAM-F-001: Sign in with username and password', () => {
  test('should return 200 with token and role for valid credentials', async () => {
    userModel.findByUsername = jest.fn().mockResolvedValue({
      user_id: 1,
      username: 'faculty1',
      password_hash: validHash,
      role: 'faculty',
      is_active: 1,
      full_name: 'Dr. Ramesh Kumar',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'faculty1', password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('role', 'faculty');
    expect(res.body).toHaveProperty('userId', 1);
    expect(res.body).not.toHaveProperty('password_hash');

    // SAM-SR-004: login success must be audited
    expect(auditModel.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_SUCCESS' })
    );
  });

  // ─── TC-AUTH-01: Wrong password ──────────────────────────────────────────
  test('should return 401 for incorrect password', async () => {
    userModel.findByUsername = jest.fn().mockResolvedValue({
      user_id: 1,
      username: 'faculty1',
      password_hash: validHash,
      role: 'faculty',
      is_active: 1,
      full_name: 'Dr. Ramesh Kumar',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'faculty1', password: 'WrongPassword!' });

    expect(res.status).toBe(401);
    // Generic message — must not reveal whether the username exists
    expect(res.body.message).toBe('Invalid username or password.');

    // SAM-SR-004: failure must be audited
    expect(auditModel.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'LOGIN_FAILURE' })
    );
  });

  // ─── TC-AUTH-01: Unknown username ─────────────────────────────────────────
  test('should return 401 for unknown username (no enumeration)', async () => {
    userModel.findByUsername = jest.fn().mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'whatever' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid username or password.');
  });

  // ─── TC-AUTH-02: Deactivated account ─────────────────────────────────────
  test('should return 401 for a deactivated account', async () => {
    userModel.findByUsername = jest.fn().mockResolvedValue({
      user_id: 5,
      username: 'old_student',
      password_hash: validHash,
      role: 'student',
      is_active: 0,   // <-- deactivated (SAM-F-014)
      full_name: 'Old Student',
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'old_student', password: VALID_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid username or password.');
  });

  // ─── Missing fields ───────────────────────────────────────────────────────
  test('should return 400 when username is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: VALID_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('required');
  });

  test('should return 400 when password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'faculty1' });

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('required');
  });
});
