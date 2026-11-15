const request = require('supertest');

function productionApp(trustedProxyIps) {
  process.env.NODE_ENV = 'production';
  process.env.ALLOWED_ORIGINS = 'https://attendance.example.edu';
  process.env.TRUSTED_PROXY_IPS = trustedProxyIps;
  jest.resetModules();
  return require('../src/server');
}

afterEach(() => {
  delete process.env.TRUSTED_PROXY_IPS;
  delete process.env.ALLOWED_ORIGINS;
  process.env.NODE_ENV = 'test';
  jest.resetModules();
});

test('rejects plaintext login and authenticated API requests before processing their bodies', async () => {
  const app = productionApp('10.20.30.40');

  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: 'student', password: 'plaintext-secret' });
  const protectedRequest = await request(app).get('/api/me').set('Authorization', 'Bearer token');

  expect(login.status).toBe(426);
  expect(login.body.message).toMatch(/https/i);
  expect(protectedRequest.status).toBe(426);
});

test('does not trust forwarded HTTPS from an untrusted proxy', async () => {
  const app = productionApp('10.20.30.40');

  const response = await request(app)
    .post('/api/auth/login')
    .set('X-Forwarded-Proto', 'https')
    .send({ username: 'student', password: 'secret' });

  expect(response.status).toBe(426);
  expect(response.headers['strict-transport-security']).toBeUndefined();
});

test('accepts HTTPS forwarded by a configured trusted proxy and sends HSTS', async () => {
  const app = productionApp('loopback');

  const response = await request(app)
    .get('/api/health')
    .set('X-Forwarded-Proto', 'https');

  expect(response.status).toBe(200);
  expect(response.headers['strict-transport-security']).toBe('max-age=31536000');
});
