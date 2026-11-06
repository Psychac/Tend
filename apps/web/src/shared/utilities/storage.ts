import type { AttachmentStorage } from '@tend/contracts';
import type { SqlDatabase, SqlExecutor } from '@tend/infrastructure';

/** Thrown instead of the browser's own error when a write could not be stored. */
export class StorageFullError extends Error {
  constructor(cause?: unknown) {
    super(
      'This device has no room left to save that. The change was not saved and your existing data is unchanged.',
      { cause },
    );
    this.name = 'StorageFullError';
  }
}

/** Browsers report a full or evicted store in several shapes. */
export function isQuotaError(e: unknown): boolean {
  if (e instanceof StorageFullError) return true;
  if (typeof e !== 'object' || e === null) return false;
  const { name, code, message } = e as { name?: unknown; code?: unknown; message?: unknown };
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  if (code === 22 || code === 1014) return true;
  return (
    typeof message === 'string' &&
    /quota|disk is full|database or disk is full|SQLITE_FULL/i.test(message)
  );
}

export interface StorageHooks {
  /** A write was committed. */
  readonly onWrite?: () => void;
  /** A write failed because storage is full. The write was rolled back. */
  readonly onFull?: () => void;
}

/**
 * Wraps a database so a full store is explained rather than surfaced as a raw browser
 * error. Writes already run in a transaction, so a failed one leaves data as it was.
 */
export function guardDatabase(db: SqlDatabase, hooks: StorageHooks = {}): SqlDatabase {
  return {
    getAll: (sql, params) => db.getAll(sql, params),
    execute: (sql, params) => db.execute(sql, params),
    async writeTransaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      try {
        const result = await db.writeTransaction(work);
        hooks.onWrite?.();
        return result;
      } catch (e) {
        if (isQuotaError(e)) {
          hooks.onFull?.();
          throw new StorageFullError(e);
        }
        throw e;
      }
    },
  };
}

/**
 * Wraps attachment storage like `guardDatabase`: a file that does not fit is reported as full
 * storage, with nothing kept, instead of surfacing as a raw browser error.
 */
export function guardFiles(files: AttachmentStorage, hooks: StorageHooks = {}): AttachmentStorage {
  return {
    ...files,
    async put(id, data) {
      try {
        await files.put(id, data);
        hooks.onWrite?.();
      } catch (e) {
        if (isQuotaError(e)) {
          hooks.onFull?.();
          throw new StorageFullError(e);
        }
        throw e;
      }
    },
  };
}

// ---------------------------------------------------------------- persistence and usage

export interface StorageStatus {
  /** 'unsupported' where the browser has no persistent-storage API. */
  readonly persistence: 'persistent' | 'best-effort' | 'unsupported';
  readonly usedBytes: number | null;
  readonly quotaBytes: number | null;
}

/** What the browser says about this site's storage. Replaceable in tests. */
export interface StorageControl {
  status(): Promise<StorageStatus>;
  /** Asks the browser to protect stored data from automatic clean-up. It may refuse. */
  requestPersistence(): Promise<boolean>;
}

export const browserStorage: StorageControl = {
  async status() {
    const s = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!s) return { persistence: 'unsupported', usedBytes: null, quotaBytes: null };
    // Older browsers lack some of these, though the types say they exist.
    const api = s as Partial<StorageManager>;
    const persisted = api.persisted ? await api.persisted().catch(() => false) : undefined;
    const estimate = api.estimate ? await api.estimate().catch(() => undefined) : undefined;
    return {
      persistence:
        persisted === undefined ? 'unsupported' : persisted ? 'persistent' : 'best-effort',
      usedBytes: estimate?.usage ?? null,
      quotaBytes: estimate?.quota ?? null,
    };
  },

  async requestPersistence() {
    const s = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!s?.persist) return false;
    try {
      return (await s.persisted?.()) || (await s.persist());
    } catch {
      return false;
    }
  },
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
