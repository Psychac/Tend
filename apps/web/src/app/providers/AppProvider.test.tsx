import { render, screen } from '@testing-library/react';
import { createActivity } from '@upkeep/application';
import { createNodeSqliteDatabase } from '@upkeep/infrastructure/testing';
import { AppProvider, createServices, useApp } from './AppProvider';

function ProbeCount() {
  const { repos } = useApp();
  return <button onClick={() => void repos.activities.list({})}>ready</button>;
}

describe('AppProvider', () => {
  it('shows a loading message, then renders children once the database is open', async () => {
    const db = createNodeSqliteDatabase();
    render(
      <AppProvider open={() => Promise.resolve(db)}>
        <ProbeCount />
      </AppProvider>,
    );
    expect(screen.getByText(/opening your data/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'ready' })).toBeInTheDocument();
  });

  it('explains the problem instead of rendering a broken app when storage will not open', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <AppProvider open={() => Promise.reject(new Error('OPFS unavailable'))}>
        <ProbeCount />
      </AppProvider>,
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your data could not be opened');
    expect(alert).toHaveTextContent('OPFS unavailable');
    expect(screen.queryByRole('button', { name: 'ready' })).not.toBeInTheDocument();
    quiet.mockRestore();
  });

  it('builds services that work against the database', async () => {
    const { deps, repos } = createServices(createNodeSqliteDatabase());
    const r = await createActivity(deps, { name: 'Water plants', type: 'routine' });
    expect(r.ok).toBe(true);
    expect(await repos.activities.list({})).toHaveLength(1);
  });
});
