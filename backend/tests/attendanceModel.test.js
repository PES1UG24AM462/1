jest.mock('../src/config/database', () => ({
  pool: {
    getConnection: jest.fn(),
    execute: jest.fn(),
  },
}));

const { pool } = require('../src/config/database');
const attendanceModel = require('../src/models/attendanceModel');

function makeConnection({
  attendance = new Map(),
  timestamps = ['2026-10-26 10:30:15'],
  failUpdate = false,
  failAudit = false,
} = {}) {
  const queries = [];
  let timestampIndex = 0;
  const connection = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    execute: jest.fn(async (sql, params = []) => {
      queries.push({ sql, params });
      if (sql.includes('DATE_FORMAT(UTC_TIMESTAMP()')) {
        return [[{ correctionTimestamp: timestamps[timestampIndex++] }], []];
      }
      if (sql.includes('FROM attendance') && sql.includes('attendance_id = ?')) {
        const row = attendance.get(params[0]);
        const matchesSession = row
          && row.studentId === params[1]
          && row.classId === params[2]
          && row.date === params[3];
        return [matchesSession ? [{ attendanceId: row.attendanceId, status: row.status }] : [], []];
      }
      if (sql.startsWith('UPDATE attendance') || sql.includes('UPDATE attendance')) {
        if (failUpdate) throw new Error('attendance update failed');
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('INSERT INTO audit_log') && failAudit) {
        throw new Error('audit insert failed');
      }
      return [{ affectedRows: 1 }, []];
    }),
  };
  pool.getConnection.mockResolvedValue(connection);
  return { connection, queries };
}

const base = {
  classId: 10,
  date: '2026-10-22',
  recordedBy: 2,
  actor: 'faculty1',
  ipAddress: '127.0.0.1',
};

beforeEach(() => jest.clearAllMocks());

