const { calculateAvailability, calendarMonthWindow } = require('../src/utils/availability');

const hour = 60 * 60 * 1000;

function month(year, monthNumber, options = {}) {
  return calculateAvailability({
    ...calendarMonthWindow(year, monthNumber),
    monitoringComplete: true,
    ...options,
  });
}

describe('SAM-NF-002 availability measurement', () => {
  test.each([
    [2026, 4, 30],
    [2026, 1, 31],
    [2024, 2, 29],
    [2025, 2, 28],
  ])('uses the calendar length for %s-%s', (year, monthNumber, expectedDays) => {
    const { periodStart, periodEnd } = calendarMonthWindow(year, monthNumber);
    expect((periodEnd - periodStart) / (24 * hour)).toBe(expectedDays);
  });

  test.each([
    [2026, 4, 3.6],
    [2026, 1, 3.72],
    [2024, 2, 3.48],
    [2025, 2, 3.36],
  ])('a qualifying outage in %s-%s measures exactly 99.5%', (year, monthNumber, outageHours) => {
    const { periodStart } = calendarMonthWindow(year, monthNumber);
    const result = month(year, monthNumber, {
      unavailableIntervals: [{ start: periodStart, end: new Date(periodStart.getTime() + outageHours * hour) }],
    });
    expect(result.availabilityPercent).toBeCloseTo(99.5, 10);
  });

  test('counts overlapping outage records once and excludes scheduled maintenance', () => {
    const { periodStart } = calendarMonthWindow(2026, 4);
    const result = month(2026, 4, {
      unavailableIntervals: [
        { start: new Date(periodStart.getTime() + hour), end: new Date(periodStart.getTime() + 3 * hour) },
        { start: new Date(periodStart.getTime() + 2 * hour), end: new Date(periodStart.getTime() + 4 * hour) },
      ],
      scheduledMaintenanceIntervals: [
        { start: new Date(periodStart.getTime() + 2.5 * hour), end: new Date(periodStart.getTime() + 3.5 * hour) },
      ],
    });
    expect(result.unavailableMs).toBe(2 * hour);
    expect(result.excludedMaintenanceMs).toBe(hour);
    expect(result.measuredMs).toBe(result.periodMs - hour);
  });

  test('missing monitor coverage is incomplete, not 100% availability', () => {
    const result = calculateAvailability(calendarMonthWindow(2026, 4));
    expect(result.status).toBe('incomplete');
    expect(result.availabilityPercent).toBeNull();
  });

  test('rejects invalid or zero measurement periods', () => {
    expect(() => calculateAvailability({ periodStart: '2026-04-01', periodEnd: '2026-04-01' }))
      .toThrow('positive duration');
    expect(() => calculateAvailability({ periodStart: 'bad', periodEnd: '2026-04-02' }))
      .toThrow('periodStart');
  });

  test('rejects invalid outage intervals and fully excluded periods', () => {
    const { periodStart, periodEnd } = calendarMonthWindow(2026, 4);
    expect(() => calculateAvailability({
      periodStart,
      periodEnd,
      unavailableIntervals: [{ start: periodEnd, end: periodStart }],
    })).toThrow('positive duration');
    expect(() => calculateAvailability({
      periodStart,
      periodEnd,
      scheduledMaintenanceIntervals: [{ start: periodStart, end: periodEnd }],
    })).toThrow('full measurement period');
  });
});
