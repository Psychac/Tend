import { screen, within } from '@testing-library/react';
import { createDaily, renderApp } from './test-utils';

describe('editing an activity', () => {
  it('fixes a typo in the name and changes the details', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Clean AC fliter');

    await user.click(await screen.findByRole('link', { name: 'Edit Clean AC fliter' }));
    const name = await screen.findByLabelText('Name');
    expect(name).toHaveValue('Clean AC fliter');
    expect(screen.getByLabelText('Repeats')).toHaveValue('calendar');
    expect(screen.getByLabelText('Unit')).toHaveValue('day');

    await user.clear(name);
    await user.type(name, 'Clean AC filter');
    await user.selectOptions(screen.getByLabelText('Priority'), 'high');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Clean AC filter')).toBeInTheDocument();
    expect(screen.queryByText('Clean AC fliter')).not.toBeInTheDocument();
  });

  it('shows validation problems and keeps the old name', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Pay rent');
    await user.click(await screen.findByRole('link', { name: 'Edit Pay rent' }));

    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, '   ');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/name: is required/i);

    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    expect(await screen.findByText('Pay rent')).toBeInTheDocument();
  });

  it('adds checklist items and required readings, which then show when completing', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Service car');
    await user.click(await screen.findByRole('link', { name: 'Edit Service car' }));

    await user.type(await screen.findByLabelText(/Checklist/), 'Check oil');
    await user.click(screen.getByRole('button', { name: 'Add a reading' }));
    await user.type(screen.getByLabelText('Reading'), 'odometer');
    await user.type(screen.getByLabelText('Unit', { selector: 'input' }), 'km');
    await user.click(screen.getByRole('checkbox', { name: 'Required' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await user.click(await screen.findByRole('link', { name: 'Dashboard' }));
    const dueToday = await screen.findByRole('region', { name: 'Due today' });
    // A required reading means "Done" asks for it instead of completing immediately.
    await user.click(within(dueToday).getByRole('button', { name: 'Done' }));
    expect(within(dueToday).getByLabelText(/odometer \(km\)/)).toBeRequired();
    expect(within(dueToday).getByRole('checkbox', { name: 'Check oil' })).toBeInTheDocument();
  });

  it('changes the schedule and offers what to do with upcoming items', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Water plants');
    await user.click(await screen.findByRole('link', { name: 'Edit Water plants' }));

    expect(await screen.findByText(/Upcoming items already created/)).toBeInTheDocument();
    // Once repeating, an activity can no longer be set back to "does not repeat" here.
    expect(screen.queryByRole('option', { name: 'Does not repeat' })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Unit'), 'week');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await user.click(await screen.findByRole('link', { name: 'Calendar' }));
    // Weekly now, so the day after today carries nothing.
    await user.click(await screen.findByRole('button', { name: /Fri,? 6 Nov/ }));
    expect(await screen.findByText(/nothing on this day/i)).toBeInTheDocument();
  });

  it('says so when the activity does not exist', async () => {
    renderApp('/activities/not-a-real-id/edit');
    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer exists/i);
  });
});

describe('pausing and restoring activities', () => {
  it('pauses and resumes a repeating activity', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Water plants');

    await user.click(await screen.findByRole('button', { name: 'Pause Water plants' }));
    expect(await screen.findByText(/Recurring \(paused\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume Water plants' }));
    expect(await screen.findByText(/Recurring · next/)).toBeInTheDocument();
  });

  it('shows archived activities on request and restores them', async () => {
    const { user } = renderApp('/activities/new');
    await createDaily(user, 'Old chore');
    await user.click(await screen.findByRole('button', { name: 'Archive Old chore' }));
    expect(await screen.findByText(/no activities yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Show archived' }));
    expect(await screen.findByText(/Archived/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore Old chore' }));
    await user.click(screen.getByRole('checkbox', { name: 'Show archived' }));
    expect(await screen.findByRole('link', { name: 'Edit Old chore' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    expect(
      within(await screen.findByRole('region', { name: 'Due today' })).getByText('Old chore'),
    ).toBeInTheDocument();
  });
});

describe('editing an asset', () => {
  it('corrects details, including a price in another currency', async () => {
    const { user } = renderApp('/assets');
    await user.click(await screen.findByRole('button', { name: 'Add asset' }));
    await user.type(screen.getByLabelText('Name'), 'Honda Cty');
    await user.type(screen.getByLabelText('Price'), '1500.50');
    await user.selectOptions(screen.getByLabelText('Price currency'), 'USD');
    await user.click(screen.getByRole('button', { name: 'Save asset' }));

    await user.click(await screen.findByRole('button', { name: 'Edit Honda Cty' }));
    const form = await screen.findByRole('form', { name: 'Edit Honda Cty' });
    // The stored price is shown back as it was typed.
    expect(within(form).getByLabelText('Price')).toHaveValue('1500.50');
    expect(within(form).getByLabelText('Price currency')).toHaveValue('USD');

    const name = within(form).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Honda City');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Honda City')).toBeInTheDocument();
    expect(screen.queryByText('Honda Cty')).not.toBeInTheDocument();
  });

  it('reactivates a retired asset', async () => {
    const { user } = renderApp('/assets');
    await user.click(await screen.findByRole('button', { name: 'Add asset' }));
    await user.type(screen.getByLabelText('Name'), 'Old fridge');
    await user.click(screen.getByRole('button', { name: 'Save asset' }));
    await user.click(await screen.findByRole('button', { name: 'Retire' }));
    expect(await screen.findByText(/no assets yet/i)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Show retired/ }));
    await user.click(await screen.findByRole('button', { name: 'Reactivate' }));
    await user.click(screen.getByRole('checkbox', { name: /Show retired/ }));
    expect(await screen.findByText('Old fridge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retire' })).toBeInTheDocument();
  });
});
