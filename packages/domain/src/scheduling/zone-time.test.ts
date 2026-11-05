import type { Instant, LocalDate, TimeZoneId } from '../core';
import { instantFromLocal, localTimeOf } from './zone';

const KOLKATA = 'Asia/Kolkata' as TimeZoneId;
const NEW_YORK = 'America/New_York' as TimeZoneId;
const d = (s: string) => s as LocalDate;

describe('localTimeOf', () => {
  it('reads the wall clock in the zone', () => {
    expect(localTimeOf('2026-11-05T06:30:00.000Z' as Instant, KOLKATA)).toBe('12:00');
    expect(localTimeOf('2026-11-05T20:00:00.000Z' as Instant, KOLKATA)).toBe('01:30'); // next day
    expect(localTimeOf('2026-11-05T00:00:00.000Z' as Instant, NEW_YORK)).toBe('19:00');
  });
});

describe('instantFromLocal', () => {
  it('converts a wall-clock date and time to the exact instant', () => {
    expect(instantFromLocal(d('2026-11-05'), '12:00', KOLKATA)).toBe('2026-11-05T06:30:00.000Z');
    expect(instantFromLocal(d('2026-11-05'), '00:00', KOLKATA)).toBe('2026-11-04T18:30:00.000Z');
    expect(instantFromLocal(d('2026-11-05'), '23:59', KOLKATA)).toBe('2026-11-05T18:29:00.000Z');
  });

  it('round-trips through localTimeOf across a year of New York days', () => {
    for (let day = 0; day < 366; day += 7) {
      const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      const instant = instantFromLocal(d(date), '09:15', NEW_YORK);
      expect(localTimeOf(instant, NEW_YORK)).toBe('09:15');
    }
  });

  it('uses the right offset on both sides of daylight saving', () => {
    expect(instantFromLocal(d('2026-01-15'), '12:00', NEW_YORK)).toBe('2026-01-15T17:00:00.000Z'); // EST
    expect(instantFromLocal(d('2026-07-15'), '12:00', NEW_YORK)).toBe('2026-07-15T16:00:00.000Z'); // EDT
  });

  it('moves a time that does not exist to just after the gap', () => {
    // 2026-03-08 02:30 does not exist in New York; clocks jump from 02:00 to 03:00.
    expect(instantFromLocal(d('2026-03-08'), '02:30', NEW_YORK)).toBe('2026-03-08T07:00:00.000Z');
  });

  it('resolves a repeated time to one of its two instants', () => {
    // 2026-11-01 01:30 happens twice in New York (05:30Z and 06:30Z).
    const t = instantFromLocal(d('2026-11-01'), '01:30', NEW_YORK);
    expect(['2026-11-01T05:30:00.000Z', '2026-11-01T06:30:00.000Z']).toContain(t);
  });
});
