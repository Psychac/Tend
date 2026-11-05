import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createNodeSqliteDatabase } from '@upkeep/infrastructure/testing';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { AppProvider } from './providers/AppProvider';
import { routes } from './router/router';

export function renderApp(path = '/') {
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
export async function createDaily(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.type(await screen.findByLabelText('Name'), name);
  await user.selectOptions(screen.getByLabelText('Repeats'), 'calendar');
  await user.selectOptions(screen.getByLabelText('Unit'), 'day');
  await user.click(screen.getByRole('button', { name: 'Create activity' }));
}
