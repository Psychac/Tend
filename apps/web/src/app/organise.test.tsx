import { screen, within } from '@testing-library/react';
import { renderApp } from './test-utils';

type User = ReturnType<typeof renderApp>['user'];

async function addCategory(user: User, name: string) {
  const form = await screen.findByRole('form', { name: 'Add category' });
  await user.type(within(form).getByLabelText('New category'), name);
  await user.click(within(form).getByRole('button', { name: 'Add category' }));
}

async function addPlace(user: User, name: string, inside?: string) {
  const form = await screen.findByRole('form', { name: 'Add place' });
  await user.type(within(form).getByLabelText('New place'), name);
  if (inside) await user.selectOptions(within(form).getByLabelText('Inside'), inside);
  await user.click(within(form).getByRole('button', { name: 'Add place' }));
}

describe('categories in settings', () => {
  it('adds, renames and deletes a category', async () => {
    const { user } = renderApp('/settings');
    await addCategory(user, 'Cleaning');
    expect(await screen.findByText('Cleaning')).toBeInTheDocument();
    expect(screen.getByText(/not used yet/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rename Cleaning' }));
    const rename = await screen.findByRole('form', { name: 'Rename Cleaning' });
    const name = within(rename).getByLabelText('Category name');
    await user.clear(name);
    await user.type(name, 'Home cleaning');
    await user.click(within(rename).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Home cleaning')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Home cleaning' }));
    expect(await screen.findByText(/no categories yet/i)).toBeInTheDocument();
  });

  it('explains a duplicate name', async () => {
    const { user } = renderApp('/settings');
    await addCategory(user, 'Garden');
    await screen.findByText('Garden');
    await addCategory(user, 'garden');
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });
});

describe('places in settings', () => {
  it('builds a nested set of places', async () => {
    const { user } = renderApp('/settings');
    await addPlace(user, 'House');
    await screen.findByRole('button', { name: 'Edit House' });
    await addPlace(user, 'Kitchen', 'House');
    expect(await screen.findByRole('button', { name: 'Edit Kitchen' })).toBeInTheDocument();
    // The picker shows where each place sits.
    const form = screen.getByRole('form', { name: 'Add place' });
    expect(within(form).getByRole('option', { name: 'House › Kitchen' })).toBeInTheDocument();
  });

  it('refuses to delete a place that has places inside it', async () => {
    const { user } = renderApp('/settings');
    await addPlace(user, 'House');
    await screen.findByRole('button', { name: 'Edit House' });
    await addPlace(user, 'Kitchen', 'House');
    await screen.findByRole('button', { name: 'Edit Kitchen' });

    await user.click(screen.getByRole('button', { name: 'Delete House' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/1 place inside it/);
    expect(screen.getByRole('button', { name: 'Edit House' })).toBeInTheDocument();
  });
});

describe('using categories and places', () => {
  it('files an activity under a category and place, shows them, and filters by them', async () => {
    const { user } = renderApp('/settings');
    await addCategory(user, 'Cleaning');
    await screen.findByText('Cleaning');
    await addPlace(user, 'Kitchen');
    await screen.findByRole('button', { name: 'Edit Kitchen' });

    await user.click(screen.getByRole('link', { name: 'Activities' }));
    await user.click(await screen.findByRole('link', { name: 'New activity' }));
    await user.type(await screen.findByLabelText('Name'), 'Wipe counters');
    await user.selectOptions(screen.getByLabelText('Category'), 'Cleaning');
    await user.selectOptions(screen.getByLabelText('Place'), 'Kitchen');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));

    await user.click(await screen.findByRole('link', { name: 'New activity' }));
    await user.type(await screen.findByLabelText('Name'), 'Pay rent');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));

    // Both are listed; the first shows its category and place.
    expect(await screen.findByText(/Cleaning · Kitchen/)).toBeInTheDocument();
    expect(screen.getByText('Pay rent')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Category'), 'Cleaning');
    expect(await screen.findByText('Wipe counters')).toBeInTheDocument();
    expect(screen.queryByText('Pay rent')).not.toBeInTheDocument();
  });

  it('will not delete a category that an activity uses', async () => {
    const { user } = renderApp('/settings');
    await addCategory(user, 'Cleaning');
    await screen.findByText('Cleaning');

    await user.click(screen.getByRole('link', { name: 'Activities' }));
    await user.click(await screen.findByRole('link', { name: 'New activity' }));
    await user.type(await screen.findByLabelText('Name'), 'Mop');
    await user.selectOptions(screen.getByLabelText('Category'), 'Cleaning');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));
    await screen.findByText('Mop');

    await user.click(screen.getByRole('link', { name: 'Settings' }));
    await user.click(await screen.findByRole('button', { name: 'Delete Cleaning' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/used by 1 activity/i);
  });

  it('files an asset and keeps its category and place when edited', async () => {
    const { user } = renderApp('/settings');
    await addCategory(user, 'Vehicles');
    await screen.findByText('Vehicles');
    await addPlace(user, 'Garage');
    await screen.findByRole('button', { name: 'Edit Garage' });

    await user.click(screen.getByRole('link', { name: 'Assets' }));
    await user.click(await screen.findByRole('button', { name: 'Add asset' }));
    const form = await screen.findByRole('form', { name: 'New asset' });
    await user.type(within(form).getByLabelText('Name'), 'Honda Cty');
    await user.selectOptions(within(form).getByLabelText('Category'), 'Vehicles');
    await user.selectOptions(within(form).getByLabelText('Place'), 'Garage');
    await user.click(within(form).getByRole('button', { name: 'Save asset' }));
    expect(await screen.findByText(/Vehicles · Garage/)).toBeInTheDocument();

    // Editing the name must not drop the category or place.
    await user.click(screen.getByRole('button', { name: 'Edit Honda Cty' }));
    const edit = await screen.findByRole('form', { name: 'Edit Honda Cty' });
    expect(within(edit).getByLabelText('Category')).toHaveValue(
      (within(edit).getByRole('option', { name: 'Vehicles' }) as HTMLOptionElement).value,
    );
    const name = within(edit).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Honda City');
    await user.click(within(edit).getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Vehicles · Garage/)).toBeInTheDocument();
    expect(screen.getByText('Honda City')).toBeInTheDocument();
  });

  it('keeps the category and place when an activity is edited', async () => {
    const { user } = renderApp('/settings');
    await addCategory(user, 'Cleaning');
    await screen.findByText('Cleaning');
    await user.click(screen.getByRole('link', { name: 'Activities' }));
    await user.click(await screen.findByRole('link', { name: 'New activity' }));
    await user.type(await screen.findByLabelText('Name'), 'Mop');
    await user.selectOptions(screen.getByLabelText('Category'), 'Cleaning');
    await user.click(screen.getByRole('button', { name: 'Create activity' }));

    await user.click(await screen.findByRole('link', { name: 'Edit Mop' }));
    const name = await screen.findByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Mop floors');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Cleaning/, { selector: 'p' })).toBeInTheDocument();
  });
});
