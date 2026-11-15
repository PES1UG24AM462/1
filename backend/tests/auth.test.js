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

afterEach(() => jest.restoreAllMocks());

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

    // SAM-SR-004: failed-login audit metadata comes from the server, not body fields.
    const event = auditModel.logEvent.mock.calls[0][0];
    expect(event).toEqual(expect.objectContaining({
      actor: 'faculty1', action: 'LOGIN_FAILED', target: 'users/1',
    }));
    expect(JSON.parse(event.details)).toEqual({
      outcome: 'FAILURE',
      failureCategory: 'INVALID_CREDENTIALS',
      requestId: res.headers['x-request-id'],
    });
    expect(JSON.stringify(event)).not.toContain('WrongPassword!');
    expect(JSON.stringify(event)).not.toContain(validHash);
  });

  // ─── TC-AUTH-01: Unknown username ─────────────────────────────────────────
  test('should return 401 for unknown username (no enumeration)', async () => {
    userModel.findByUsername = jest.fn().mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'nobody', password: 'whatever', actor: 'admin1',
        action: 'LOGIN_SUCCESS', createdAt: '2099-01-01 00:00:00',
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid username or password.');
    const event = auditModel.logEvent.mock.calls[0][0];
    expect(event).toEqual(expect.objectContaining({
      actor: 'nobody', action: 'LOGIN_FAILED', target: 'auth/login',
    }));
    expect(event).not.toHaveProperty('createdAt');
    expect(event.details).not.toContain('whatever');
    expect(event.details).not.toContain('2099-01-01');
  });

  test('records repeated failed logins as separate events without duplicating secrets', async () => {
    userModel.findByUsername = jest.fn().mockResolvedValue(null);

    await request(app).post('/api/auth/login').send({ username: 'missing', password: 'bad-one' });
    await request(app).post('/api/auth/login').send({ username: 'missing', password: 'bad-two' });

    expect(auditModel.logEvent).toHaveBeenCalledTimes(2);
    const events = auditModel.logEvent.mock.calls.map(([event]) => event);
    expect(events.every((event) => event.action === 'LOGIN_FAILED')).toBe(true);
    expect(events.map((event) => JSON.parse(event.details).requestId)).toEqual([
      expect.any(String), expect.any(String),
    ]);
    expect(JSON.parse(events[0].details).requestId).not.toBe(JSON.parse(events[1].details).requestId);
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('bad-one');
    expect(serialized).not.toContain('bad-two');
  });

  test('records malformed account identifiers without persisting their raw value', async () => {
    const invalidIdentifier = 'bad\nidentifier';

    const res = await request(app).post('/api/auth/login')
      .send({ username: invalidIdentifier, password: 'not-logged' });

    expect(res.status).toBe(401);
    expect(userModel.findByUsername).not.toHaveBeenCalled();
    const event = auditModel.logEvent.mock.calls[0][0];
    expect(event).toEqual(expect.objectContaining({
      actor: null, action: 'LOGIN_FAILED', target: 'auth/login',
    }));
    expect(JSON.parse(event.details).failureCategory).toBe('INVALID_IDENTIFIER');
    expect(JSON.stringify(event)).not.toContain('bad');
    expect(JSON.stringify(event)).not.toContain('not-logged');
  });

  test('returns a generic server error when a failed-login audit cannot be persisted', async () => {
    userModel.findByUsername = jest.fn().mockResolvedValue(null);
    auditModel.logEvent.mockRejectedValue(new Error('database unavailable'));
    const operationalLog = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(app).post('/api/auth/login')
      .send({ username: 'nobody', password: 'do-not-log-this' });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe('An internal server error occurred. Please try again.');
    expect(JSON.stringify(res.body)).not.toContain('do-not-log-this');
    expect(operationalLog.mock.calls.flat().join(' ')).not.toContain('do-not-log-this');
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
    expect(auditModel.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'old_student', action: 'LOGIN_FAILED', target: 'users/5',
      details: expect.stringContaining('ACCOUNT_INACTIVE'),
    }));
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
