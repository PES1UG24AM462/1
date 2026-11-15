/**
 * dashboardService.js
 * SAM-F-017 — Fetch role-scoped attendance summary for the dashboard.
 */

import axios from 'axios';
import { getToken } from './authService';

function authConfig() {
  const token = getToken();
  if (!token) throw new Error('Your session has expired. Please sign in again.');
  return { headers: { Authorization: `Bearer ${token}` } };
}

/**
 * getDashboardSummary
 * Returns role-appropriate summary data from GET /api/dashboard/summary.
 *
 * @returns {Promise<{ role: string, summary: Object }>}
 */
export async function getDashboardSummary() {
  try {
    const { data } = await axios.get('/api/dashboard/summary', authConfig());
    return data;
  } catch (err) {
    throw new Error(
      err.response?.data?.message || 'Unable to load dashboard summary. Please try again.'
    );
  }
}
