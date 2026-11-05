import { screen, within } from '@testing-library/react';
import { createDaily, renderApp } from './test-utils';

/** Creates a daily activity, completes today's item with a cost, and opens History. */
async function doneWithCost(
  user: ReturnType<typeof renderApp>['user'],
  name: string,
  amount: string,
  currency: string,
) {
  await createDaily(user, name);
  await user.click(await screen.findByRole('link', { name: 'Dashboard' }));
  const dueToday = await screen.findByRole('region', { name: 'Due today' });
  await user.click(within(dueToday).getByRole('button', { name: 'Details' }));
  await user.type(within(dueToday).getByLabelText('Notes'), 'oil chnage');
  await user.type(within(dueToday).getByLabelText('Cost'), amount);
  await user.selectOptions(within(dueToday).getByLabelText('Cost currency'), currency);
  await user.click(within(dueToday).getByRole('button', { name: 'Save and mark done' }));
  await screen.findByRole('region', { name: 'Recently done' });
  await user.click(screen.getByRole('link', { name: 'History' }));
}

describe('correcting a past entry', () => {
  it('edits notes and cost without redoing anything, and marks the entry as edited', async () => {
    const { user } = renderApp('/activities/new');
    await doneWithCost(user, 'Service car', '1500', 'INR');

    await user.click(await screen.findByRole('button', { name: 'Edit Service car' }));
    const form = await screen.findByRole('form', { name: 'Edit entry for Service car' });
    // The old values are already filled in.
    expect(within(form).getByLabelText('Notes')).toHaveValue('oil chnage');
    expect(within(form).getByLabelText('Cost')).toHaveValue('1500.00');
    expect(within(form).getByLabelText('Cost currency')).toHaveValue('INR');

    const notes = within(form).getByLabelText('Notes');
    await user.clear(notes);
    await user.type(notes, 'oil change');
    await user.selectOptions(within(form).getByLabelText('Cost currency'), 'USD');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));

    // The corrected entry replaces the old one (a new element), so wait for it before querying.
    await screen.findByText('oil change');
    const entry = screen.getByRole('listitem');
    expect(within(entry).getByText('$1,500.00')).toBeInTheDocument();
    expect(within(entry).getByText('(edited)')).toBeInTheDocument();
    // Still exactly one entry: nothing was duplicated or redone.
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('shows validation problems from an edit and keeps the entry as it was', async () => {
    const { user } = renderApp('/activities/new');
    await doneWithCost(user, 'Service car', '10', 'USD');

    await user.click(await screen.findByRole('button', { name: 'Edit Service car' }));
    const form = await screen.findByRole('form', { name: 'Edit entry for Service car' });
    const cost = within(form).getByLabelText('Cost');
    await user.clear(cost);
    await user.type(cost, '10.123');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));

    expect(await within(form).findByRole('alert')).toHaveTextContent(/at most 2 decimal places/);
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('$10.00')).toBeInTheDocument();
  });

  it('cancelling an edit changes nothing', async () => {
    const { user } = renderApp('/activities/new');
    await doneWithCost(user, 'Service car', '10', 'USD');
    await user.click(await screen.findByRole('button', { name: 'Edit Service car' }));
    await user.click(
      within(await screen.findByRole('form', { name: /Edit entry/ })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByText('(edited)')).not.toBeInTheDocument();
  });
});

describe('undoing a completion', () => {
  it('asks first, then removes the entry from history and puts the work back to due', async () => {
    const { user } = renderApp('/activities/new');
    await doneWithCost(user, 'Water plants', '5', 'USD');

    await user.click(await screen.findByRole('button', { name: 'Undo Water plants' }));
    expect(await screen.findByRole('alertdialog', { name: 'Confirm undo' })).toBeInTheDocument();

    // "Keep it" leaves everything alone.
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo Water plants' }));
    await user.click(await screen.findByRole('button', { name: 'Yes, undo it' }));
    expect(await screen.findByText(/nothing has been done yet/i)).toBeInTheDocument();

    // The work is due again.
    await user.click(screen.getByRole('link', { name: 'Dashboard' }));
    const dueToday = await screen.findByRole('region', { name: 'Due today' });
    expect(within(dueToday).getByText('Water plants')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Recently done' })).not.toBeInTheDocument();
  });
});
