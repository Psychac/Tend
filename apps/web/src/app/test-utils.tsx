import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SqlDatabase } from '@upkeep/infrastructure';
import { createNodeSqliteDatabase } from '@upkeep/infrastructure/testing';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Notifier } from '../shared/notifier';
import { AppProvider } from './providers/AppProvider';
import { routes } from './router/router';

/** A notifier that never touches the real browser, and records what it was asked to show. */
export function fakeNotifier(permission: ReturnType<Notifier['permission']> = 'default') {
  const shown: { title: string; body: string }[] = [];
  const state = { permission };
  const notifier: Notifier = {
    permission: () => state.permission,
    request: async () => state.permission,
    show: async (content) => {
      if (state.permission !== 'granted') return false;
      shown.push({ title: content.title, body: content.body });
      return true;
    },
  };
  return { notifier, shown, state };
}

export function renderApp(path = '/', options: { db?: SqlDatabase; notifier?: Notifier } = {}) {
  const db = options.db ?? createNodeSqliteDatabase();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProvider
      open={() => Promise.resolve(db)}
      notifier={options.notifier ?? fakeNotifier().notifier}
    >
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
