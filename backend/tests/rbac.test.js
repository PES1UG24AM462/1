/**
 * rbac.test.js
 * SAM-F-002 — Enforce role-based access (TC-AUTH-02).
 * The database layer is mocked; no MySQL instance is needed.
 */

jest.mock('../src/models/userModel');
jest.mock('../src/models/auditModel');

process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_PASSWORD = 'test';

const request = require('supertest');
const app = require('../src/server');
const userModel = require('../src/models/userModel');
const { generateToken } = require('../src/utils/jwtHelper');

function tokenFor(userId, role) {
  return generateToken({ userId, username: `${role}${userId}`, role });
}

function mockAccount(role, overrides = {}) {
  userModel.findById = jest.fn().mockResolvedValue({
    user_id: 1, username: `${role}1`, role, is_active: 1, full_name: 'Test', ...overrides,
  });
}

describe('TC-AUTH-02 — SAM-F-002: Enforce role-based access', () => {
  test.each([
    ['admin', '/api/admin/ping'],
    ['faculty', '/api/faculty/ping'],
    ['student', '/api/student/ping'],
  ])('%s can reach their own area', async (role, url) => {
    mockAccount(role);
    const res = await request(app).get(url).set('Authorization', `Bearer ${tokenFor(1, role)}`);
    expect(res.status).toBe(200);
    expect(res.body.role).toBe(role);
  });

  test.each([
    ['student', '/api/admin/ping'],
    ['student', '/api/faculty/ping'],
    ['faculty', '/api/admin/ping'],
    ['faculty', '/api/student/ping'],
    ['admin', '/api/faculty/ping'],
  ])('%s is refused (403) on %s', async (role, url) => {
    mockAccount(role);
    const res = await request(app).get(url).set('Authorization', `Bearer ${tokenFor(1, role)}`);
    expect(res.status).toBe(403);
  });

  test('no token → 401', async () => {
    const res = await request(app).get('/api/admin/ping');
    expect(res.status).toBe(401);
  });

  test('role is taken from the database, not the token (demoted admin gets 403)', async () => {
    mockAccount('student'); // DB says student now
    const res = await request(app).get('/api/admin/ping').set('Authorization', `Bearer ${tokenFor(1, 'admin')}`);
    expect(res.status).toBe(403);
  });

  test('deactivated account is refused even with a valid token', async () => {
    mockAccount('admin', { is_active: 0 });
    const res = await request(app).get('/api/admin/ping').set('Authorization', `Bearer ${tokenFor(1, 'admin')}`);
    expect(res.status).toBe(401);
  });

  test('deleted account is refused', async () => {
    userModel.findById = jest.fn().mockResolvedValue(null);
    const res = await request(app).get('/api/admin/ping').set('Authorization', `Bearer ${tokenFor(9, 'admin')}`);
    expect(res.status).toBe(401);
  });
});
