import { addMoney, money } from './money';
import { parseId } from './id';
import { quantity } from './quantity';
import { parseInstant, parseLocalDate, parseTimeZone } from './time';

describe('parseId', () => {
  it('accepts a lowercase UUID', () => {
    expect(parseId('Asset', '11111111-1111-4111-8111-111111111111').ok).toBe(true);
  });

  it('rejects anything else', () => {
    expect(parseId('Asset', 'not-an-id').ok).toBe(false);
    expect(parseId('Asset', '11111111-1111-4111-8111-11111111111G').ok).toBe(false);
  });
});

describe('time parsing', () => {
  it('accepts UTC instants and rejects offsets or garbage', () => {
    expect(parseInstant('2026-11-05T09:30:00Z').ok).toBe(true);
    expect(parseInstant('2026-11-05T09:30:00+05:30').ok).toBe(false);
    expect(parseInstant('yesterday').ok).toBe(false);
  });

  it('validates real calendar dates', () => {
    expect(parseLocalDate('2028-02-29').ok).toBe(true);
    expect(parseLocalDate('2027-02-29').ok).toBe(false);
    expect(parseLocalDate('2026-13-01').ok).toBe(false);
    expect(parseLocalDate('5 Nov 2026').ok).toBe(false);
  });

  it('validates IANA timezones', () => {
    expect(parseTimeZone('Asia/Kolkata').ok).toBe(true);
    expect(parseTimeZone('Mars/Olympus').ok).toBe(false);
  });
});

describe('money', () => {
  it('requires integer minor units and an ISO currency', () => {
    expect(money(1999, 'INR').ok).toBe(true);
    expect(money(19.99, 'INR').ok).toBe(false);
    expect(money(100, 'rupees').ok).toBe(false);
  });

  it('adds same-currency amounts and refuses mixed currencies', () => {
    const a = money(100, 'INR');
    const b = money(250, 'INR');
    const c = money(100, 'USD');
    if (!a.ok || !b.ok || !c.ok) throw new Error('setup failed');
    expect(addMoney(a.value, b.value)).toEqual({
      ok: true,
      value: { minor: 350, currency: 'INR' },
    });
    expect(addMoney(a.value, c.value).ok).toBe(false);
  });
});

describe('quantity', () => {
  it('requires a finite value and a unit', () => {
    expect(quantity(1200, 'km').ok).toBe(true);
    expect(quantity(Number.NaN, 'km').ok).toBe(false);
    expect(quantity(5, '  ').ok).toBe(false);
  });
});
