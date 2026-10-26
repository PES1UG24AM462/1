/**
 * performance.test.js
 * SAM-NF-001 — TC-PERF-01 (API layer only, database mocked).
 * 95th percentile of 100 requests, 20 at a time, must be ≤ 3000 ms.
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

beforeEach(() => {
  userModel.findById = jest.fn().mockResolvedValue({
    user_id: 1, username: 'faculty1', role: 'faculty', is_active: 1, full_name: 'Dr. R',
  });
});

test('every response carries an X-Response-Time header', async () => {
  const res = await request(app).get('/api/health');
  expect(res.headers['x-response-time']).toMatch(/^\d+(\.\d+)?ms$/);
});

test('responses are gzip-compressed when the client accepts it', async () => {
  userModel.listUsers = jest.fn().mockResolvedValue(
    Array.from({ length: 200 }, (_, i) => ({ user_id: i, username: `user${i}`, role: 'student', full_name: 'Some Student Name' }))
  );
  userModel.findById = jest.fn().mockResolvedValue({ user_id: 1, username: 'a', role: 'admin', is_active: 1, full_name: 'A' });
  const token = generateToken({ userId: 1, username: 'a', role: 'admin' });
  const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${token}`).set('Accept-Encoding', 'gzip');
  expect(res.status).toBe(200);
  expect(res.headers['content-encoding']).toBe('gzip');
});

test('TC-PERF-01: p95 latency ≤ 3000 ms under 20 concurrent clients', async () => {
  const token = generateToken({ userId: 1, username: 'faculty1', role: 'faculty' });
  const times = [];
  for (let batch = 0; batch < 5; batch += 1) {
    await Promise.all(
      Array.from({ length: 20 }, async () => {
        const t0 = Date.now();
        const res = await request(app).get('/api/me').set('Authorization', `Bearer ${token}`);
        times.push(Date.now() - t0);
        expect(res.status).toBe(200);
      })
    );
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.ceil(times.length * 0.95) - 1];
  expect(times).toHaveLength(100);
  expect(p95).toBeLessThanOrEqual(3000);
});
