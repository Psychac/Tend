import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { createActivity, setActivityReminder } from '@tend/application';
import { createNodeSqliteDatabase } from '@tend/infrastructure/testing';
import { createServices } from './providers/AppProvider';
import { createDaily, fakeNotifier, renderApp } from './test-utils';

const ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

beforeEach(() => {
  localStorage.clear();
  // Pin the date (only Date is faked; timers stay real) so "due today" is predictable.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T06:30:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

async function addDailyWithReminder(
  db: ReturnType<typeof createNodeSqliteDatabase>,
  name: string,
): Promise<void> {
  const { deps } = createServices(db);
  const created = await createActivity(deps, {
    name,
    type: 'routine',
    schedule: {
      strategy: { kind: 'calendar', interval: { every: 1, unit: 'day' } },
      timeZone: ZONE,
      startsOn: '2026-11-05',
    },
  });
  if (!created.ok) throw new Error(created.error.message);
  // At the very start of each day, so it has fired whatever the device's time zone is.
  const set = await setActivityReminder(deps, {
    activityId: created.value.activity.id,
    leadDays: 0,
    atTime: '00:00',
    enabled: true,
  });
  if (!set.ok) throw new Error(set.error.message);
}

/** A database that already holds a daily activity with a reminder. */
async function databaseWithReminder(name = 'Water plants') {
  const db = createNodeSqliteDatabase();
  await addDailyWithReminder(db, name);
  return db;
}

describe('setting a reminder on an activity', () => {
  it('is offered once the activity repeats, and is remembered when editing', async () => {
    const { user } = renderApp('/activities/new');
    await user.type(await screen.findByLabelText('Name'), 'Clean AC');
    expect(screen.queryByRole('checkbox', { name: 'Remind me' })).not.toBeInTheDocument(); // one-off

    await user.selectOptions(screen.getByLabelText('Repeats'), 'calendar');
    await user.selectOptions(screen.getByLabelText('Unit'), 'day');
    await user.click(screen.getByRole('checkbox', { name: 'Remind me' }));
    await user.selectOptions(screen.getByLabelText('When'), '1');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));

    await user.click(await screen.findByRole('link', { name: 'Edit Clean AC' }));
    expect(await screen.findByRole('checkbox', { name: 'Remind me' })).toBeChecked();
    expect(screen.getByLabelText('When')).toHaveValue('1');
    expect(screen.getByLabelText('At')).toHaveValue('09:00');
  });

  it('can be turned off again', async () => {
    const { user } = renderApp('/activities/new');
    await user.type(await screen.findByLabelText('Name'), 'Clean AC');
    await user.selectOptions(screen.getByLabelText('Repeats'), 'calendar');
    await user.selectOptions(screen.getByLabelText('Unit'), 'day');
    await user.click(screen.getByRole('checkbox', { name: 'Remind me' }));
    await user.click(screen.getByRole('button', { name: 'Create activity' }));

    await user.click(await screen.findByRole('link', { name: 'Edit Clean AC' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Remind me' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await user.click(await screen.findByRole('link', { name: 'Edit Clean AC' }));
    expect(await screen.findByRole('checkbox', { name: 'Remind me' })).not.toBeChecked();
  });

  it('shows no reminders for activities without one', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'No reminder here');
    await user.click(await screen.findByRole('link', { name: 'Dashboard' }));
    await screen.findByRole('region', { name: 'Due today' });
    expect(screen.queryByRole('region', { name: /Reminders/ })).not.toBeInTheDocument();
  });
});

describe('reminders on the dashboard', () => {
  it('lists work whose reminder time has come, with a count beside Dashboard', async () => {
    renderApp('/', { db: await databaseWithReminder() });
    const panel = await screen.findByRole('region', { name: /Reminders \(1\)/ });
    expect(within(panel).getByText('Water plants')).toBeInTheDocument();
    expect(within(panel).getByText('due today')).toBeInTheDocument();
    expect(await screen.findByLabelText('1 reminder')).toBeInTheDocument();
  });

  it('clears once the work is done', async () => {
    const { user } = renderApp('/', { db: await databaseWithReminder() });
    await screen.findByRole('region', { name: /Reminders/ });
    const dueToday = await screen.findByRole('region', { name: 'Due today' });
    await user.click(within(dueToday).getByRole('button', { name: 'Done' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /Reminders \(/ })).not.toBeInTheDocument(),
    );
  });
});

describe('browser notifications', () => {
  it('shows one notification when the app opens with a due reminder, and not again', async () => {
    localStorage.setItem('tend.browserNotifications', '1');
    const { notifier, shown } = fakeNotifier('granted');
    const db = await databaseWithReminder();

    renderApp('/', { db, notifier });
    await screen.findByRole('region', { name: /Reminders/ });
    await waitFor(() => expect(shown).toHaveLength(1));
    expect(shown[0]).toEqual({ title: 'Water plants', body: 'Due today' });
    cleanup();

    // Opening the app again must not repeat it.
    renderApp('/', { db, notifier });
    await screen.findByRole('region', { name: /Reminders/ });
    await new Promise((r) => setTimeout(r, 150));
    expect(shown).toHaveLength(1);
  });

  it('shows none while this device has not opted in, and delivers once it has', async () => {
    const { notifier, shown } = fakeNotifier('granted');
    const db = await databaseWithReminder();
    renderApp('/', { db, notifier });
    await screen.findByRole('region', { name: /Reminders/ });
    await new Promise((r) => setTimeout(r, 150));
    expect(shown).toHaveLength(0); // permission granted, but this device has not opted in
    cleanup();

    localStorage.setItem('tend.browserNotifications', '1');
    renderApp('/', { db, notifier });
    await waitFor(() => expect(shown).toHaveLength(1));
  });

  it('combines several due reminders into one notification', async () => {
    localStorage.setItem('tend.browserNotifications', '1');
    const { notifier, shown } = fakeNotifier('granted');
    const db = await databaseWithReminder('Water plants');
    await addDailyWithReminder(db, 'Take out bins');
    await addDailyWithReminder(db, 'Clean AC');

    renderApp('/', { db, notifier });
    await waitFor(() => expect(shown).toHaveLength(1));
    expect(shown[0]?.title).toBe('3 things need attention');
    expect(shown[0]?.body).toContain('Water plants');
  });
});

describe('notification settings', () => {
  it('asks permission, then confirms and can send a test', async () => {
    const f = fakeNotifier('default');
    f.notifier.request = async () => {
      f.state.permission = 'granted';
      return 'granted';
    };
    const { user } = renderApp('/settings', { notifier: f.notifier });
    await user.click(await screen.findByRole('button', { name: 'Turn on browser notifications' }));
    expect(await screen.findByText('Browser notifications are on.')).toBeInTheDocument();
    expect(localStorage.getItem('tend.browserNotifications')).toBe('1');

    await user.click(screen.getByRole('button', { name: 'Send a test' }));
    expect(await screen.findByText('Test notification sent.')).toBeInTheDocument();
    expect(f.shown).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(
      await screen.findByRole('button', { name: 'Turn on browser notifications' }),
    ).toBeInTheDocument();
  });

  it('explains what to do when the browser has blocked notifications', async () => {
    const f = fakeNotifier('default');
    f.notifier.request = async () => 'denied';
    const { user } = renderApp('/settings', { notifier: f.notifier });
    await user.click(await screen.findByRole('button', { name: 'Turn on browser notifications' }));
    expect(await screen.findByText(/blocked for this site/i)).toBeInTheDocument();
    expect(localStorage.getItem('tend.browserNotifications')).not.toBe('1');
  });

  it('says plainly when the browser cannot show notifications', async () => {
    renderApp('/settings', { notifier: fakeNotifier('unsupported').notifier });
    expect(await screen.findByText(/cannot show notifications/i)).toBeInTheDocument();
    expect(screen.getByText(/Nothing can wake a closed app/)).toBeInTheDocument();
  });
});
