/**
 * AuthContext.js
 * React context that makes the current authenticated user available
 * throughout the component tree (SAM-F-001 / SAM-F-002).
 */

import React, { createContext, useState, useContext, useCallback } from 'react';
import { login as apiLogin, logout as apiLogout, getCurrentUser } from '../services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCurrentUser());

  /**
   * Log in and update context.
   * @param {string} username
   * @param {string} password
   */
  const login = useCallback(async (username, password) => {
    const data = await apiLogin(username, password);
    setUser({
      userId: String(data.userId),
      role: data.role,
      fullName: data.fullName,
    });
    return data;
  }, []);

  /** Log out and clear context. */
  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Convenience hook */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
