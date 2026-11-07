/**
 * userController.js
 * Administrator account management (SAM-F-014, TC-ADM-01).
 *
 *   GET    /api/admin/users        list accounts
 *   POST   /api/admin/users        create a student / faculty / admin account
 *   PATCH  /api/admin/users/:id    edit name/email, reset password, activate/deactivate
 *
 * Accounts are deactivated rather than deleted so attendance history is preserved.
 * Every change is written to the audit log (SAM-SR-004). Passwords are stored only as
 * bcrypt hashes and never returned or logged (SAM-SR-002).
 */

const bcrypt = require('bcryptjs');
const validator = require('validator');
const userModel = require('../models/userModel');
const auditModel = require('../models/auditModel');

const ROLES = ['student', 'faculty', 'admin'];
const BCRYPT_COST = 12;

function clientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

function str(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/** Returns an error message, or null if the password meets policy. */
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 72) return 'Password must be at most 72 characters.';
  return null;
}

async function listUsers(_req, res) {
  try {
    const users = await userModel.listUsers();
    return res.status(200).json({ users });
  } catch (err) {
    console.error('[Users] list failed:', err.message);
    return res.status(500).json({ message: 'An internal server error occurred. Please try again.' });
  }
}

async function createUser(req, res) {
  const username = str(req.body.username);
  const fullName = str(req.body.fullName);
  const role = str(req.body.role);
  const email = str(req.body.email) || null;
  const usn = str(req.body.usn).toUpperCase() || null;
  const department = str(req.body.department) || null;
  const semester = req.body.semester === undefined || req.body.semester === '' ? null : Number(req.body.semester);

  if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
    return res.status(400).json({ message: 'Username must be 3–50 characters (letters, digits, . _ -).' });
  }
  if (!fullName || fullName.length > 100) {
    return res.status(400).json({ message: 'Full name is required (max 100 characters).' });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ message: 'Role must be student, faculty or admin.' });
  }
  if (email && (!validator.isEmail(email) || email.length > 150)) {
    return res.status(400).json({ message: 'Email address is not valid.' });
  }
  const pwProblem = passwordProblem(req.body.password);
  if (pwProblem) return res.status(400).json({ message: pwProblem });
  if (role === 'student') {
    if (!usn || !/^[A-Z0-9]{5,20}$/.test(usn)) {
      return res.status(400).json({ message: 'A valid USN is required for students.' });
    }
    if (semester !== null && (!Number.isInteger(semester) || semester < 1 || semester > 12)) {
      return res.status(400).json({ message: 'Semester must be a number between 1 and 12.' });
    }
  }

  try {
    const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_COST);
    const userId = await userModel.createUser({
      username, passwordHash, role, fullName, email,
      usn: role === 'student' ? usn : null,
      department,
      semester: role === 'student' ? semester : null,
    });
    await auditModel.logEvent({
      actor: req.user.username,
      action: 'USER_CREATED',
      target: `users/${userId}`,
      ipAddress: clientIp(req),
      details: JSON.stringify({ username, role }),
    });
    return res.status(201).json({ userId, username, role, fullName });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'That username or USN already exists.' });
    }
    console.error('[Users] create failed:', err.message);
    return res.status(500).json({ message: 'An internal server error occurred. Please try again.' });
  }
}

async function updateUser(req, res) {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: 'Invalid user id.' });
  }

  const changes = {};
  const changed = [];

  if (req.body.fullName !== undefined) {
    const fullName = str(req.body.fullName);
    if (!fullName || fullName.length > 100) {
      return res.status(400).json({ message: 'Full name must be 1–100 characters.' });
    }
    changes.fullName = fullName; changed.push('fullName');
  }
  if (req.body.email !== undefined) {
    const email = str(req.body.email) || null;
    if (email && (!validator.isEmail(email) || email.length > 150)) {
      return res.status(400).json({ message: 'Email address is not valid.' });
    }
    changes.email = email; changed.push('email');
  }
  if (req.body.isActive !== undefined) {
    if (typeof req.body.isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be true or false.' });
    }
    if (!req.body.isActive && userId === req.user.userId) {
      return res.status(400).json({ message: 'You cannot deactivate your own account.' });
    }
    changes.isActive = req.body.isActive; changed.push(req.body.isActive ? 'activated' : 'deactivated');
  }
  if (req.body.password !== undefined) {
    const pwProblem = passwordProblem(req.body.password);
    if (pwProblem) return res.status(400).json({ message: pwProblem });
  }
  if (changed.length === 0 && req.body.password === undefined) {
    return res.status(400).json({ message: 'No valid fields to update.' });
  }

  try {
    const existing = await userModel.findById(userId);
    if (!existing) return res.status(404).json({ message: 'User not found.' });

    if (req.body.password !== undefined) {
      changes.passwordHash = await bcrypt.hash(req.body.password, BCRYPT_COST);
      changed.push('passwordReset');
    }
    await userModel.updateUser(userId, changes);
    await auditModel.logEvent({
      actor: req.user.username,
      action: 'USER_UPDATED',
      target: `users/${userId}`,
      ipAddress: clientIp(req),
      details: JSON.stringify({ changed }),
    });
    return res.status(200).json({ message: 'Account updated.', userId, changed });
  } catch (err) {
    console.error('[Users] update failed:', err.message);
    return res.status(500).json({ message: 'An internal server error occurred. Please try again.' });
  }
}

module.exports = { listUsers, createUser, updateUser };
