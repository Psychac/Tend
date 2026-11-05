import type { LocalDate } from '../core';
import type { Interval, IsoWeekday, RecurrenceUnit } from '../entities/schedule';

/**
 * Calendar arithmetic on zone-free dates. All schedule maths happens on
 * LocalDate values, so DST never shifts a due date; zones only matter when
 * converting to or from instants (see zone.ts).
 */

const MS_PER_DAY = 86_400_000;

export interface DateParts {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
}

const pad = (n: number, width: number): string => String(n).padStart(width, '0');

export function toParts(date: LocalDate): DateParts {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

export const fromParts = (year: number, month: number, day: number): LocalDate =>
  `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}` as LocalDate;

export const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

const toEpochDay = (date: LocalDate): number => {
  const { year, month, day } = toParts(date);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
};

const fromEpochDay = (epochDay: number): LocalDate => {
  const d = new Date(epochDay * MS_PER_DAY);
  return fromParts(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

export const addDays = (date: LocalDate, n: number): LocalDate =>
  fromEpochDay(toEpochDay(date) + n);

/** Adds calendar months, clamping to the end of a shorter month (Jan 31 + 1 month = Feb 28). */
export function addMonths(date: LocalDate, n: number): LocalDate {
  const { year, month, day } = toParts(date);
  const index = year * 12 + (month - 1) + n;
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  return fromParts(y, m, Math.min(day, daysInMonth(y, m)));
}

export const addYears = (date: LocalDate, n: number): LocalDate => addMonths(date, n * 12);

export function addUnits(date: LocalDate, n: number, unit: RecurrenceUnit): LocalDate {
  switch (unit) {
    case 'day':
      return addDays(date, n);
    case 'week':
      return addDays(date, n * 7);
    case 'month':
      return addMonths(date, n);
    case 'year':
      return addYears(date, n);
  }
}

export const addInterval = (date: LocalDate, interval: Interval, times = 1): LocalDate =>
  addUnits(date, interval.every * times, interval.unit);

export const daysBetween = (from: LocalDate, to: LocalDate): number =>
  toEpochDay(to) - toEpochDay(from);

export function isoWeekday(date: LocalDate): IsoWeekday {
  const w = new Date(toEpochDay(date) * MS_PER_DAY).getUTCDay();
  return (w === 0 ? 7 : w) as IsoWeekday;
}

export const startOfIsoWeek = (date: LocalDate): LocalDate => addDays(date, 1 - isoWeekday(date));

export const maxDate = (a: LocalDate, b: LocalDate): LocalDate => (a >= b ? a : b);
