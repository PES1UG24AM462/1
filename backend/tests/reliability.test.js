jest.mock('../src/config/database', () => ({
  testConnection: jest.fn(),
  checkDatabaseConnectivity: jest.fn(),
  closeDatabase: jest.fn(),
  pool: { on: jest.fn() },
}));

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const database = require('../src/config/database');
const logger = require('../src/utils/logger');
const errorHandler = require('../src/middleware/errorHandler');
const app = require('../src/server');

describe('SAM-NF-002 application reliability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('liveness responds successfully without checking MySQL', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.headers['x-request-id']).toBeTruthy();
    expect(database.checkDatabaseConnectivity).not.toHaveBeenCalled();
  });

  test('readiness responds ready when the database probe succeeds', async () => {
    database.checkDatabaseConnectivity.mockResolvedValue(undefined);
    const response = await request(app).get('/api/ready');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ready');
    expect(response.body).not.toHaveProperty('database');
    expect(response.body).not.toHaveProperty('host');
    expect(response.body).not.toHaveProperty('password');
  });

  test('readiness returns a sanitized 503 when the database probe fails', async () => {
    database.checkDatabaseConnectivity.mockRejectedValue(
      Object.assign(new Error('password=private host=db.internal'), { code: 'ECONNREFUSED' })
    );
    const response = await request(app).get('/api/ready');
    expect(response.status).toBe(503);
    expect(response.body.status).toBe('not_ready');
    expect(response.text).not.toContain('private');
    expect(response.text).not.toContain('db.internal');
    expect(response.headers['x-request-id']).toBe(response.body.requestId);
  });

  test('startup retries the safe connectivity probe with bounded exponential backoff', async () => {
    const check = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { code: 'ECONNREFUSED' }))
      .mockRejectedValueOnce(Object.assign(new Error('temporary'), { code: 'ECONNREFUSED' }))
      .mockResolvedValueOnce(undefined);
    const wait = jest.fn().mockResolvedValue(undefined);

    await app.verifyDatabaseWithRetry({
      check,
      attempts: 3,
      retryDelayMs: 100,
      wait,
      random: () => 0,
    });

    expect(check).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[100], [200]]);
  });

  test('startup stops after the configured retry limit', async () => {
    const check = jest.fn().mockRejectedValue(new Error('offline'));
    const wait = jest.fn().mockResolvedValue(undefined);
    await expect(app.verifyDatabaseWithRetry({
      check,
      attempts: 2,
      retryDelayMs: 10,
      wait,
      random: () => 0,
    }))
      .rejects.toThrow('offline');
    expect(check).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  test('startup rejects missing or weak critical configuration without naming values', () => {
    expect(() => app.validateStartupConfiguration({ NODE_ENV: 'production' }))
      .toThrow('DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET');
    expect(() => app.validateStartupConfiguration({ NODE_ENV: 'development' }))
      .toThrow('JWT_SECRET');
    expect(() => app.validateStartupConfiguration({
      NODE_ENV: 'development',
      JWT_SECRET: '12345678901234567890123456789012',
    })).not.toThrow();
  });

  test('central error handling returns a safe response and correlates the request', async () => {
    const testApp = express();
    const requestId = require('../src/middleware/requestId');
    testApp.use(requestId);
    testApp.get('/failure', (_req, _res, next) => {
      next(Object.assign(new Error('SQL contained private student data'), { status: 500 }));
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/failure');
    expect(response.status).toBe(500);
    expect(response.body.message).toBe('Internal server error.');
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    expect(response.text).not.toContain('private student data');
    expect(response.text).not.toContain('stack');
    expect(logger.error).toHaveBeenCalledWith('http.request_error', expect.objectContaining({
      requestId: response.body.requestId,
      status: 500,
      errorName: 'Error',
    }));
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('private student data');
  });

  test('graceful shutdown closes HTTP before the database pool', async () => {
    const order = [];
    const fakeServer = {
      listening: true,
      close(callback) {
        order.push('http');
        this.listening = false;
        callback();
      },
    };
    const closePool = jest.fn(async () => { order.push('database'); });

    await app.shutdown('test', { server: fakeServer, closeDatabase: closePool, timeoutMs: 50 });

    expect(order).toEqual(['http', 'database']);
    expect(closePool).toHaveBeenCalledTimes(1);
  });
});
