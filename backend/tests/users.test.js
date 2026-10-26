/**
 * users.test.js
 * SAM-F-014 — Manage user accounts (administrator only).
 */

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

const adminToken = () => generateToken({ userId: 1, username: 'admin_user', role: 'admin' });
const facultyToken = () => generateToken({ userId: 2, username: 'faculty1', role: 'faculty' });

function loginAs(role, id = 1) {
  userModel.findById = jest.fn().mockImplementation(async (uid) =>
    uid === id ? { user_id: id, username: `${role}${id}`, role, is_active: 1, full_name: 'X' } : null
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  auditModel.logEvent = jest.fn().mockResolvedValue(undefined);
});

const validStudent = {
  username: 'stud9', password: 'Passw0rd!x', role: 'student', fullName: 'Asha Rao',
  email: 'asha@sams.edu', usn: 'pes1ug24am900', department: 'AIML', semester: 3,
};

describe('SAM-F-014 — access control', () => {
  test('faculty cannot list accounts (403)', async () => {
    loginAs('faculty', 2);
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${facultyToken()}`);
    expect(res.status).toBe(403);
  });
  test('no token → 401', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });
});

describe('SAM-F-014 — list', () => {
  test('admin gets accounts without password hashes', async () => {
    loginAs('admin');
    userModel.listUsers = jest.fn().mockResolvedValue([{ user_id: 1, username: 'a', role: 'admin' }]);
    const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toHaveLength(1);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });
});

describe('SAM-F-014 — create', () => {
  test('creates a student, hashes the password, audits the change', async () => {
    loginAs('admin');
    userModel.createUser = jest.fn().mockResolvedValue(42);
    const res = await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken()}`).send(validStudent);
    expect(res.status).toBe(201);
    expect(res.body.userId).toBe(42);
    const arg = userModel.createUser.mock.calls[0][0];
    expect(arg.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(arg.passwordHash).not.toContain('Passw0rd!x');
    expect(arg.usn).toBe('PES1UG24AM900');
    expect(auditModel.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_CREATED', target: 'users/42' }));
    expect(JSON.stringify(auditModel.logEvent.mock.calls)).not.toContain('Passw0rd!x');
  });

  test.each([
    ['short password', { password: 'abc' }],
    ['bad role', { role: 'superuser' }],
    ['bad username', { username: 'a b' }],
    ['bad email', { email: 'nope' }],
    ['student without USN', { usn: '' }],
    ['bad semester', { semester: 99 }],
  ])('rejects %s with 400', async (_n, patch) => {
    loginAs('admin');
    userModel.createUser = jest.fn();
    const res = await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken()}`).send({ ...validStudent, ...patch });
    expect(res.status).toBe(400);
    expect(userModel.createUser).not.toHaveBeenCalled();
  });

  test('duplicate username/USN → 409', async () => {
    loginAs('admin');
    userModel.createUser = jest.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }));
    const res = await request(app).post('/api/admin/users').set('Authorization', `Bearer ${adminToken()}`).send(validStudent);
    expect(res.status).toBe(409);
  });
});

describe('SAM-F-014 — update / deactivate', () => {
  test('deactivates another account and audits it', async () => {
    userModel.findById = jest.fn().mockImplementation(async (uid) => ({ user_id: uid, username: `u${uid}`, role: uid === 1 ? 'admin' : 'student', is_active: 1, full_name: 'X' }));
    userModel.updateUser = jest.fn().mockResolvedValue(true);
    const res = await request(app).patch('/api/admin/users/7').set('Authorization', `Bearer ${adminToken()}`).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(userModel.updateUser).toHaveBeenCalledWith(7, expect.objectContaining({ isActive: false }));
    expect(auditModel.logEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'USER_UPDATED', target: 'users/7' }));
  });

  test('admin cannot deactivate themselves', async () => {
    loginAs('admin');
    userModel.updateUser = jest.fn();
    const res = await request(app).patch('/api/admin/users/1').set('Authorization', `Bearer ${adminToken()}`).send({ isActive: false });
    expect(res.status).toBe(400);
    expect(userModel.updateUser).not.toHaveBeenCalled();
  });

  test('unknown user → 404', async () => {
    userModel.findById = jest.fn().mockImplementation(async (uid) => (uid === 1 ? { user_id: 1, username: 'a', role: 'admin', is_active: 1, full_name: 'A' } : null));
    const res = await request(app).patch('/api/admin/users/99').set('Authorization', `Bearer ${adminToken()}`).send({ fullName: 'New' });
    expect(res.status).toBe(404);
  });

  test('password reset is hashed', async () => {
    userModel.findById = jest.fn().mockImplementation(async (uid) => ({ user_id: uid, username: `u${uid}`, role: uid === 1 ? 'admin' : 'student', is_active: 1, full_name: 'X' }));
    userModel.updateUser = jest.fn().mockResolvedValue(true);
    const res = await request(app).patch('/api/admin/users/7').set('Authorization', `Bearer ${adminToken()}`).send({ password: 'NewPassw0rd!' });
    expect(res.status).toBe(200);
    expect(userModel.updateUser.mock.calls[0][1].passwordHash).toMatch(/^\$2[aby]\$/);
  });

  test('empty body → 400', async () => {
    loginAs('admin');
    const res = await request(app).patch('/api/admin/users/7').set('Authorization', `Bearer ${adminToken()}`).send({});
    expect(res.status).toBe(400);
  });
});
