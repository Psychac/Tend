import { useMemo, useState } from 'react';

const STORAGE_KEY = 'upkeep.defaultCurrency';
const FALLBACK_DEFAULT = 'INR';

/** Used only when the runtime cannot list currencies. */
const COMMON = ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'AED', 'SGD'];

/** A per-device preference; the app works without it (private windows can block storage). */
export function getDefaultCurrency(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? FALLBACK_DEFAULT;
  } catch {
    return FALLBACK_DEFAULT;
  }
}

export function setDefaultCurrency(code: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, code);
  } catch {
    // Not persisted; the choice still applies until the page closes.
  }
}

interface CurrencyOption {
  readonly code: string;
  readonly name: string;
}

function currencyOptions(): CurrencyOption[] {
  const codes =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency') : COMMON;
  let names: Intl.DisplayNames | undefined;
  try {
    names = new Intl.DisplayNames(undefined, { type: 'currency' });
  } catch {
    names = undefined;
  }
  return codes.map((code) => ({ code, name: names?.of(code) ?? code }));
}

interface SelectProps {
  readonly value: string;
  readonly onChange: (code: string) => void;
  readonly label: string;
}

export function CurrencySelect({ value, onChange, label }: SelectProps) {
  const options = useMemo(currencyOptions, []);
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 block rounded border border-slate-300 px-2 py-1"
    >
      {options.some((o) => o.code === value) ? null : <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o.code} value={o.code}>
          {o.code} – {o.name}
        </option>
      ))}
    </select>
  );
}

export interface MoneyState {
  readonly amount: string;
  readonly currency: string;
}

/** Form state for an amount plus its currency, starting from the device's default currency. */
export function useMoneyState(): [MoneyState, (next: Partial<MoneyState>) => void] {
  const [state, setState] = useState<MoneyState>(() => ({
    amount: '',
    currency: getDefaultCurrency(),
  }));
  return [state, (next) => setState((s) => ({ ...s, ...next }))];
}

interface FieldProps {
  readonly label: string;
  readonly value: MoneyState;
  readonly onChange: (next: Partial<MoneyState>) => void;
}

/** An amount box and a currency picker side by side. */
export function MoneyField({ label, value, onChange }: FieldProps) {
  return (
    <div className="text-sm">
      <label>
        {label}
        <input
          inputMode="decimal"
          value={value.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          className="mt-1 block w-40 rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <CurrencySelect
        label={`${label} currency`}
        value={value.currency}
        onChange={(currency) => onChange({ currency })}
      />
    </div>
  );
}
