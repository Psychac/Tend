import { render, screen, waitFor } from '@testing-library/react';
import { createActivity } from '@tend/application';
import type { SqlDatabase } from '@tend/infrastructure';
import { createNodeSqliteDatabase } from '@tend/infrastructure/testing';
import { AppProvider, createServices, useApp } from './providers/AppProvider';
import { StorageSection } from '../features/settings/StorageSection';
import {
  guardDatabase,
  isQuotaError,
  StorageFullError,
  type StorageControl,
} from '../shared/storage';

const quotaError = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' });

const fakeStorage = (over: Partial<StorageControl> = {}): StorageControl => ({
  status: () =>
    Promise.resolve({ persistence: 'best-effort', usedBytes: 2048, quotaBytes: 1048576 }),
  requestPersistence: () => Promise.resolve(true),
  ...over,
});

/** A database whose writes fail as if the device were full, after rolling back. */
function fullDatabase(real: SqlDatabase): SqlDatabase {
  return {
    getAll: (s, p) => real.getAll(s, p),
    execute: (s, p) => real.execute(s, p),
    writeTransaction: () => Promise.reject(quotaError()),
  };
}

describe('quota detection', () => {
  it('recognises the shapes browsers use', () => {
    expect(isQuotaError(quotaError())).toBe(true);
    expect(isQuotaError(new Error('database or disk is full'))).toBe(true);
    expect(isQuotaError(Object.assign(new Error('x'), { code: 22 }))).toBe(true);
    expect(isQuotaError(new Error('constraint failed'))).toBe(false);
  });
});

describe('guardDatabase', () => {
  it('turns a quota failure into a clear error, leaves data unchanged, and reports it', async () => {
    const real = createNodeSqliteDatabase();
    const onFull = vi.fn();
    const guarded = guardDatabase(fullDatabase(real), { onFull });
    const { deps, repos } = createServices(guarded, undefined, fakeStorage());

    await expect(
      createActivity(deps, { name: 'Water plants', type: 'routine' }),
    ).rejects.toBeInstanceOf(StorageFullError);
    expect(onFull).toHaveBeenCalledOnce();
    expect(await repos.activities.list({})).toHaveLength(0);
  });

  it('does not disguise other errors, and reports successful writes', async () => {
    const real = createNodeSqliteDatabase();
    const onWrite = vi.fn();
    const guarded = guardDatabase(real, { onWrite });
    await guarded.writeTransaction(async () => undefined);
    expect(onWrite).toHaveBeenCalledOnce();
    await expect(guarded.writeTransaction(() => Promise.reject(new Error('bug')))).rejects.toThrow(
      'bug',
    );
  });
});

function Writer() {
  const { deps } = useApp();
  return (
    <button
      onClick={() =>
        void createActivity(deps, { name: 'Water plants', type: 'routine' }).catch(() => undefined)
      }
    >
      add
    </button>
  );
}

describe('AppProvider storage handling', () => {
  it('asks for persistent storage after the first successful write', async () => {
    const requestPersistence = vi.fn(() => Promise.resolve(true));
    const db = createNodeSqliteDatabase();
    render(
      <AppProvider open={() => Promise.resolve(db)} storage={fakeStorage({ requestPersistence })}>
        <Writer />
      </AppProvider>,
    );
    (await screen.findByRole('button', { name: 'add' })).click();
    await waitFor(() => expect(requestPersistence).toHaveBeenCalledTimes(1));
  });

  it('tells the person the change was not saved when storage is full', async () => {
    const db = fullDatabase(createNodeSqliteDatabase());
    render(
      <AppProvider open={() => Promise.resolve(db)} storage={fakeStorage()}>
        <Writer />
      </AppProvider>,
    );
    (await screen.findByRole('button', { name: 'add' })).click();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your last change was not saved');
  });
});

describe('Settings storage section', () => {
  it('reports best-effort storage with usage and a backup nudge', async () => {
    render(
      <AppProvider open={() => Promise.resolve(createNodeSqliteDatabase())} storage={fakeStorage()}>
        <StorageSection />
      </AppProvider>,
    );
    expect(await screen.findByText(/best-effort/i)).toBeInTheDocument();
    expect(screen.getByText(/Using 2 KB of about 1.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/download a backup/i)).toBeInTheDocument();
  });

  it('reports protected storage', async () => {
    const storage = fakeStorage({
      status: () =>
        Promise.resolve({ persistence: 'persistent', usedBytes: null, quotaBytes: null }),
    });
    render(
      <AppProvider open={() => Promise.resolve(createNodeSqliteDatabase())} storage={storage}>
        <StorageSection />
      </AppProvider>,
    );
    expect(await screen.findByText(/Storage: kept/)).toBeInTheDocument();
  });
});
