/**
 * authorization.test.js
 * SAM-SR-003 — Authorise every protected API operation server-side.
 */

jest.mock('../src/models/userModel');
jest.mock('../src/models/auditModel');

process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_PASSWORD = 'test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/server');
const userModel = require('../src/models/userModel');
const { generateToken } = require('../src/utils/jwtHelper');

beforeEach(() => {
  userModel.findById = jest.fn().mockResolvedValue({
    user_id: 1, username: 'student1', role: 'student', is_active: 1, full_name: 'Stu Dent',
  });
});

describe('SAM-SR-003 — public vs protected endpoints', () => {
  test('health check stays public', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
  });

  test('login stays public (reaches the controller → 400 for empty body)', async () => {
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
  });

  test('protected endpoint without a token → 401', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  test('unknown /api path without a token → 401 (nothing is exposed anonymously)', async () => {
    const res = await request(app).get('/api/not-a-real-route');
    expect(res.status).toBe(401);
  });

  test('malformed Authorization header → 401', async () => {
    const res = await request(app).get('/api/me').set('Authorization', 'Token abc');
    expect(res.status).toBe(401);
  });

  test('garbage token → 401', async () => {
    const res = await request(app).get('/api/me').set('Authorization', 'Bearer not.a.jwt');
    expect(res.status).toBe(401);
  });

  test('token signed with the wrong secret → 401', async () => {
    const forged = jwt.sign({ userId: 1, role: 'admin' }, 'some_other_secret_some_other_secret_123', {
      algorithm: 'HS256', issuer: 'sams-api',
    });
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  test('expired token → 401', async () => {
    const expired = jwt.sign({ userId: 1, role: 'student' }, process.env.JWT_SECRET, {
      algorithm: 'HS256', issuer: 'sams-api', expiresIn: -10,
    });
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  test('valid token → 200 with profile and no password hash', async () => {
    const token = generateToken({ userId: 1, username: 'student1', role: 'student' });
    const res = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 1, username: 'student1', role: 'student', fullName: 'Stu Dent' });
  });
});
