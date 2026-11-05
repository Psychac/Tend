import { validationError, type DomainError, type ValidationIssue } from './errors';
import { err, ok, type Result } from './result';

/** A numeric value with an explicit unit (km, hours, mm, ...). */
export interface Quantity {
  readonly value: number;
  readonly unit: string;
}

export function quantity(value: number, unit: string): Result<Quantity, DomainError> {
  const issues: ValidationIssue[] = [];
  if (!Number.isFinite(value)) issues.push({ path: 'value', message: 'must be a finite number' });
  if (unit.trim() === '') issues.push({ path: 'unit', message: 'is required' });
  return issues.length > 0 ? err(validationError(issues)) : ok({ value, unit: unit.trim() });
}
