const { buildAttendanceReport, isValidCalendarDate } = require('../src/services/attendanceReportService');

function row(studentId, status, attendanceDate, overrides = {}) {
  return {
    classId: 10,
    courseId: 3,
    courseCode: 'CS301',
    courseName: 'Algorithms',
    section: 'B',
    academicYear: '2026-27',
    studentId,
    studentNumber: `PES${studentId}`,
    fullName: `Student ${studentId}`,
    status,
    attendanceDate,
    ...overrides,
  };
}

const reportOptions = {
  from: '2026-10-01',
  to: '2026-10-31',
  threshold: 75,
  generatedAt: '2026-11-01T10:00:00.000Z',
};

test('calendar date validation rejects impossible and malformed dates', () => {
  expect(isValidCalendarDate('2024-02-29')).toBe(true);
  expect(isValidCalendarDate('2026-02-29')).toBe(false);
  expect(isValidCalendarDate('2026-13-01')).toBe(false);
  expect(isValidCalendarDate('10/01/2026')).toBe(false);
  expect(isValidCalendarDate(['2026-10-01'])).toBe(false);
});

test('groups real attendance rows and calculates status counts and rounded percentages', () => {
  const report = buildAttendanceReport([
    row(1, 'Present', '2026-10-01'),
    row(1, 'Late', '2026-10-15'),
    row(1, 'Absent', '2026-10-31'),
    row(2, 'Present', '2026-10-01'),
    row(2, 'Present', '2026-10-15'),
    row(2, 'Present', '2026-10-31'),
    row(2, 'Absent', '2026-10-20'),
  ], reportOptions);

  expect(report.class).toEqual({
    classId: 10,
    courseId: 3,
    courseCode: 'CS301',
    courseName: 'Algorithms',
    section: 'B',
    academicYear: '2026-27',
  });
  expect(report.dateRange).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  expect(report.generatedAt).toBe('2026-11-01T10:00:00.000Z');
  expect(report.students).toEqual([
    expect.objectContaining({
      studentId: 1,
      presentCount: 1,
      lateCount: 1,
      absentCount: 1,
      attendanceCount: 2,
      eligibleClassesHeld: 3,
      attendancePercentage: 66.67,
      belowThreshold: true,
    }),
    expect.objectContaining({
      studentId: 2,
      presentCount: 3,
      lateCount: 0,
      absentCount: 1,
      attendanceCount: 3,
      eligibleClassesHeld: 4,
      attendancePercentage: 75,
      belowThreshold: false,
    }),
  ]);
  expect(report.summary).toMatchObject({
    studentCount: 2,
    totalEligibleClasses: 7,
    recordedClassDates: 4,
    totalPresent: 4,
    totalAbsent: 2,
    totalLate: 1,
    totalAttended: 5,
    overallAttendancePercentage: 71.43,
    belowThresholdCount: 1,
  });
  expect(report.threshold).toBe(75);
});

test('duplicate student/date rows do not inflate counts and cancelled or invalid records are excluded', () => {
  const report = buildAttendanceReport([
    row(1, 'Present', '2026-10-01'),
    row(1, 'Present', '2026-10-01', { attendanceId: 99 }),
    row(1, 'Cancelled', '2026-10-02'),
    row(1, 'Unknown', '2026-10-03'),
    row(1, 'Absent', '2026-10-04', { attendanceDate: '2026-02-30' }),
  ], reportOptions);

  expect(report.students).toHaveLength(1);
  expect(report.students[0]).toMatchObject({
    presentCount: 1,
    absentCount: 0,
    lateCount: 0,
    eligibleClassesHeld: 1,
    attendancePercentage: 100,
    belowThreshold: false,
  });
  expect(report.summary.recordedClassDates).toBe(1);
});

test('a valid class with no attendance records returns empty students and safe null percentages', () => {
  const report = buildAttendanceReport([row(null, null, null)], reportOptions);
  expect(report.students).toEqual([]);
  expect(report.summary.studentCount).toBe(0);
  expect(report.summary.overallAttendancePercentage).toBeNull();
  expect(report.summary.averageAttendancePercentage).toBeNull();
  expect(report.summary.belowThresholdCount).toBe(0);
});

test('returns null only when the class query itself returned no authorized class', () => {
  expect(buildAttendanceReport([], reportOptions)).toBeNull();
});
