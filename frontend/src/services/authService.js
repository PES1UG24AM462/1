/**
 * authService.js
 * API calls for authentication (SAM-F-001).
 *
 * All requests go to the Express backend over HTTPS/TLS in production
 * (SAM-NF-003 / SAM-SR-001).  In development the CRA proxy routes to
 * http://localhost:5000.
 *
 * Token is stored in memory and sessionStorage (not localStorage) to
 * reduce XSS exposure surface.
 */

import axios from 'axios';

const API_BASE = '/api/auth';

// In-memory token store (cleared on page reload — intentional for security)
let _token = null;

/**
 * Login: POST /api/auth/login
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{token: string, role: string, userId: number, fullName: string}>}
 * @throws {Error} with a user-readable message on failure
 */
export async function login(username, password) {
  try {
    const { data } = await axios.post(`${API_BASE}/login`, { username, password });
    _token = data.token;
    // Store in sessionStorage so the user stays logged in on refresh
    // but the token is cleared when the browser tab is closed.
    sessionStorage.setItem('sam_token', data.token);
    sessionStorage.setItem('sam_role', data.role);
    sessionStorage.setItem('sam_user_id', String(data.userId));
    sessionStorage.setItem('sam_full_name', data.fullName);
    return data;
  } catch (err) {
    // Surface the server's message when available; fall back to a generic one.
    const serverMessage = err.response?.data?.message;
    throw new Error(serverMessage || 'Login failed. Please try again.');
  }
}

/**
 * Logout: clear token from memory and storage.
 */
export function logout() {
  _token = null;
  sessionStorage.removeItem('sam_token');
  sessionStorage.removeItem('sam_role');
  sessionStorage.removeItem('sam_user_id');
  sessionStorage.removeItem('sam_full_name');
}

/**
 * Retrieve the stored token (from memory or sessionStorage after a reload).
 * @returns {string|null}
 */
export function getToken() {
  if (!_token) {
    _token = sessionStorage.getItem('sam_token');
  }
  return _token;
}

/**
 * Returns the currently authenticated user's basic profile, or null if not logged in.
 * @returns {{userId: string, role: string, fullName: string}|null}
 */
export function getCurrentUser() {
  const token = getToken();
  if (!token) return null;
  return {
    userId: sessionStorage.getItem('sam_user_id'),
    role: sessionStorage.getItem('sam_role'),
    fullName: sessionStorage.getItem('sam_full_name'),
  };
}