describe('SAM-F-007 attendance corrections (TC-ATT-04)', () => {
  test('updates an existing record and writes persisted old/new status with the same database timestamp', async () => {
    const { connection, queries } = makeConnection({
      attendance: new Map([[901, {
        attendanceId: 901, studentId: 81, classId: 10, date: '2026-10-22', status: 'Absent',
      }]]),
    });

    const result = await attendanceModel.saveAttendanceRecords({
      ...base,
      records: [{
        attendanceId: 901,
        studentId: 81,
        status: 'Present',
        previousStatus: 'Late',
        actor: 'spoofed-user',
        correctionTimestamp: '2099-01-01 00:00:00',
      }],
    });

    const update = queries.find(({ sql }) => sql.includes('UPDATE attendance'));
    const audit = queries.find(({ sql }) => sql.includes('INSERT INTO audit_log'));
    expect(update.sql).toContain('SET status = ?, edited_by = ?, edited_at = ?');
    expect(update.sql).not.toMatch(/attendance_date|recorded_at/);
    expect(update.params).toEqual(['Present', 2, '2026-10-26 10:30:15', 901]);
    expect(audit.params).toEqual([
      'faculty1',
      'ATTENDANCE_CORRECTION',
      'attendance/901',
      '127.0.0.1',
      JSON.stringify({ previousStatus: 'Absent', newStatus: 'Present' }),
      '2026-10-26 10:30:15',
    ]);
    expect(result).toEqual({
      savedCount: 1,
      insertedCount: 0,
      corrections: [{
        attendanceId: 901,
        previousStatus: 'Absent',
        status: 'Present',
        correctionTimestamp: '2026-10-26T10:30:15Z',
      }],
    });
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  test('preserves an audit entry for each correction in a multi-record submission', async () => {
    const { queries } = makeConnection({
      attendance: new Map([
        [901, { attendanceId: 901, studentId: 81, classId: 10, date: '2026-10-22', status: 'Absent' }],
        [902, { attendanceId: 902, studentId: 82, classId: 10, date: '2026-10-22', status: 'Late' }],
      ]),
      timestamps: ['2026-10-26 10:30:15', '2026-10-26 10:31:02'],
    });

    await attendanceModel.saveAttendanceRecords({
      ...base,
      records: [
        { attendanceId: 901, studentId: 81, status: 'Present' },
        { attendanceId: 902, studentId: 82, status: 'Present' },
      ],
    });

    const audits = queries.filter(({ sql }) => sql.includes('INSERT INTO audit_log'));
    expect(audits).toHaveLength(2);
    expect(audits.map(({ params }) => [params[2], params[4], params[5]])).toEqual([
      ['attendance/901', JSON.stringify({ previousStatus: 'Absent', newStatus: 'Present' }), '2026-10-26 10:30:15'],
      ['attendance/902', JSON.stringify({ previousStatus: 'Late', newStatus: 'Present' }), '2026-10-26 10:31:02'],
    ]);
  });

  test('does not update or create a correction audit entry for a no-op status', async () => {
    const { connection, queries } = makeConnection({
      attendance: new Map([[901, {
        attendanceId: 901, studentId: 81, classId: 10, date: '2026-10-22', status: 'Absent',
      }]]),
    });

    const result = await attendanceModel.saveAttendanceRecords({
      ...base,
      records: [{ attendanceId: 901, studentId: 81, status: 'Absent' }],
    });

    expect(queries.some(({ sql }) => sql.includes('UPDATE attendance'))).toBe(false);
    expect(queries.some(({ sql }) => sql.includes('INSERT INTO audit_log'))).toBe(false);
    expect(result.corrections).toEqual([]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test('rejects a nonexistent attendance identifier without inserting a new row', async () => {
    const { connection, queries } = makeConnection();

    await expect(attendanceModel.saveAttendanceRecords({
      ...base,
      records: [{ attendanceId: 901, studentId: 81, status: 'Present' }],
    })).rejects.toMatchObject({ code: 'ATTENDANCE_NOT_FOUND' });

    expect(queries.some(({ sql }) => sql.includes('INSERT INTO attendance'))).toBe(false);
    expect(queries.some(({ sql }) => sql.includes('INSERT INTO audit_log'))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('does not correct an attendance ID outside the selected student, class, and date', async () => {
    const { connection, queries } = makeConnection({
      attendance: new Map([[901, {
        attendanceId: 901, studentId: 99, classId: 11, date: '2026-10-23', status: 'Absent',
      }]]),
    });

    await expect(attendanceModel.saveAttendanceRecords({
      ...base,
      records: [{ attendanceId: 901, studentId: 81, status: 'Present' }],
    })).rejects.toMatchObject({ code: 'ATTENDANCE_NOT_FOUND' });

    expect(queries.some(({ sql }) => sql.includes('UPDATE attendance'))).toBe(false);
    expect(queries.some(({ sql }) => sql.includes('INSERT INTO audit_log'))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  test('rolls back the attendance update when audit insertion fails', async () => {
    const { connection } = makeConnection({
      attendance: new Map([[901, {
        attendanceId: 901, studentId: 81, classId: 10, date: '2026-10-22', status: 'Absent',
      }]]),
      failAudit: true,
    });

    await expect(attendanceModel.saveAttendanceRecords({
      ...base,
      records: [{ attendanceId: 901, studentId: 81, status: 'Present' }],
    })).rejects.toThrow('audit insert failed');

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('does not write an audit entry when the attendance update fails', async () => {
    const { connection, queries } = makeConnection({
      attendance: new Map([[901, {
        attendanceId: 901, studentId: 81, classId: 10, date: '2026-10-22', status: 'Absent',
      }]]),
      failUpdate: true,
    });

    await expect(attendanceModel.saveAttendanceRecords({
      ...base,
      records: [{ attendanceId: 901, studentId: 81, status: 'Present' }],
    })).rejects.toThrow('attendance update failed');

    expect(queries.some(({ sql }) => sql.includes('INSERT INTO audit_log'))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
