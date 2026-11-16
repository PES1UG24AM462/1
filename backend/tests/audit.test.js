jest.mock('../src/models/userModel');
jest.mock('../src/models/auditModel');

process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DB_PASSWORD = 'test';

const request = require('supertest');
const app = require('../src/server');
const userModel = require('../src/models/userModel');
const auditModel = require('../src/models/auditModel');
const { generateToken } = require('../src/utils/jwtHelper');

const token = (userId, username, role) => generateToken({ userId, username, role });

beforeEach(() => {
  jest.clearAllMocks();
  userModel.findById = jest.fn(async (userId) => ({
    user_id: userId,
    username: userId === 1 ? 'admin_user' : `user${userId}`,
    role: userId === 1 ? 'admin' : 'faculty',
    is_active: 1,
  }));
  auditModel.listEvents = jest.fn().mockResolvedValue([
    { auditId: 7, actor: 'faculty1', action: 'ATTENDANCE_CORRECTION', target: 'attendance/9', details: '{"previousStatus":"Absent","newStatus":"Present"}' },
  ]);
});

describe('SAM-F-016 protected audit history', () => {
  test('requires authentication', async () => {
    const response = await request(app).get('/api/admin/audit-logs');
    expect(response.status).toBe(401);
    expect(auditModel.listEvents).not.toHaveBeenCalled();
  });

  test('restricts audit history to administrators', async () => {
    const response = await request(app).get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${token(2, 'faculty1', 'faculty')}`);
    expect(response.status).toBe(403);
    expect(auditModel.listEvents).not.toHaveBeenCalled();
  });

  test('returns events to an administrator and applies validated filters', async () => {
    const response = await request(app).get('/api/admin/audit-logs?action=ATTENDANCE_CORRECTION&limit=20&offset=10')
      .set('Authorization', `Bearer ${token(1, 'admin_user', 'admin')}`);
    expect(response.status).toBe(200);
    expect(response.body.events[0].details).toContain('previousStatus');
    expect(auditModel.listEvents).toHaveBeenCalledWith({ action: 'ATTENDANCE_CORRECTION', actor: null, limit: 20, offset: 10 });
  });

  test('rejects malformed filters before querying the audit log', async () => {
    const response = await request(app).get('/api/admin/audit-logs?limit=1000')
      .set('Authorization', `Bearer ${token(1, 'admin_user', 'admin')}`);
    expect(response.status).toBe(400);
    expect(auditModel.listEvents).not.toHaveBeenCalled();
  });
});
