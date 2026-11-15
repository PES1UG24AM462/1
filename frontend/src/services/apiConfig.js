import axios from 'axios';
import { normalizeApiError } from './apiErrors';

export function assertSecureApiTransport(
  environment = process.env.NODE_ENV,
  protocol = window.location.protocol
) {
  if (environment === 'production' && protocol !== 'https:') {
    const error = new Error('HTTPS is required for SAMS API traffic.');
    error.code = 'INSECURE_TRANSPORT';
    throw error;
  }
}

const configuredTimeout = Number.parseInt(process.env.REACT_APP_API_TIMEOUT_MS, 10);
axios.defaults.timeout = Number.isInteger(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 10000;

axios.interceptors.request.use((config) => {
  assertSecureApiTransport();
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normalizeApiError(error))
);
