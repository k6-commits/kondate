import { addDays, diffDays, formatJa, isISODate, nextWeekday, weekStartOf, weekdayOf } from './dates';

describe('dates', () => {
  it('adds days across month ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('computes weekdays and week starts (Monday)', () => {
    expect(weekdayOf('2026-11-09')).toBe(1); // 月曜
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09'); // 日曜 → その週の月曜
    expect(weekStartOf('2026-11-09')).toBe('2026-11-09');
  });
  it('finds the next weekday including today', () => {
    expect(nextWeekday('2026-11-09', 1)).toBe('2026-11-09');
    expect(nextWeekday('2026-11-09', 0)).toBe('2026-11-15');
  });
  it('formats and validates', () => {
    expect(formatJa('2026-11-10')).toBe('11/10(火)');
    expect(diffDays('2026-11-12', '2026-11-09')).toBe(3);
    expect(isISODate('2026-02-30')).toBe(false);
    expect(isISODate('2026-02-28')).toBe(true);
  });
});
