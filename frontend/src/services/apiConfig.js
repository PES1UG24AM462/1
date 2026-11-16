import axios from 'axios';
import { normalizeApiError } from './apiErrors';

const configuredTimeout = Number.parseInt(process.env.REACT_APP_API_TIMEOUT_MS, 10);
axios.defaults.timeout = Number.isInteger(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 10000;

axios.interceptors.response.use(
  (response) => response,
  (error) => Promise.reject(normalizeApiError(error))
);
