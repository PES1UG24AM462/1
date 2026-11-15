const fs = require('fs');
const http = require('http');
const https = require('https');
const request = require('supertest');

jest.mock('../src/config/database', () => ({
  pool: { execute: jest.fn() },
  testConnection: jest.fn().mockResolvedValue(undefined),
  checkDatabaseConnectivity: jest.fn().mockResolvedValue(undefined),
  closeDatabase: jest.fn().mockResolvedValue(undefined),
}));

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
  DB_HOST: process.env.DB_HOST,
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  TRUSTED_PROXY_IPS: process.env.TRUSTED_PROXY_IPS,
  TLS_KEY_PATH: process.env.TLS_KEY_PATH,
  TLS_CERT_PATH: process.env.TLS_CERT_PATH,
};

function restoreEnvironment() {
  Object.keys(originalEnvironment).forEach((name) => {
    if (originalEnvironment[name] === undefined) delete process.env[name];
    else process.env[name] = originalEnvironment[name];
  });
}

function productionApp({
  trustedProxyIps = '10.20.30.40',
  allowedOrigins = 'https://attendance.example.edu',
} = {}) {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_hs256_minimum';
  process.env.ALLOWED_ORIGINS = allowedOrigins;
  process.env.TRUSTED_PROXY_IPS = trustedProxyIps;
  jest.resetModules();
  return require('../src/server');
}

afterEach(() => {
  restoreEnvironment();
  jest.restoreAllMocks();
  jest.resetModules();
});

test('rejects plaintext login and authenticated API requests before processing their bodies', async () => {
  const app = productionApp();

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'student', password: 'plaintext-secret' });
  const protectedRequest = await request(app).get('/api/me').set('Authorization', 'Bearer token');

  expect(login.status).toBe(426);
  expect(login.body.message).toMatch(/https/i);
  expect(protectedRequest.status).toBe(426);
});

test('does not trust forwarded HTTPS from an untrusted proxy', async () => {
  const app = productionApp();

  const response = await request(app)
    .post('/api/auth/login')
    .set('X-Forwarded-Proto', 'https')
    .send({ username: 'student', password: 'secret' });

  expect(response.status).toBe(426);
  expect(response.headers['strict-transport-security']).toBeUndefined();
});

test('accepts a valid authenticated API request through a trusted TLS proxy', async () => {
  const app = productionApp({ trustedProxyIps: 'loopback' });
  const userModel = require('../src/models/userModel');
  const jwt = require('jsonwebtoken');
  userModel.findById = jest.fn().mockResolvedValue({
    user_id: 7,
    username: 'student',
    role: 'student',
    is_active: 1,
    full_name: 'Student Example',
  });
  const token = jwt.sign(
    { userId: 7, username: 'student', role: 'student' },
    process.env.JWT_SECRET,
    { algorithm: 'HS256', issuer: 'sams-api', expiresIn: '1h' }
  );

  const response = await request(app)
    .get('/api/me')
    .set('X-Forwarded-Proto', 'https')
    .set('Authorization', `Bearer ${token}`);

  expect(response.status).toBe(200);
  expect(response.body.username).toBe('student');
  expect(response.headers['strict-transport-security']).toBe('max-age=31536000');
  expect(userModel.findById).toHaveBeenCalledWith(7);
});

test('allows only configured HTTPS CORS origins without credentialed CORS', async () => {
  const app = productionApp({ trustedProxyIps: 'loopback' });
  const accepted = await request(app)
    .get('/api/health')
    .set('X-Forwarded-Proto', 'https')
    .set('Origin', 'https://attendance.example.edu');
  const rejected = await request(app)
    .get('/api/health')
    .set('X-Forwarded-Proto', 'https')
    .set('Origin', 'https://untrusted.example');

  expect(accepted.status).toBe(200);
  expect(accepted.headers['access-control-allow-origin']).toBe('https://attendance.example.edu');
  expect(accepted.headers['access-control-allow-credentials']).toBeUndefined();
  expect(rejected.status).toBe(403);
  expect(rejected.headers['access-control-allow-origin']).toBeUndefined();
});

test('rejects wildcard or malformed production CORS origins at configuration time', () => {
  expect(() => productionApp({ allowedOrigins: '*' })).toThrow(/HTTPS origins/);
  expect(() => productionApp({ allowedOrigins: 'https://attendance.example.edu/app' }))
    .toThrow(/without a path/);
});

test('requires configured TLS termination in production', async () => {
  const app = productionApp({ trustedProxyIps: '' });
  process.env.DB_HOST = 'localhost';
  process.env.DB_NAME = 'sams';
  process.env.DB_USER = 'sams';
  process.env.DB_PASSWORD = 'test';

  await expect(app.start()).rejects.toThrow(/TLS certificate paths or explicitly trusted TLS proxy/);
});

test('uses deployment-provided certificates and requires TLS 1.2 for direct TLS termination', async () => {
  const app = productionApp({ trustedProxyIps: '' });
  process.env.DB_HOST = 'localhost';
  process.env.DB_NAME = 'sams';
  process.env.DB_USER = 'sams';
  process.env.DB_PASSWORD = 'test';
  process.env.TLS_KEY_PATH = 'deployment-key.pem';
  process.env.TLS_CERT_PATH = 'deployment-cert.pem';

  const key = Buffer.from('deployment private key');
  const cert = Buffer.from('deployment certificate');
  jest.spyOn(fs, 'readFileSync').mockImplementation((path) => (
    path === process.env.TLS_KEY_PATH ? key : cert
  ));
  const fakeServer = {
    listening: false,
    once: jest.fn(),
    listen: jest.fn(function listen(_port, callback) {
      this.listening = true;
      callback();
    }),
    close: jest.fn(function close(callback) {
      this.listening = false;
      callback();
    }),
    address: () => ({ port: 5000 }),
  };
  const createTlsServer = jest.spyOn(https, 'createServer').mockReturnValue(fakeServer);
  const createHttpServer = jest.spyOn(http, 'createServer');

  await app.start();

  expect(createTlsServer).toHaveBeenCalledWith(
    { key, cert, minVersion: 'TLSv1.2' },
    app
  );
  expect(createHttpServer).not.toHaveBeenCalled();

  await app.shutdown('test', { server: fakeServer, closeDatabase: async () => {} });
});

test('does not send HSTS for an insecure local-development response', async () => {
  process.env.NODE_ENV = 'development';
  delete process.env.TRUSTED_PROXY_IPS;
  jest.resetModules();
  const app = require('../src/server');
  const response = await request(app).get('/api/health');

  expect(response.status).toBe(200);
  expect(response.headers['strict-transport-security']).toBeUndefined();
});
