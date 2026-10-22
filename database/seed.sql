-- ============================================================
-- SAMS — Seed Data for Development / Testing
-- ============================================================
-- Passwords are pre-hashed with bcrypt (cost factor 12).
-- Plaintext equivalents (for local dev only, NOT for production):
--   admin_user  → Admin@1234
--   faculty1    → Faculty@1234
--   student1    → Student@1234
-- ============================================================

USE student_attendance_db;

-- Users
INSERT INTO users (username, password_hash, role, full_name, email, is_active) VALUES
(
  'admin_user',
  '$2a$12$8kQzQ1vXvYQj4bZD3MzLgOqjO1E5Yz9hEfUW0NJkGzLpYi6cW3Y9K',  -- Admin@1234
  'admin',
  'System Administrator',
  'admin@sams.edu',
  1
),
(
  'faculty1',
  '$2a$12$7nPwR2wYuZRk5cAE4NaLmOqiN2E6Za0iFgTV1MIkHyMqXh7dV4X8J',  -- Faculty@1234
  'faculty',
  'Dr. Ramesh Kumar',
  'ramesh.kumar@sams.edu',
  1
),
(
  'student1',
  '$2a$12$6mOvQ3vXwYQj3bYC2LzKnOrjM3D7Yb1hDfSV2NJjFyKoXg6cU2W7I',  -- Student@1234
  'student',
  'Aarav Sharma',
  'aarav.sharma@sams.edu',
  1
);

-- Faculty profile
INSERT INTO faculty (user_id, department, designation)
  SELECT user_id, 'Computer Science', 'Associate Professor'
  FROM users WHERE username = 'faculty1';

-- Student profile
INSERT INTO students (user_id, usn, department, semester)
  SELECT user_id, 'PES1UG24CS001', 'Computer Science', 3
  FROM users WHERE username = 'student1';
