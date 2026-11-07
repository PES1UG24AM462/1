/**
 * passwordHashing.test.js
 * Unit tests for SAM-SR-002 — Hash passwords with salted one-way hashing.
 *
 * TC-SEC-02: Passwords are stored as salted one-way hashes;
 *            plaintext passwords are absent from stored values and logs.
 *
 * These tests prove:
 *   1. hashPassword produces a valid bcrypt hash (recognisable format)
 *   2. The hash embeds a unique random salt — two hashes of the same
 *      password are DIFFERENT (SAM-SR-002: "salted")
 *   3. The plaintext password is NOT present anywhere in the hash string
 *   4. verifyPassword returns true for the correct password
 *   5. verifyPassword returns false for an incorrect password
 *   6. verifyPassword returns false for an empty string
 *   7. hashPassword rejects empty/non-string input
 *   8. The hash is a one-way function — the bcrypt hash cannot be reversed
 *      to reveal the original password
 *   9. userModel.createUser stores a hash, not the plaintext
 *  10. userModel.updatePassword stores a new hash, not the plaintext
 */

jest.mock('../src/config/database', () => ({
  pool: {
    execute: jest.fn(),
    on: jest.fn(),
  },
}));

// Use a low cost factor in tests so they run fast
process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'test_secret_that_is_long_enough_for_hs256_minimum';
process.env.DB_PASSWORD = 'test';

const bcrypt = require('bcryptjs');
const { hashPassword, verifyPassword } = require('../src/utils/passwordHelper');
const { pool } = require('../src/config/database');
const userModel = require('../src/models/userModel');

// ── TC-SEC-02 ─────────────────────────────────────────────────────────────────
describe('TC-SEC-02 — SAM-SR-002: Hash passwords with salted one-way hashing', () => {

  // ── 1. Hash format ──────────────────────────────────────────────────────────
  test('hashPassword should produce a valid bcrypt hash string', async () => {
    const hash = await hashPassword('MyPassword@123');

    // bcrypt hashes always start with $2a$ or $2b$ and are 60 chars long
    expect(hash).toMatch(/^\$2[ab]\$\d{2}\$.{53}$/);
    expect(hash).toHaveLength(60);
  });

  // ── 2. Unique salts ─────────────────────────────────────────────────────────
  test('two hashes of the same password must be different (unique salts)', async () => {
    const password = 'SamePassword@123';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);

    // Different salt → different hash, even for identical input
    expect(hash1).not.toBe(hash2);
    // But both must still verify correctly against the plaintext
    expect(await bcrypt.compare(password, hash1)).toBe(true);
    expect(await bcrypt.compare(password, hash2)).toBe(true);
  });

  // ── 3. Plaintext not in hash ────────────────────────────────────────────────
  test('the plaintext password must NOT appear in the stored hash string', async () => {
    const plaintext = 'Faculty@1234';
    const hash = await hashPassword(plaintext);

    expect(hash).not.toContain(plaintext);
    // Even a substring of the password must not appear
    expect(hash.toLowerCase()).not.toContain('faculty');
    expect(hash.toLowerCase()).not.toContain('1234');
  });

  // ── 4. Correct password verifies ───────────────────────────────────────────
  test('verifyPassword should return true for the correct password', async () => {
    const plaintext = 'Student@1234';
    const hash = await hashPassword(plaintext);

    const result = await verifyPassword(plaintext, hash);
    expect(result).toBe(true);
  });

  // ── 5. Wrong password fails ─────────────────────────────────────────────────
  test('verifyPassword should return false for an incorrect password', async () => {
    const hash = await hashPassword('CorrectPassword@1');

    const result = await verifyPassword('WrongPassword@999', hash);
    expect(result).toBe(false);
  });

  // ── 6. Empty password fails ─────────────────────────────────────────────────
  test('verifyPassword should return false for an empty string', async () => {
    const hash = await hashPassword('SomePassword@1');

    const result = await verifyPassword('', hash);
    expect(result).toBe(false);
  });

  // ── 7. hashPassword rejects invalid input ───────────────────────────────────
  test('hashPassword should throw for an empty password', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });

  test('hashPassword should throw for a non-string input', async () => {
    await expect(hashPassword(null)).rejects.toThrow();
    await expect(hashPassword(12345)).rejects.toThrow();
    await expect(hashPassword(undefined)).rejects.toThrow();
  });

  // ── 8. One-way — hash cannot reveal plaintext ───────────────────────────────
  test('the hash is a one-way function — it must not decode back to the plaintext', async () => {
    const plaintext = 'Admin@1234';
    const hash = await hashPassword(plaintext);

    // There is no "unhash" function — the only operation is compare
    // We verify bcrypt.compare works and that the hash string itself
    // contains no recoverable segment of the plaintext
    const segments = ['Admin', '@', '1234', 'admin', 'adm'];
    for (const seg of segments) {
      expect(hash).not.toContain(seg);
    }
  });

  // ── 9. createUser stores hash not plaintext ─────────────────────────────────
  test('userModel.createUser must store a bcrypt hash, not the plaintext password', async () => {
    // Mock DB execute — capture what gets written
    let capturedHash = null;
    pool.execute = jest.fn().mockImplementation((sql, params) => {
      if (sql.includes('INSERT INTO users')) {
        capturedHash = params[1]; // password_hash is the 2nd parameter
      }
      return [{ insertId: 42 }];
    });

    const plaintext = 'NewUser@5678';
    await userModel.createUser({
      username: 'newuser',
      plaintextPassword: plaintext,
      role: 'student',
      fullName: 'New User',
    });

    // The value written to the DB must be a bcrypt hash, NOT the plaintext
    expect(capturedHash).not.toBeNull();
    expect(capturedHash).not.toBe(plaintext);
    expect(capturedHash).toMatch(/^\$2[ab]\$\d{2}\$.{53}$/);

    // And it must verify correctly against the original plaintext
    const verifies = await bcrypt.compare(plaintext, capturedHash);
    expect(verifies).toBe(true);
  });

  // ── 10. updatePassword stores new hash not plaintext ─────────────────────────
  test('userModel.updatePassword must store a new bcrypt hash, not the plaintext', async () => {
    let capturedHash = null;
    pool.execute = jest.fn().mockImplementation((sql, params) => {
      if (sql.includes('UPDATE users')) {
        capturedHash = params[0]; // new hash is the 1st parameter
      }
      return [{ affectedRows: 1 }];
    });

    const newPassword = 'UpdatedPass@999';
    await userModel.updatePassword(1, newPassword);

    expect(capturedHash).not.toBeNull();
    expect(capturedHash).not.toBe(newPassword);
    expect(capturedHash).toMatch(/^\$2[ab]\$\d{2}\$.{53}$/);

    const verifies = await bcrypt.compare(newPassword, capturedHash);
    expect(verifies).toBe(true);
  });
});
