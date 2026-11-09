import type { ISODate, Weekday } from './types';

// 暦日だけを扱う（時刻・タイムゾーンなし）。内部では UTC の Date を使う。

function toUTC(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

function fromUTC(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function isISODate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return fromUTC(toUTC(s)) === s;
}

export function addDays(d: ISODate, n: number): ISODate {
  const t = toUTC(d);
  t.setUTCDate(t.getUTCDate() + n);
  return fromUTC(t);
}

export function diffDays(a: ISODate, b: ISODate): number {
  // a - b（日数）
  return Math.round((toUTC(a).getTime() - toUTC(b).getTime()) / 86_400_000);
}

export function weekdayOf(d: ISODate): Weekday {
  return toUTC(d).getUTCDay() as Weekday;
}

/** その日を含む週の月曜日。 */
export function weekStartOf(d: ISODate): ISODate {
  const wd = weekdayOf(d);
  return addDays(d, wd === 0 ? -6 : 1 - wd);
}

/** d 以降（d を含む）で最初に来る、指定した曜日の日付。 */
export function nextWeekday(d: ISODate, wd: Weekday): ISODate {
  const diff = (wd - weekdayOf(d) + 7) % 7;
  return addDays(d, diff);
}

export function monthOf(d: ISODate): number {
  return Number(d.slice(5, 7));
}

export const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 例：'11/10(月)' */
export function formatJa(d: ISODate): string {
  const [, m, day] = d.split('-').map(Number);
  return `${m}/${day}(${WEEKDAY_JA[weekdayOf(d)]})`;
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** start から end まで（両端を含む）の日付。 */
export function datesBetween(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
