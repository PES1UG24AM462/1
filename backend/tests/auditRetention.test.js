const fs = require('node:fs');
const path = require('node:path');
jest.mock('../src/config/database', () => ({ pool: { execute: jest.fn() } }));

const { pool } = require('../src/config/database');
const auditModel = require('../src/models/auditModel');

const migration = fs.readFileSync(
  path.resolve(__dirname, '../../database/migrations/20261115_audit_log_append_only.sql'),
  'utf8'
);

describe('SAM-NF-006 audit retention safeguards', () => {
  beforeEach(() => jest.clearAllMocks());

  test('the application exposes no audit update or delete operation', () => {
    expect(Object.keys(auditModel).sort()).toEqual(['listEvents', 'logEvent']);
  });

  test('the database migration rejects audit updates and deletes', () => {
    expect(migration).toMatch(/BEFORE UPDATE ON audit_log/i);
    expect(migration).toMatch(/BEFORE DELETE ON audit_log/i);
    expect(migration.match(/SIGNAL SQLSTATE '45000'/g)).toHaveLength(2);
  });

  test('new audit records use a database-generated UTC creation timestamp', async () => {
    pool.execute.mockResolvedValue([{}, []]);

    await auditModel.logEvent({
      actor: 'admin_user', action: 'USER_UPDATED', target: 'users/1',
    });

    const [sql, parameters] = pool.execute.mock.calls[0];
    expect(sql).toMatch(/VALUES \(\?, \?, \?, \?, \?, UTC_TIMESTAMP\(\)\)/);
    expect(parameters).toEqual(['admin_user', 'USER_UPDATED', 'users/1', null, null]);
  });

  test('audit history retrieval applies pagination without an age cutoff', async () => {
    const oldRecord = { auditId: 1, action: 'USER_UPDATED', createdAt: '2020-01-02 03:04:05' };
    pool.execute.mockResolvedValue([[oldRecord], []]);

    await expect(auditModel.listEvents({ limit: 10, offset: 0 })).resolves.toEqual([oldRecord]);
    const [sql, parameters] = pool.execute.mock.calls[0];
    expect(sql).toMatch(/ORDER BY created_at DESC, audit_id DESC LIMIT \? OFFSET \?/);
    expect(sql).not.toMatch(/created_at\s*(?:>=|>|BETWEEN)/i);
    expect(parameters).toEqual([10, 0]);
  });
});
