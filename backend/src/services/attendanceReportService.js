const VALID_STATUSES = new Set(['Present', 'Absent', 'Late']);

function isValidCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function roundPercentage(value) {
  return Number(value.toFixed(2));
}

/**
 * Groups filtered database rows by student and calculates the report using the
 * same (Present + Late) / recorded eligible sessions formula as SAM-F-009.
 * The unique class/student/date key prevents duplicate rows inflating counts.
 */
function buildAttendanceReport(rows, { from, to, threshold, generatedAt = new Date().toISOString() }) {
  const first = rows[0];
  if (!first) return null;

  const byStudent = new Map();
  const seenAttendanceDates = new Set();
  const recordedClassDates = new Set();

  rows.forEach((row) => {
    if (row.studentId === null || row.studentId === undefined) return;
    if (!VALID_STATUSES.has(row.status) || !isValidCalendarDate(row.attendanceDate)) return;

    const studentKey = String(row.studentId);
    const attendanceKey = `${studentKey}:${row.attendanceDate}`;
    if (seenAttendanceDates.has(attendanceKey)) return;
    seenAttendanceDates.add(attendanceKey);
    recordedClassDates.add(row.attendanceDate);

    if (!byStudent.has(studentKey)) {
      byStudent.set(studentKey, {
        studentId: Number(row.studentId),
        studentNumber: row.studentNumber || null,
        fullName: row.fullName || null,
        presentCount: 0,
        absentCount: 0,
        lateCount: 0,
        eligibleClassesHeld: 0,
      });
    }

    const student = byStudent.get(studentKey);
    student.eligibleClassesHeld += 1;
    if (row.status === 'Present') student.presentCount += 1;
    if (row.status === 'Absent') student.absentCount += 1;
    if (row.status === 'Late') student.lateCount += 1;
  });

  const students = [...byStudent.values()].map((student) => {
    const totalAttendedClasses = student.presentCount + student.lateCount;
    const attendancePercentage = student.eligibleClassesHeld === 0
      ? null
      : roundPercentage((totalAttendedClasses / student.eligibleClassesHeld) * 100);
    return {
      ...student,
      attendanceCount: totalAttendedClasses,
      attendancePercentage,
      belowThreshold: attendancePercentage !== null && attendancePercentage < threshold,
    };
  });

  const totalPresent = students.reduce((total, student) => total + student.presentCount, 0);
  const totalAbsent = students.reduce((total, student) => total + student.absentCount, 0);
  const totalLate = students.reduce((total, student) => total + student.lateCount, 0);
  const totalEligibleClasses = students.reduce((total, student) => total + student.eligibleClassesHeld, 0);
  const totalAttended = totalPresent + totalLate;
  const percentages = students.map((student) => student.attendancePercentage).filter(Number.isFinite);

  return {
    class: {
      classId: Number(first.classId),
      courseId: Number(first.courseId),
      courseCode: first.courseCode,
      courseName: first.courseName,
      section: first.section || null,
      academicYear: first.academicYear || null,
    },
    dateRange: { from, to },
    generatedAt,
    threshold,
    summary: {
      studentCount: students.length,
      totalEligibleClasses,
      recordedClassDates: recordedClassDates.size,
      totalPresent,
      totalAbsent,
      totalLate,
      totalAttended,
      overallAttendancePercentage: totalEligibleClasses === 0
        ? null
        : roundPercentage((totalAttended / totalEligibleClasses) * 100),
      averageAttendancePercentage: percentages.length === 0
        ? null
        : roundPercentage(percentages.reduce((sum, percentage) => sum + percentage, 0) / percentages.length),
      belowThresholdCount: students.filter((student) => student.belowThreshold).length,
    },
    students,
  };
}

module.exports = { buildAttendanceReport, isValidCalendarDate };
