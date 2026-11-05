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

/**
 * How many decimal places a currency has (2 for INR, 0 for JPY, 3 for KWD),
 * taken from the runtime's ISO 4217 data. Unknown codes fall back to 2.
 */
export function currencyExponent(currency: string): number {
  try {
    return (
      new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/**
 * Converts what a person typed ("1,500.50") into minor units without going
 * through floating point. Rejects negatives, junk, and more decimal places
 * than the currency has (so "10.5" JPY is refused rather than rounded).
 */
export function parseMoney(text: string, currency: string): Result<Money, DomainError> {
  const exponent = currencyExponent(currency);
  const cleaned = text.trim().replace(/,/g, '');
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) {
    return err(validationError([{ path: 'amount', message: 'must be a positive number' }]));
  }
  const whole = match[1] as string;
  const fraction = match[2] ?? '';
  if (fraction.length > exponent) {
    return err(
      validationError([
        {
          path: 'amount',
          message:
            exponent === 0
              ? `${currency} has no decimal places`
              : `${currency} allows at most ${exponent} decimal places`,
        },
      ]),
    );
  }
  return money(Number(whole + fraction.padEnd(exponent, '0')), currency);
}

/** "₹1,500.50", "¥1,500", "$12.00": formatted for display in the viewer's locale. */
export function formatMoney(value: Money, locale?: string): string {
  const exponent = currencyExponent(value.currency);
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: value.currency,
    }).format(value.minor / 10 ** exponent);
  } catch {
    return `${(value.minor / 10 ** exponent).toFixed(exponent)} ${value.currency}`;
  }
}

/** Totals per currency; amounts in different currencies are never added together. */
export function totalsByCurrency(amounts: readonly Money[]): Money[] {
  const totals = new Map<string, number>();
  for (const a of amounts) totals.set(a.currency, (totals.get(a.currency) ?? 0) + a.minor);
  return [...totals].map(([currency, minor]) => ({ currency, minor }));
}
