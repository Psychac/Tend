import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createNodeSqliteDatabase } from '@upkeep/infrastructure/testing';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProvider } from './providers/AppProvider';
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
    await user.type(within(dueToday).getByLabelText('Cost (INR)'), '1500');
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
