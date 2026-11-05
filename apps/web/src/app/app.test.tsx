import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createActivity } from '@upkeep/application';
import { exportBackup } from '@upkeep/infrastructure';
import { createNodeSqliteDatabase } from '@upkeep/infrastructure/testing';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProvider, createServices } from './providers/AppProvider';
import { routes } from './router/router';

function renderApp(path = '/') {
  const db = createNodeSqliteDatabase();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProvider open={() => Promise.resolve(db)}>
      <RouterProvider router={router} />
    </AppProvider>,
  );
  return { user: userEvent.setup(), router };
}

/** Creates a daily activity starting today through the real form. */
async function createDaily(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(await screen.findByLabelText('Name'), name);
  await user.selectOptions(screen.getByLabelText('Repeats'), 'calendar');
  await user.selectOptions(screen.getByLabelText('Unit'), 'day');
  await user.click(screen.getByRole('button', { name: 'Create activity' }));
}

describe('navigation', () => {
  it('shows the primary navigation and an empty dashboard prompt', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument();
    expect(await screen.findByText(/nothing is due/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add an activity' })).toHaveAttribute(
      'href',
      '/activities/new',
    );
  });
});

describe('create, complete and manage an activity', () => {
  it('creates a daily activity that appears as due today, and completes it in one tap', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Water plants');

    // Lands on the list, showing it as recurring.
    expect(await screen.findByText('Water plants')).toBeInTheDocument();
    expect(screen.getByText(/recurring/i)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    const dueToday = await screen.findByRole('region', { name: 'Due today' });
    expect(within(dueToday).getByText('Water plants')).toBeInTheDocument();

    await user.click(within(dueToday).getByRole('button', { name: 'Done' }));

    // It leaves "Due today" and is recorded under "Recently done"; tomorrow's occurrence remains.
    const recent = await screen.findByRole('region', { name: 'Recently done' });
    expect(within(recent).getByText(/Water plants/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Due today' })).not.toBeInTheDocument();
    const upcoming = within(screen.getByRole('region', { name: 'Coming up' }));
    expect(upcoming.getAllByText('Water plants').length).toBeGreaterThan(0);
  });

  it('records notes, cost and checklist through the details form', async () => {
    const { user } = renderApp('/activities/new');
    await user.type(await screen.findByLabelText('Name'), 'Service car');
    await user.selectOptions(screen.getByLabelText('Repeats'), 'calendar');
    await user.selectOptions(screen.getByLabelText('Unit'), 'day');
    await user.type(screen.getByLabelText(/Checklist/), 'Check oil{enter}Check tyres');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));

    await user.click(await screen.findByRole('link', { name: 'Dashboard' }));
    const dueToday = await screen.findByRole('region', { name: 'Due today' });
    await user.click(within(dueToday).getByRole('button', { name: 'Details' }));
    await user.click(within(dueToday).getByRole('checkbox', { name: 'Check oil' }));
    await user.type(within(dueToday).getByLabelText('Notes'), 'All fine');
    await user.type(within(dueToday).getByLabelText('Cost'), '1500');
    await user.click(within(dueToday).getByRole('button', { name: 'Save and mark done' }));

    const recent = await screen.findByRole('region', { name: 'Recently done' });
    expect(within(recent).getByText(/Service car/)).toBeInTheDocument();
  });

  it('snoozing moves an item out of today', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Take medication reminder');
    await user.click(await screen.findByRole('link', { name: 'Dashboard' }));

    const dueToday = await screen.findByRole('region', { name: 'Due today' });
    await user.click(within(dueToday).getByRole('button', { name: 'Snooze a day' }));

    const upcoming = await screen.findByRole('region', { name: 'Coming up' });
    expect(within(upcoming).getAllByText(/snoozed/i).length).toBeGreaterThan(0);
  });

  it('explains validation problems instead of failing silently', async () => {
    const { user } = renderApp('/activities/new');
    // Passes the browser's required check but is blank once trimmed.
    await user.type(await screen.findByLabelText('Name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/name: is required/i);
    // Nothing was created.
    await user.click(screen.getByRole('link', { name: 'Activities' }));
    expect(await screen.findByText(/no activities yet/i)).toBeInTheDocument();
  });

  it('searches and archives activities', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Clean AC filter');
    await user.click(await screen.findByRole('link', { name: 'New activity' }));
    await createDaily(user, 'Pay rent');

    await user.type(await screen.findByPlaceholderText('Search activities'), 'ac f');
    expect(await screen.findByText('Clean AC filter')).toBeInTheDocument();
    expect(screen.queryByText('Pay rent')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Archive' }));
    expect(await screen.findByText(/no activities match/i)).toBeInTheDocument();
  });
});

describe('backup and restore', () => {
  /** A backup file made from a separate device that has one activity. */
  async function backupWith(name: string): Promise<File> {
    const other = createNodeSqliteDatabase();
    const services = createServices(other);
    const created = await createActivity(services.deps, { name, type: 'routine' });
    if (!created.ok) throw new Error(created.error.message);
    const backup = await exportBackup(other, '2026-11-05T06:30:00.000Z');
    return new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' });
  }

  it('previews a backup, then merges it into this device', async () => {
    const { user } = renderApp('/settings');
    await user.upload(
      await screen.findByLabelText(/restore from a backup file/i),
      await backupWith('Imported chore'),
    );

    expect(await screen.findByText(/nothing has changed yet/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Merge into my data' }));
    expect(await screen.findByText('Backup restored.')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Activities' }));
    expect(await screen.findByText('Imported chore')).toBeInTheDocument();
  });

  it('explains a file that is not a backup and changes nothing', async () => {
    const { user } = renderApp('/settings');
    await user.upload(
      await screen.findByLabelText(/restore from a backup file/i),
      new File(['{"hello":1}'], 'notes.json', { type: 'application/json' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/not a Personal Upkeep backup/i);
    await user.click(screen.getByRole('link', { name: 'Activities' }));
    expect(await screen.findByText(/no activities yet/i)).toBeInTheDocument();
  });
});

describe('assets and usage-based maintenance', () => {
  it('adds an asset, schedules service by mileage, and becomes due after enough driving', async () => {
    const { user } = renderApp('/assets');
    await user.click(await screen.findByRole('button', { name: 'Add asset' }));
    await user.type(screen.getByLabelText('Name'), 'Honda City');
    await user.click(screen.getByRole('button', { name: 'Save asset' }));
    expect(await screen.findByText('Honda City')).toBeInTheDocument();
    expect(screen.getByText(/0 activities/)).toBeInTheDocument();

    const record = async (value: string) => {
      await user.click(screen.getByRole('button', { name: 'Record a reading' }));
      const form = screen.getByRole('form', { name: 'Reading for Honda City' });
      await user.clear(within(form).getByLabelText('Value'));
      await user.type(within(form).getByLabelText('Value'), value);
      await user.click(within(form).getByRole('button', { name: 'Save reading' }));
    };
    await record('1000');
    expect(await screen.findByText('odometer: 1000 km')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Activities' }));
    await user.click(await screen.findByRole('link', { name: 'New activity' }));
    await user.type(await screen.findByLabelText('Name'), 'Oil change');
    await user.selectOptions(await screen.findByLabelText('Asset (optional)'), 'Honda City');
    await user.selectOptions(screen.getByLabelText('Repeats'), 'usage');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));
    expect(await screen.findByText('Oil change')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(await screen.findByText(/nothing is due/i)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Assets' }));
    await record('6500');
    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    const dueToday = await screen.findByRole('region', { name: 'Due today' });
    expect(within(dueToday).getByText('Oil change')).toBeInTheDocument();
  });

  it('retires an asset and hides it from the list', async () => {
    const { user } = renderApp('/assets');
    await user.click(await screen.findByRole('button', { name: 'Add asset' }));
    await user.type(screen.getByLabelText('Name'), 'Old fridge');
    await user.click(screen.getByRole('button', { name: 'Save asset' }));
    await user.click(await screen.findByRole('button', { name: 'Retire' }));
    expect(await screen.findByText(/no assets yet/i)).toBeInTheDocument();
  });
});

describe('history and multi-currency cost', () => {
  it('records a cost in a chosen currency and shows it, with timing, in history', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Service car');
    await user.click(await screen.findByRole('link', { name: 'Dashboard' }));

    const dueToday = await screen.findByRole('region', { name: 'Due today' });
    await user.click(within(dueToday).getByRole('button', { name: 'Details' }));
    await user.type(within(dueToday).getByLabelText('Cost'), '1,500.50');
    await user.selectOptions(within(dueToday).getByLabelText('Cost currency'), 'USD');
    await user.type(within(dueToday).getByLabelText('Notes'), 'New filter');
    await user.click(within(dueToday).getByRole('button', { name: 'Save and mark done' }));
    await screen.findByRole('region', { name: 'Recently done' });

    await user.click(screen.getByRole('link', { name: 'History' }));
    const entry = await screen.findByRole('listitem');
    expect(within(entry).getByText(/· Done/)).toBeInTheDocument();
    expect(within(entry).getByText('$1,500.50')).toBeInTheDocument();
    expect(within(entry).getByText(/on time/)).toBeInTheDocument();
    expect(within(entry).getByText('New filter')).toBeInTheDocument();
  });

  it('refuses more decimal places than the currency has', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Wash car');
    await user.click(await screen.findByRole('link', { name: 'Dashboard' }));

    const dueToday = await screen.findByRole('region', { name: 'Due today' });
    await user.click(within(dueToday).getByRole('button', { name: 'Details' }));
    await user.type(within(dueToday).getByLabelText('Cost'), '10.5');
    await user.selectOptions(within(dueToday).getByLabelText('Cost currency'), 'JPY');
    await user.click(within(dueToday).getByRole('button', { name: 'Save and mark done' }));

    expect(await within(dueToday).findByRole('alert')).toHaveTextContent(
      /JPY has no decimal places/,
    );
  });

  it('shows skipped work and filters history', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Take out bins');
    await user.click(await screen.findByRole('link', { name: 'Dashboard' }));
    const dueToday = await screen.findByRole('region', { name: 'Due today' });
    await user.click(within(dueToday).getByRole('button', { name: 'Skip' }));

    await user.click(await screen.findByRole('link', { name: 'History' }));
    expect(await screen.findByText(/Skipped/, { selector: 'span' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Show'), 'completed');
    expect(await screen.findByText(/nothing matches these filters/i)).toBeInTheDocument();
  });

  it('starts with an empty history message', async () => {
    renderApp('/history');
    expect(await screen.findByText(/nothing has been done yet/i)).toBeInTheDocument();
  });

  it('uses the default currency chosen in settings', async () => {
    const { user } = renderApp('/settings');
    await user.selectOptions(await screen.findByLabelText('Default currency'), 'EUR');
    await user.click(screen.getByRole('link', { name: 'Assets' }));
    await user.click(await screen.findByRole('button', { name: 'Add asset' }));
    expect(screen.getByLabelText('Price currency')).toHaveValue('EUR');
    localStorage.clear();
  });
});
