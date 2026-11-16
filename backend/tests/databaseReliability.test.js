const mockPool = {
  on: jest.fn(),
  query: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
};

jest.mock('mysql2/promise', () => ({
  createPool: jest.fn(() => mockPool),
}));

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const mysql = require('mysql2/promise');
const logger = require('../src/utils/logger');
const { pool, checkDatabaseConnectivity, closeDatabase } = require('../src/config/database');

describe('MySQL connection reliability configuration', () => {
  beforeEach(() => {
    mockPool.query.mockReset();
    mockPool.end.mockClear();
  });

  test('uses a bounded pool and bounded waiter queue with connection timeout', () => {
    expect(mysql.createPool).toHaveBeenCalledWith(expect.objectContaining({
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 50,
      connectTimeout: 3000,
    }));
    expect(pool).toBe(mockPool);
  });

  test('readiness uses a bounded, read-only query through the pool', async () => {
    mockPool.query.mockResolvedValue([[{ 1: 1 }], []]);
    await expect(checkDatabaseConnectivity()).resolves.toBeUndefined();
    expect(pool.query).toHaveBeenCalledWith({ sql: 'SELECT 1', timeout: 3000 });
  });

  test('probe errors are propagated to readiness and shutdown closes the pool', async () => {
    mockPool.query.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { code: 'ETIMEDOUT' }));
    await expect(checkDatabaseConnectivity()).rejects.toMatchObject({ code: 'ETIMEDOUT' });
    expect(logger.warn).toHaveBeenCalledWith('database.connectivity_check_failed', {
      errorCode: 'ETIMEDOUT',
    });
    await closeDatabase();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
