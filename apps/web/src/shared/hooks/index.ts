import { useEffect, useState } from 'react';
import { useApp, useChanges, type AppServices } from '../../app/providers/AppProvider';
import type { DomainError, Result, TimeZoneId } from '@tend/domain';

export type Loadable<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'error'; readonly message: string };

/** The browser's current IANA zone; decides what "today" means for the user. */
export const deviceTimeZone = (): TimeZoneId =>
  Intl.DateTimeFormat().resolvedOptions().timeZone as TimeZoneId;

/**
 * Loads data from local storage and reloads whenever anything changes. Stale
 * data stays on screen while a reload is in flight, so lists do not flicker.
 */
export function useLiveQuery<T>(load: (app: AppServices) => Promise<T>, key = ''): Loadable<T> {
  const app = useApp();
  const { revision } = useChanges();
  const [state, setState] = useState<Loadable<T>>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    load(app).then(
      (data) => {
        if (!cancelled) setState({ status: 'ready', data });
      },
      (e: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` is intentionally keyed by `key`, not identity, so callers can pass inline lambdas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app, revision, key]);

  return state;
}

/** Runs a use case, refreshes screens on success, and returns the Result for the caller to show. */
export function useAction() {
  const { notifyChanged } = useChanges();
  return async <T>(run: () => Promise<Result<T>>): Promise<Result<T>> => {
    const result = await run();
    if (result.ok) notifyChanged();
    return result;
  };
}

export const describeError = (e: DomainError): string =>
  e.issues.length > 0 ? e.issues.map((i) => `${i.path}: ${i.message}`).join('; ') : e.message;

/** "Thu 5 Nov" for a YYYY-MM-DD date, independent of the viewer's timezone. */
export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** A number that goes up every `ms`, so a screen showing "right now" can refresh as time passes. */
export function useTick(ms = 60_000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick;
}
