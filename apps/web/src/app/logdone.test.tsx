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
