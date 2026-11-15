jest.mock('../src/config/database', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../src/models/auditModel');

const { pool } = require('../src/config/database');
const auditModel = require('../src/models/auditModel');
const userModel = require('../src/models/userModel');

function setup({ auditFailure = false } = {}) {
  const connection = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    execute: jest.fn()
      .mockResolvedValueOnce([[{
        username: 'student7', role: 'student', fullName: 'Old Name', email: null, isActive: 1,
      }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]),
  };
  pool.getConnection.mockResolvedValue(connection);
  auditModel.logEvent.mockImplementation(auditFailure
    ? jest.fn().mockRejectedValue(new Error('audit unavailable'))
    : jest.fn().mockResolvedValue(undefined));
  return connection;
}

beforeEach(() => jest.clearAllMocks());

describe('SAM-F-016 administrative audit transaction', () => {
  test('records changed field names on the same transaction as an account update', async () => {
    const connection = setup();
    const updated = await userModel.updateUser(7, { fullName: 'New Name' }, {
      actor: 'admin_user', ipAddress: '127.0.0.1', changed: ['fullName'],
      passwordReset: false,
    });

    expect(updated).toBe(true);
    expect(auditModel.logEvent).toHaveBeenCalledWith(expect.objectContaining({
      actor: 'admin_user', action: 'USER_UPDATED', target: 'users/7', connection,
      details: JSON.stringify({ changed: ['fullName'] }),
    }));
    expect(connection.execute.mock.calls[0][0]).toMatch(/SELECT user_id\s+FROM users/);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  test('rolls the account update back when the audit insert fails', async () => {
    const connection = setup({ auditFailure: true });
    await expect(userModel.updateUser(7, { fullName: 'New Name' }, {
      actor: 'admin_user', ipAddress: null, changed: ['fullName'],
      passwordReset: false,
    })).rejects.toThrow('audit unavailable');

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
