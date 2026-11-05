import { validationError, invariantError, type DomainError, type ValidationIssue } from './errors';
import { err, ok, type Result } from './result';

/** Money in minor units (e.g. paise, cents) to avoid floating-point error. */
export interface Money {
  readonly minor: number;
  readonly currency: string;
}

export function money(minor: number, currency: string): Result<Money, DomainError> {
  const issues: ValidationIssue[] = [];
  if (!Number.isSafeInteger(minor)) issues.push({ path: 'minor', message: 'must be an integer' });
  if (!/^[A-Z]{3}$/.test(currency)) {
    issues.push({ path: 'currency', message: 'must be a 3-letter ISO 4217 code' });
  }
  return issues.length > 0 ? err(validationError(issues)) : ok({ minor, currency });
}

export function addMoney(a: Money, b: Money): Result<Money, DomainError> {
  if (a.currency !== b.currency) return err(invariantError('Cannot add different currencies'));
  return ok({ minor: a.minor + b.minor, currency: a.currency });
}
