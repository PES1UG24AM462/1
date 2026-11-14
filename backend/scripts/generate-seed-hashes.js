/**
 * generate-seed-hashes.js
 * Generates fresh bcrypt hashes for the seed users.
 *
 * SAM-SR-002 — Demonstrates that all stored passwords use salted one-way hashing.
 *
 * Usage:
 *   node scripts/generate-seed-hashes.js
 *
 * Output: ready-to-paste SQL VALUES with fresh bcrypt hashes.
 * Re-run this whenever you need to reset dev seed passwords.
 */

'use strict';

const { hashPassword, SALT_ROUNDS } = require('../src/utils/passwordHelper');

// Dev credentials — for local/test use ONLY
const SEED_USERS = [
  { username: 'admin_user', password: 'Admin@1234',   role: 'admin' },
  { username: 'faculty1',   password: 'Faculty@1234', role: 'faculty' },
  { username: 'student1',   password: 'Student@1234', role: 'student' },
];

(async () => {
  console.log(`\nGenerating bcrypt hashes (cost factor: ${SALT_ROUNDS})...\n`);

  for (const user of SEED_USERS) {
    const hash = await hashPassword(user.password);
    // Verify the hash is valid (sanity check)
    const bcrypt = require('bcryptjs');
    const valid = await bcrypt.compare(user.password, hash);
    console.log(`Username : ${user.username}`);
    console.log(`Password : ${user.password}  (plaintext — never store this)`);
    console.log(`Hash     : ${hash}`);
    console.log(`Verified : ${valid ? '✓ OK' : '✗ FAILED'}`);
    console.log('');
  }

  console.log('Copy the hashes above into database/seed.sql\n');
})();
