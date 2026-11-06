import { render, screen, within } from '@testing-library/react';
import type { SyncStatus, SyncStatusSource } from '@tend/contracts';
import { SyncIndicator } from '../shared/ui/SyncIndicator';
import { AppProvider } from './providers/AppProvider';
import { createNodeSqliteDatabase } from '@tend/infrastructure/testing';
import { renderApp } from './test-utils';

describe('sync status indicator', () => {
  it.each(['/', '/activities', '/calendar', '/history', '/insights', '/settings'])(
    'is visible on %s and says data is only on this device',
    async (path) => {
      renderApp(path);
      const [first] = await screen.findAllByText('Saved on this device');
      expect(first).toBeInTheDocument();
    },
  );

  it('explains on the Dashboard that sync is not enabled', async () => {
    renderApp('/');
    expect(await screen.findByText(/Sync is not enabled/)).toBeInTheDocument();
  });

  it('is driven only by the contract: a different source changes what is shown', async () => {
    let status: SyncStatus = { state: 'syncing', label: 'Syncing', detail: 'Exchanging changes.' };
    const listeners = new Set<() => void>();
    const source: SyncStatusSource = {
      current: () => status,
      subscribe: (l) => (listeners.add(l), () => listeners.delete(l)),
    };
    render(
      <AppProvider open={() => Promise.resolve(createNodeSqliteDatabase())} syncStatus={source}>
        <SyncIndicator />
      </AppProvider>,
    );
    const indicator = await screen.findByRole('status');
    expect(within(indicator).getByText('Syncing')).toBeInTheDocument();
    status = { state: 'attention', label: 'Needs attention', detail: 'A conflict.' };
    listeners.forEach((l) => l());
    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
  });
});
