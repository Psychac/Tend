import { validationError, type DomainError } from './errors';
import { err, ok, type Result } from './result';
import type { Brand } from './id';

/** A UTC instant as an ISO-8601 string ending in Z, e.g. 2026-11-05T09:30:00.000Z. */
export type Instant = Brand<string, 'Instant'>;
/** A calendar date with no time or zone, as YYYY-MM-DD. */
export type LocalDate = Brand<string, 'LocalDate'>;
/** An IANA timezone identifier, e.g. Asia/Kolkata. */
export type TimeZoneId = Brand<string, 'TimeZoneId'>;

export interface Clock {
  now(): Instant;
}

export const instantFromDate = (d: Date): Instant => d.toISOString() as Instant;

export function parseInstant(raw: string): Result<Instant, DomainError> {
  const d = new Date(raw);
  return raw.endsWith('Z') && !Number.isNaN(d.getTime())
    ? ok(instantFromDate(d))
    : err(validationError([{ path: 'instant', message: 'must be an ISO-8601 UTC timestamp' }]));
}

export function parseLocalDate(raw: string): Result<LocalDate, DomainError> {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d) {
      return ok(raw as LocalDate);
    }
  }
  return err(validationError([{ path: 'date', message: 'must be a valid YYYY-MM-DD date' }]));
}

export function parseTimeZone(raw: string): Result<TimeZoneId, DomainError> {
  try {
    new Intl.DateTimeFormat('en', { timeZone: raw });
    return ok(raw as TimeZoneId);
  } catch {
    return err(validationError([{ path: 'timeZone', message: 'must be an IANA timezone' }]));
  }
}

export const isBefore = (a: Instant, b: Instant): boolean => Date.parse(a) < Date.parse(b);
