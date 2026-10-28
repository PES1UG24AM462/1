-- ============================================================
-- Student Attendance Management System (SAMS) — Database Schema
-- Version: 1.0.0
-- Matches: SRS v1.0, SAD v1.0
-- ============================================================

CREATE DATABASE IF NOT EXISTS student_attendance_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE student_attendance_db;

-- ─── Users ──────────────────────────────────────────────────────────────────
-- Stores all system principals: students, faculty, administrators.
-- SAM-SR-002: Only password_hash is stored; plaintext passwords are NEVER stored.
-- SAM-F-014: Accounts can be deactivated (is_active = FALSE) by administrators.
CREATE TABLE IF NOT EXISTS users (
  user_id       INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  username      VARCHAR(50)     NOT NULL,
  password_hash VARCHAR(255)    NOT NULL,               -- bcrypt salted hash
  role          ENUM('student','faculty','admin') NOT NULL,
  full_name     VARCHAR(100)    NOT NULL,
  email         VARCHAR(150)        NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_username (username)
) ENGINE=InnoDB;

-- ─── Students ───────────────────────────────────────────────────────────────
-- Extended profile for users with role = 'student'.
-- SAM-F-014: Managed by administrators.
CREATE TABLE IF NOT EXISTS students (
  student_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  usn         VARCHAR(20)  NOT NULL,   -- University Seat Number (unique identifier)
  department  VARCHAR(100)     NULL,
  semester    TINYINT UNSIGNED NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id),
  UNIQUE KEY uq_usn (usn),
  CONSTRAINT fk_student_user FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ─── Faculty ────────────────────────────────────────────────────────────────
-- Extended profile for users with role = 'faculty'.
CREATE TABLE IF NOT EXISTS faculty (
  faculty_id  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  department  VARCHAR(100)     NULL,
  designation VARCHAR(100)     NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (faculty_id),
  CONSTRAINT fk_faculty_user FOREIGN KEY (user_id) REFERENCES users (user_id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- ─── Courses ────────────────────────────────────────────────────────────────
-- SAM-F-015: Administrators manage courses.
CREATE TABLE IF NOT EXISTS courses (
  course_id   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  course_code VARCHAR(20)   NOT NULL,
  course_name VARCHAR(150)  NOT NULL,
  description TEXT              NULL,
  credits     TINYINT UNSIGNED  NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (course_id),
  UNIQUE KEY uq_course_code (course_code)
) ENGINE=InnoDB;

-- ─── Classes ────────────────────────────────────────────────────────────────
-- A class is a specific instance of a course taught by a faculty member.
-- SAM-F-015: Managed by administrators.
CREATE TABLE IF NOT EXISTS classes (
  class_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  course_id   INT UNSIGNED NOT NULL,
  faculty_id  INT UNSIGNED NOT NULL,
  section     VARCHAR(20)      NULL,
  academic_yr VARCHAR(10)      NULL,   -- e.g. '2026-27'
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (class_id),
  CONSTRAINT fk_class_course  FOREIGN KEY (course_id)  REFERENCES courses (course_id),
  CONSTRAINT fk_class_faculty FOREIGN KEY (faculty_id) REFERENCES faculty (faculty_id)
) ENGINE=InnoDB;

-- ─── Enrollments ────────────────────────────────────────────────────────────
-- Links students to classes (many-to-many).
-- SAM-F-004: Used to display the roster for attendance marking.
CREATE TABLE IF NOT EXISTS enrollments (
  enrollment_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id    INT UNSIGNED NOT NULL,
  class_id      INT UNSIGNED NOT NULL,
  enrolled_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (enrollment_id),
  UNIQUE KEY uq_enrollment (student_id, class_id),
  CONSTRAINT fk_enroll_student FOREIGN KEY (student_id) REFERENCES students (student_id),
  CONSTRAINT fk_enroll_class   FOREIGN KEY (class_id)   REFERENCES classes  (class_id)
) ENGINE=InnoDB;

-- ─── Attendance ──────────────────────────────────────────────────────────────
-- SAM-F-005: Status = Present | Absent | Late
-- SAM-F-006: UNIQUE constraint on (student_id, class_id, attendance_date)
--            prevents duplicate records for the same session.
-- SAM-F-007: edited_at and edited_by track the latest correction; each correction is
--            also appended to audit_log with previous/new status and a UTC timestamp.
CREATE TABLE IF NOT EXISTS attendance (
  attendance_id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id      INT UNSIGNED NOT NULL,
  class_id        INT UNSIGNED NOT NULL,
  attendance_date DATE         NOT NULL,
  status          ENUM('Present','Absent','Late') NOT NULL,
  recorded_by     INT UNSIGNED NOT NULL,           -- faculty user_id
  recorded_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_by       INT UNSIGNED     NULL,           -- user_id of editor (corrections)
  edited_at       DATETIME         NULL,
  PRIMARY KEY (attendance_id),
  UNIQUE KEY uq_attendance (student_id, class_id, attendance_date),  -- SAM-F-006
  CONSTRAINT fk_att_student    FOREIGN KEY (student_id)  REFERENCES students (student_id),
  CONSTRAINT fk_att_class      FOREIGN KEY (class_id)    REFERENCES classes  (class_id),
  CONSTRAINT fk_att_recorded   FOREIGN KEY (recorded_by) REFERENCES users    (user_id),
  CONSTRAINT fk_att_edited     FOREIGN KEY (edited_by)   REFERENCES users    (user_id)
) ENGINE=InnoDB;

-- ─── Audit Log ──────────────────────────────────────────────────────────────
-- SAM-F-016  / SAM-SR-004: All security-relevant events, attendance corrections,
--            and admin changes are recorded here.
-- SAM-NF-006: Retained for at least one academic year.
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor       VARCHAR(100)        NULL,   -- username or NULL for anonymous
  action      VARCHAR(100)    NOT NULL,   -- e.g. LOGIN_SUCCESS, LOGIN_FAILURE, ATTENDANCE_EDIT
  target      VARCHAR(255)    NOT NULL,   -- e.g. users/42, attendance/17
  ip_address  VARCHAR(45)         NULL,   -- IPv4 or IPv6
  details     TEXT                NULL,   -- optional JSON/text detail
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audit_id),
  INDEX idx_audit_actor  (actor),
  INDEX idx_audit_action (action),
  INDEX idx_audit_time   (created_at)
) ENGINE=InnoDB;
