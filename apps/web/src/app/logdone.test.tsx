import { screen } from '@testing-library/react';
import { createDaily, renderApp } from './test-utils';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T06:30:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('logging an activity as done', () => {
  it('completes a one-off that has no schedule, and shows it in History', async () => {
    const { user } = renderApp('/activities/new');
    await user.type(await screen.findByLabelText('Name'), 'Water plants');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));

    await user.click(await screen.findByRole('button', { name: 'Log Water plants as done' }));
    await user.type(screen.getByLabelText('Notes'), 'front yard');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await user.click(await screen.findByRole('link', { name: 'History' }));
    expect(await screen.findByText(/front yard/)).toBeInTheDocument();
    expect(screen.getByText(/front yard/)).toBeInTheDocument();
  });

  it('can be dated earlier, but not in the future', async () => {
    const { user } = renderApp('/activities/new');
    await user.type(await screen.findByLabelText('Name'), 'Service car');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));

    await user.click(await screen.findByRole('button', { name: 'Log Service car as done' }));
    const date = screen.getByLabelText('Done on');
    expect(date).toHaveAttribute('max', '2026-11-05');
    await user.clear(date);
    await user.type(date, '2026-10-20');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await user.click(await screen.findByRole('link', { name: 'History' }));
    expect(await screen.findByText(/20 Oct/)).toBeInTheDocument();
    expect(screen.getByText(/20 Oct/)).toBeInTheDocument();
  });

  it('counts for the item that is due, so the Dashboard card goes away', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Wipe counters');

    await user.click(await screen.findByRole('button', { name: 'Log Wipe counters as done' }));
    expect(screen.getByLabelText(/Count this for the item due/)).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await user.click(await screen.findByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByText('Recently done')).toBeInTheDocument();
    // Today's item is resolved; only tomorrow onward remains.
    expect(screen.queryByRole('heading', { name: 'Due today' })).not.toBeInTheDocument();
  });

  it('can be logged as extra work instead, leaving the due item open', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Wipe counters');

    await user.click(await screen.findByRole('button', { name: 'Log Wipe counters as done' }));
    await user.click(screen.getByLabelText(/Count this for the item due/));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await user.click(await screen.findByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByText('Recently done')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Due today' })).toBeInTheDocument();
  });
});

describe('planned and dated one-offs', () => {
  it('a one-off with a due date shows on the Dashboard', async () => {
    const { user } = renderApp('/activities/new');
    await user.type(await screen.findByLabelText('Name'), 'Renew licence');
    await user.type(screen.getByLabelText(/Due on/), '2026-11-05');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));

    await user.click(await screen.findByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByRole('heading', { name: 'Due today' })).toBeInTheDocument();
    expect(screen.getByText('Renew licence')).toBeInTheDocument();
  });

  it('an undated one-off is planned, and gets a date from the list', async () => {
    const { user } = renderApp('/activities/new');
    await user.type(await screen.findByLabelText('Name'), 'Paint fence');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));

    expect(await screen.findByText(/Planned, no date/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Set date for Paint fence' }));
    await user.type(screen.getByLabelText('Due on'), '2026-11-05');
    await user.click(screen.getByRole('button', { name: 'Save date' }));

    expect(await screen.findByText(/One-off · next/)).toBeInTheDocument();
    expect(screen.queryByText(/Planned, no date/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByText('Paint fence')).toBeInTheDocument();
  });
});

describe('deleting', () => {
  it('deletes an activity that was never done, after asking', async () => {
    const { user } = renderApp('/activities/new');
    await user.type(await screen.findByLabelText('Name'), 'Typo activity');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));

    await user.click(await screen.findByRole('button', { name: 'Delete Typo activity' }));
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.getByText('Typo activity')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Typo activity' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    expect(await screen.findByText(/No activities yet/)).toBeInTheDocument();
  });

  it('explains why an activity with history cannot be deleted', async () => {
    const { user } = renderApp('/activities/new');
    await user.type(await screen.findByLabelText('Name'), 'Water plants');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));
    await user.click(await screen.findByRole('button', { name: 'Log Water plants as done' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await user.click(await screen.findByRole('button', { name: 'Delete Water plants' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/can only be archived/);
    expect(screen.getByText('Water plants')).toBeInTheDocument();
  });
});

describe('recent changes', () => {
  it('lists what changed', async () => {
    const { user } = renderApp('/activities/new');
    await user.type(await screen.findByLabelText('Name'), 'Water plants');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));
    await user.click(await screen.findByRole('button', { name: 'Archive Water plants' }));

    await user.click(await screen.findByRole('link', { name: 'Settings' }));
    const heading = await screen.findByRole('heading', { name: 'Recent changes' });
    const list = heading.closest('section')!;
    const items = Array.from(list.querySelectorAll('li')).map((li) => li.textContent);
    // The clock is frozen in these tests, so only check that both changes are listed.
    expect(items.some((t) => /Archived activity: Water plants/.test(t ?? ''))).toBe(true);
    expect(items.some((t) => /Added activity: Water plants/.test(t ?? ''))).toBe(true);
  });
});

describe('search', () => {
  it('finds an activity by name and links to it', async () => {
    const { user } = renderApp('/activities/new');
    await user.type(await screen.findByLabelText('Name'), 'Service the boiler');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));
    await screen.findByText('Service the boiler');

    await user.click(screen.getByRole('link', { name: 'Search' }));
    await user.type(await screen.findByLabelText('Search everything'), 'boiler');
    const link = await screen.findByRole('link', { name: 'Service the boiler' });
    expect(link).toHaveAttribute('href', '/activities?q=Service%20the%20boiler');
  });
});

describe('backup reminder', () => {
  beforeEach(() => localStorage.clear());

  it('is not shown to someone with no data yet', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: 'What do you want to keep up?' });
    expect(screen.queryByRole('region', { name: 'Backup reminder' })).not.toBeInTheDocument();
  });

  it('asks for a first backup once there is data, and can be put off', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Wipe counters');
    await user.click(await screen.findByRole('link', { name: 'Dashboard' }));

    const nudge = await screen.findByRole('region', { name: 'Backup reminder' });
    expect(nudge).toHaveTextContent(/not saved a backup yet/);
    await user.click(screen.getByRole('button', { name: 'Remind me later' }));
    expect(screen.queryByRole('region', { name: 'Backup reminder' })).not.toBeInTheDocument();
  });

  it('is quiet after a recent backup and returns when it is old', async () => {
    const { markBackedUp } = await import('../shared/utilities/backupStatus');
    markBackedUp('2026-11-01T00:00:00.000Z');
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Wipe counters');
    await user.click(await screen.findByRole('link', { name: 'Dashboard' }));
    await screen.findByRole('heading', { name: 'Due today' });
    expect(screen.queryByRole('region', { name: 'Backup reminder' })).not.toBeInTheDocument();
  });
});

describe('history export', () => {
  it('offers the history as a CSV file', async () => {
    const save = vi.fn<(blob: Blob) => string>(() => 'blob:x');
    vi.stubGlobal('URL', { createObjectURL: save, revokeObjectURL: vi.fn() });
    const { user } = renderApp('/settings');
    await user.click(await screen.findByRole('button', { name: 'Export history (.csv)' }));
    expect(await screen.findByText(/Saved your history as a spreadsheet file/)).toBeInTheDocument();
    const blob = save.mock.calls[0]![0];
    expect(blob.type).toBe('text/csv');
    vi.unstubAllGlobals();
  });
});
