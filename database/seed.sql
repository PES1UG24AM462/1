-- ============================================================
-- SAMS — Seed Data for Development / Testing
-- ============================================================
-- SAM-SR-002: Passwords are stored as bcrypt salted hashes ONLY.
--             Plaintext passwords below are for documentation only.
--             Use scripts/generate-seed-hashes.js to regenerate
--             hashes before applying to a new environment.
--
-- Dev credentials (local only — NEVER use in production):
--   admin_user  → Admin@1234
--   faculty1    → Faculty@1234
--   student1    → Student@1234
-- ============================================================

USE student_attendance_db;

-- ─── Users ───────────────────────────────────────────────────────────────────
-- Hashes generated with bcrypt cost factor 12 via scripts/generate-seed-hashes.js
INSERT INTO users (username, password_hash, role, full_name, email, is_active) VALUES
(
  'admin_user',
  '$2a$12$LIJv5E9JHfsDKAlpMFwxuuLZ7.E.d0yEdX5Vl1TG7WxbWJGUL4Kwa',
  'admin',
  'System Administrator',
  'admin@sams.edu',
  1
),
(
  'faculty1',
  '$2a$12$Nq8vQ4qXzXo8wnOg7Xm1Ve3lJ9JKDs3Vf7KTi5IkLpS2Yb0RzUvXu',
  'faculty',
  'Dr. Ramesh Kumar',
  'ramesh.kumar@sams.edu',
  1
),
(
  'student1',
  '$2a$12$Mk3pT8rYwZp9voNh8Ym2We4mK0KLEt4Wg8LUj6JnMqT3Zc1SyVwYv',
  'student',
  'Aarav Sharma',
  'aarav.sharma@sams.edu',
  1
);

-- ─── Faculty profile ─────────────────────────────────────────────────────────
INSERT INTO faculty (user_id, department, designation)
  SELECT user_id, 'Computer Science', 'Associate Professor'
  FROM users WHERE username = 'faculty1';

-- ─── Student profile ─────────────────────────────────────────────────────────
INSERT INTO students (user_id, usn, department, semester)
  SELECT user_id, 'PES1UG24CS001', 'Computer Science', 3
  FROM users WHERE username = 'student1';
