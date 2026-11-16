jest.mock('../src/config/database', () => ({ pool: { execute: jest.fn() } }));

const { pool } = require('../src/config/database');
const auditModel = require('../src/models/auditModel');

beforeEach(() => jest.clearAllMocks());

describe('SAM-SR-004 audit persistence (TC-AUD-01)', () => {
  test('persists actor, action, target, metadata, and a database-generated UTC timestamp', async () => {
    pool.execute.mockResolvedValue([{}, []]);

    await auditModel.logEvent({
      actor: 'faculty1',
      action: 'LOGIN_FAILED',
      target: 'auth/login',
      ipAddress: '127.0.0.1',
      details: JSON.stringify({ outcome: 'FAILURE', requestId: 'server-request-id' }),
    });

    const [sql, values] = pool.execute.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO audit_log \(actor, action, target, ip_address, details, created_at\)/);
    expect(sql).toMatch(/UTC_TIMESTAMP\(\)/);
    expect(values).toEqual([
      'faculty1', 'LOGIN_FAILED', 'auth/login', '127.0.0.1',
      JSON.stringify({ outcome: 'FAILURE', requestId: 'server-request-id' }),
    ]);
  });

  test('filters audit history by action, actor, and inclusive UTC date range', async () => {
    pool.execute.mockResolvedValue([[], []]);

    await auditModel.listEvents({
      action: 'ATTENDANCE_CORRECTION',
      actor: 'faculty1',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      limit: 20,
      offset: 5,
    });

    const [sql, values] = pool.execute.mock.calls[0];
    expect(sql).toMatch(/action = \?/);
    expect(sql).toMatch(/actor = \?/);
    expect(sql).toMatch(/created_at >= \?/);
    expect(sql).toMatch(/created_at <= \?/);
    expect(sql).toMatch(/ORDER BY created_at DESC, audit_id DESC LIMIT \? OFFSET \?/);
    expect(values).toEqual([
      'ATTENDANCE_CORRECTION', 'faculty1',
      '2026-10-01 00:00:00', '2026-10-31 23:59:59', 20, 5,
    ]);
  });
});
