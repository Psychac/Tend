import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { reconcileSchedules, type Deps } from '@tend/application';
import { browserNotifier, type Notifier } from '../../shared/notifier';
import { REMINDER_CHECK_MS, runReminders } from './reminderEngine';
import { browserStorage, guardDatabase, type StorageControl } from '../../shared/storage';
import type { Repositories } from '@tend/contracts';
import { instantFromDate, type Clock, type Id, type IdGenerator, type UserId } from '@tend/domain';
import {
  createSqlRepositories,
  createSqlUnitOfWork,
  openLocalDatabase,
  type SqlDatabase,
} from '@tend/infrastructure';

/**
 * Phase 1 has no accounts (spec 3.5), so every record belongs to one fixed
 * local owner. Sync will reassign records to the signed-in user.
 */
export const LOCAL_OWNER_ID = '00000000-0000-4000-8000-000000000001' as UserId;

export interface AppServices {
  readonly deps: Deps;
  readonly repos: Repositories;
  /** The raw database, for whole-database operations such as backup and restore. */
  readonly db: SqlDatabase;
  /** How browser notifications are shown; replaceable in tests. */
  readonly notifier: Notifier;
  /** Persistence and usage of on-device storage; replaceable in tests. */
  readonly storage: StorageControl;
}

const systemClock: Clock = { now: () => instantFromDate(new Date()) };

const uuidGenerator: IdGenerator = {
  next<K extends string>(): Id<K> {
    return crypto.randomUUID() as Id<K>;
  },
};

export function createServices(
  db: SqlDatabase,
  notifier: Notifier = browserNotifier,
  storage: StorageControl = browserStorage,
): AppServices {
  return {
    deps: {
      ownerId: LOCAL_OWNER_ID,
      clock: systemClock,
      ids: uuidGenerator,
      uow: createSqlUnitOfWork(db),
    },
    repos: createSqlRepositories(db),
    db,
    notifier,
    storage,
  };
}

type State =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly services: AppServices }
  | { readonly status: 'error'; readonly message: string };

const AppContext = createContext<AppServices | null>(null);

interface Changes {
  /** Increases whenever data changes; screens re-query when it does. */
  readonly revision: number;
  readonly notifyChanged: () => void;
}

const ChangesContext = createContext<Changes | null>(null);

export function useApp(): AppServices {
  const services = useContext(AppContext);
  if (!services) throw new Error('useApp must be used inside <AppProvider>');
  return services;
}

export function useChanges(): Changes {
  const changes = useContext(ChangesContext);
  if (!changes) throw new Error('useChanges must be used inside <AppProvider>');
  return changes;
}

let sharedDatabase: Promise<SqlDatabase> | undefined;

/**
 * One database per file: React StrictMode mounts effects twice in development,
 * and PowerSync must not be opened twice for the same file. A failed open is
 * not cached, so a reload-free retry is possible.
 */
const openSharedDatabase = (): Promise<SqlDatabase> => {
  sharedDatabase ??= openLocalDatabase().catch((e: unknown) => {
    sharedDatabase = undefined;
    throw e;
  });
  return sharedDatabase;
};

interface Props {
  readonly children: ReactNode;
  /** Replaceable in tests. */
  readonly open?: () => Promise<SqlDatabase>;
  readonly notifier?: Notifier;
  readonly storage?: StorageControl;
}

/**
 * Opens the on-device database, then keeps schedules reconciled: once at
 * startup and whenever the app becomes visible again (spec 11). If storage
 * cannot be opened the user is told, rather than shown a broken app (spec 9.3).
 */
export function AppProvider({
  children,
  open = openSharedDatabase,
  notifier = browserNotifier,
  storage = browserStorage,
}: Props) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [storageFull, setStorageFull] = useState(false);
  const [revision, setRevision] = useState(0);
  const notifyChanged = useCallback(() => setRevision((r) => r + 1), []);
  const changes = useMemo(() => ({ revision, notifyChanged }), [revision, notifyChanged]);

  useEffect(() => {
    let cancelled = false;
    let onVisible: (() => void) | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;

    let persistenceAsked = false;
    open()
      .then((rawDb) => {
        if (cancelled) return;
        const db = guardDatabase(rawDb, {
          // Ask once, after the first thing worth keeping has been written (spec 9.3).
          onWrite: () => {
            if (persistenceAsked) return;
            persistenceAsked = true;
            void storage.requestPersistence();
          },
          onFull: () => setStorageFull(true),
        });
        const services = createServices(db, notifier, storage);
        const remind = () =>
          runReminders(services, notifier).catch((e: unknown) =>
            console.error('Reminder check failed', e),
          );
        const reconcile = () => {
          // A failed reconcile must never stop the app from working.
          reconcileSchedules(services.deps)
            .then(() => {
              if (!cancelled) notifyChanged();
              // Reminders look at what is outstanding, so they run once it is up to date.
              return remind();
            })
            .catch((e: unknown) => console.error('Schedule reconciliation failed', e));
        };
        reconcile();
        onVisible = () => {
          if (document.visibilityState === 'visible') reconcile();
        };
        document.addEventListener('visibilitychange', onVisible);
        // While the app is open, keep checking. Opening or returning to the app also checks,
        // so nothing depends on this timer running (spec 11).
        timer = setInterval(() => void remind(), REMINDER_CHECK_MS);
        setState({ status: 'ready', services });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error('Could not open local storage', e);
        setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
      });

    return () => {
      cancelled = true;
      if (onVisible) document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearInterval(timer);
    };
  }, [open, notifier, storage, notifyChanged]);

  if (state.status === 'loading') {
    return <p className="p-4 text-muted">Opening your data…</p>;
  }
  if (state.status === 'error') {
    return (
      <div
        role="alert"
        className="m-4 rounded border border-danger-line bg-danger-soft p-4 text-danger"
      >
        <h2 className="font-semibold">Your data could not be opened</h2>
        <p className="mt-1 text-sm">
          Tend stores everything on this device, and this browser would not open its storage.
          Private browsing, a full disk, or a browser without the required storage support can cause
          this. Nothing has been lost; try a regular window or another browser.
        </p>
        <p className="mt-2 text-xs text-danger">Details: {state.message}</p>
      </div>
    );
  }
  return (
    <AppContext.Provider value={state.services}>
      <ChangesContext.Provider value={changes}>
        {storageFull ? (
          <div
            role="alert"
            className="m-4 rounded border border-danger-line bg-danger-soft p-3 text-sm text-danger"
          >
            <p className="font-medium">Your last change was not saved.</p>
            <p className="mt-1">
              This device has no room left for Tend&rsquo;s data. Everything already saved is
              intact. Free up space on this device, download a backup in Settings, then try again.
            </p>
            <button type="button" className="btn mt-2" onClick={() => setStorageFull(false)}>
              Dismiss
            </button>
          </div>
        ) : null}
        {children}
      </ChangesContext.Provider>
    </AppContext.Provider>
  );
}
