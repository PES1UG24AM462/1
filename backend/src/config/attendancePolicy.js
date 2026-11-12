const DEFAULT_ATTENDANCE_THRESHOLD = 75;
const configuredThreshold = process.env.ATTENDANCE_THRESHOLD;
const parsedThreshold = configuredThreshold === undefined || configuredThreshold.trim() === ''
  ? DEFAULT_ATTENDANCE_THRESHOLD
  : Number(configuredThreshold);

if (!Number.isFinite(parsedThreshold) || parsedThreshold < 1 || parsedThreshold > 100) {
  throw new Error('ATTENDANCE_THRESHOLD must be a number between 1 and 100.');
}

module.exports = { attendanceThreshold: parsedThreshold };
