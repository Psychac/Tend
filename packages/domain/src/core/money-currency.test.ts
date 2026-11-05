import { currencyExponent, formatMoney, parseMoney, totalsByCurrency } from './money';

describe('currencyExponent', () => {
  it('knows decimal places per currency', () => {
    expect(currencyExponent('INR')).toBe(2);
    expect(currencyExponent('USD')).toBe(2);
    expect(currencyExponent('JPY')).toBe(0);
    expect(currencyExponent('KWD')).toBe(3);
  });
});

describe('parseMoney', () => {
  it('converts typed amounts to minor units exactly', () => {
    expect(parseMoney('1500', 'INR')).toEqual({
      ok: true,
      value: { minor: 150000, currency: 'INR' },
    });
    expect(parseMoney('1,500.5', 'USD')).toEqual({
      ok: true,
      value: { minor: 150050, currency: 'USD' },
    });
    expect(parseMoney('0.07', 'EUR')).toEqual({ ok: true, value: { minor: 7, currency: 'EUR' } });
    expect(parseMoney('1500', 'JPY')).toEqual({
      ok: true,
      value: { minor: 1500, currency: 'JPY' },
    });
    expect(parseMoney('1.234', 'KWD')).toEqual({
      ok: true,
      value: { minor: 1234, currency: 'KWD' },
    });
  });

  it('avoids floating-point rounding errors', () => {
    // 1.15 * 100 === 114.99999999999999 in floating point.
    expect(parseMoney('1.15', 'USD')).toEqual({ ok: true, value: { minor: 115, currency: 'USD' } });
  });

  it('refuses more decimals than the currency has, instead of rounding', () => {
    const jpy = parseMoney('10.5', 'JPY');
    expect(!jpy.ok && jpy.error.issues[0]?.message).toBe('JPY has no decimal places');
    const usd = parseMoney('1.234', 'USD');
    expect(!usd.ok && usd.error.issues[0]?.message).toBe('USD allows at most 2 decimal places');
  });

  it('refuses negatives, blanks and junk', () => {
    for (const bad of ['-5', '', 'abc', '1.2.3', '1e3']) {
      expect(parseMoney(bad, 'INR').ok).toBe(false);
    }
  });

  it('refuses an invalid currency code', () => {
    expect(parseMoney('5', 'rupees').ok).toBe(false);
  });
});

describe('formatMoney', () => {
  it('formats using the currency symbol and its decimal places', () => {
    expect(formatMoney({ minor: 150050, currency: 'USD' }, 'en-US')).toBe('$1,500.50');
    expect(formatMoney({ minor: 1500, currency: 'JPY' }, 'en-US')).toBe('¥1,500');
    expect(formatMoney({ minor: 1234, currency: 'KWD' }, 'en-US')).toContain('1.234');
  });

  it('falls back to the code for an unknown currency', () => {
    expect(formatMoney({ minor: 1234, currency: 'ZZZ' }, 'en-US')).toContain('12.34');
  });
});

describe('totalsByCurrency', () => {
  it('sums each currency separately', () => {
    const totals = totalsByCurrency([
      { minor: 100, currency: 'INR' },
      { minor: 250, currency: 'USD' },
      { minor: 50, currency: 'INR' },
    ]);
    expect(totals).toEqual([
      { currency: 'INR', minor: 150 },
      { currency: 'USD', minor: 250 },
    ]);
  });

  it('is empty for no amounts', () => {
    expect(totalsByCurrency([])).toEqual([]);
  });
});
