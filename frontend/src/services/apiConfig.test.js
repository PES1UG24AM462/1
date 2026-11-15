import axios from 'axios';
import { login } from './authService';
import { assertSecureApiTransport } from './apiConfig';

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  sessionStorage.clear();
  jest.restoreAllMocks();
});

test('prevents login credentials from being sent from an insecure production page', async () => {
  process.env.NODE_ENV = 'production';
  const post = jest.spyOn(axios, 'post');

  await expect(login('student', 'secret')).rejects.toMatchObject({
    code: 'INSECURE_TRANSPORT',
  });
  expect(post).not.toHaveBeenCalled();
});

test('allows production API requests over HTTPS and development requests over HTTP', () => {
  expect(() => assertSecureApiTransport('production', 'https:')).not.toThrow();
  expect(() => assertSecureApiTransport('development', 'http:')).not.toThrow();
  let transportError;
  try {
    assertSecureApiTransport('production', 'http:');
  } catch (error) {
    transportError = error;
  }
  expect(transportError).toMatchObject({ code: 'INSECURE_TRANSPORT' });
});
