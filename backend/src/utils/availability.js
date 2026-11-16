function toTimestamp(value, label) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new TypeError(`${label} must be a valid date or timestamp.`);
  }
  return timestamp;
}

function normalizeIntervals(intervals, windowStart, windowEnd, label) {
  if (!Array.isArray(intervals)) throw new TypeError(`${label} must be an array.`);
  return intervals
    .map((interval) => {
      if (!interval || typeof interval !== 'object') {
        throw new TypeError(`${label} entries must have start and end values.`);
      }
      const start = toTimestamp(interval.start, `${label} start`);
      const end = toTimestamp(interval.end, `${label} end`);
      if (end <= start) throw new RangeError(`${label} intervals must have positive duration.`);
      return {
        start: Math.max(start, windowStart),
        end: Math.min(end, windowEnd),
      };
    })
    .filter((interval) => interval.end > interval.start)
    .sort((left, right) => left.start - right.start);
}

function mergeIntervals(intervals) {
  return intervals.reduce((merged, interval) => {
    const previous = merged[merged.length - 1];
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
    } else {
      previous.end = Math.max(previous.end, interval.end);
    }
    return merged;
  }, []);
}

function totalDuration(intervals) {
  return intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);
}

function overlapDuration(leftIntervals, rightIntervals) {
  let total = 0;
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < leftIntervals.length && rightIndex < rightIntervals.length) {
    const left = leftIntervals[leftIndex];
    const right = rightIntervals[rightIndex];
    total += Math.max(0, Math.min(left.end, right.end) - Math.max(left.start, right.start));
    if (left.end <= right.end) leftIndex += 1;
    else rightIndex += 1;
  }
  return total;
}

/**
 * Calculate availability from recorded incident intervals and approved
 * scheduled-maintenance intervals. Missing monitoring coverage is explicitly
 * reported as incomplete; it is never treated as a successful month.
 */
function calculateAvailability({
  periodStart,
  periodEnd,
  unavailableIntervals = [],
  scheduledMaintenanceIntervals = [],
  monitoringComplete = false,
}) {
  const start = toTimestamp(periodStart, 'periodStart');
  const end = toTimestamp(periodEnd, 'periodEnd');
  if (end <= start) throw new RangeError('The measurement period must have positive duration.');

  const periodMs = end - start;
  const maintenance = mergeIntervals(normalizeIntervals(
    scheduledMaintenanceIntervals, start, end, 'scheduledMaintenanceIntervals'
  ));
  const outages = mergeIntervals(normalizeIntervals(
    unavailableIntervals, start, end, 'unavailableIntervals'
  ));
  const excludedMaintenanceMs = totalDuration(maintenance);
  const measuredMs = periodMs - excludedMaintenanceMs;
  if (measuredMs <= 0) {
    throw new RangeError('Scheduled maintenance must not cover the full measurement period.');
  }

  const unavailableMs = Math.max(
    0,
    totalDuration(outages) - overlapDuration(outages, maintenance)
  );
  const complete = monitoringComplete === true;

  return {
    status: complete ? 'measured' : 'incomplete',
    availabilityPercent: complete ? ((measuredMs - unavailableMs) / measuredMs) * 100 : null,
    periodMs,
    measuredMs,
    excludedMaintenanceMs,
    unavailableMs,
  };
}

function calendarMonthWindow(year, month) {
  if (!Number.isInteger(year) || year < 100 || year > 9999) {
    throw new RangeError('year must be an integer between 100 and 9999.');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError('month must be an integer from 1 through 12.');
  }
  return {
    periodStart: new Date(Date.UTC(year, month - 1, 1)),
    periodEnd: new Date(Date.UTC(year, month, 1)),
  };
}

module.exports = { calculateAvailability, calendarMonthWindow };
