import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryAttachmentStorage } from '@tend/infrastructure';
import { createNodeSqliteDatabase } from '@tend/infrastructure/testing';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import {
  clearRecordedErrors,
  formatDiagnostics,
  recentErrors,
  recordError,
  resetDiagnosticsForTests,
  type DiagnosticsData,
} from '../shared/diagnostics';
import { AppErrorBoundary, RouteErrorPage } from './AppErrorBoundary';
import { AppProvider } from './providers/AppProvider';
import { fakeNotifier, renderApp } from './test-utils';

beforeEach(() => {
  localStorage.clear();
  resetDiagnosticsForTests();
});

describe('recorded errors', () => {
  it('keeps the newest ten, clips long text and survives a reload', () => {
    for (let i = 0; i < 12; i += 1) recordError('test', new Error(`failure ${i}`));
    recordError('test', new Error('x'.repeat(1000)));
    const list = recentErrors();
    expect(list).toHaveLength(10);
    expect(list[0]?.message).toBe('failure 3');
    expect(list.at(-1)?.message.length).toBeLessThan(400);

    resetDiagnosticsForTests();
    expect(recentErrors()).toHaveLength(10);

    clearRecordedErrors();
    resetDiagnosticsForTests();
    expect(recentErrors()).toEqual([]);
  });

  it('accepts things that are not Error objects and never throws', () => {
    recordError('promise', 'just text');
    recordError('promise', { odd: true });
    recordError('promise', undefined);
    expect(recentErrors().map((e) => e.message)).toEqual([
      'just text',
      '[object Object]',
      'undefined',
    ]);
  });
});

describe('formatDiagnostics', () => {
  const data: DiagnosticsData = {
    generatedAt: '2026-11-05T06:30:00.000Z',
    version: '1.2.3',
    build: '2026-11-05',
    schemaVersion: 2,
    latestSchemaVersion: 2,
    backupFormatVersion: 4,
    counts: { activities: 3, completions: 7 },
    storage: { persistence: 'best-effort', usedBytes: 2048, quotaBytes: 5 * 1024 * 1024 },
    attachments: { count: 1, totalBytes: 4096 },
    environment: {
      userAgent: 'TestBrowser/1',
      language: 'en-IN',
      timeZone: 'Asia/Kolkata',
      online: true,
      installed: false,
    },
    errors: [
      {
        at: '2026-11-05T06:00:00.000Z',
        source: 'screen',
        message: 'boom',
        stack: 'Error: boom\n at a\n at b',
      },
    ],
  };

  it('lists versions, counts and errors as plain text', () => {
    const text = formatDiagnostics(data);
    expect(text).toContain('App version: 1.2.3 (build 2026-11-05)');
    expect(text).toContain('Data format on this device: 2 (this app understands up to 2)');
    expect(text).toContain('  activities: 3');
    expect(text).toContain('[screen] boom');
    expect(formatDiagnostics({ ...data, errors: [] })).toContain('Recent errors: none');
  });
});

describe('diagnostics in settings', () => {
  it('shows versions and counts, and copies the report', async () => {
    const { user } = renderApp('/settings');
    // userEvent installs its own clipboard, so ours goes in afterwards.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const heading = await screen.findByRole('heading', { name: 'Diagnostics' });
    const section = heading.closest('section')!;
    const format = await within(section).findByText('Data format');
    expect(format.nextSibling).toHaveTextContent(/^1 of 1$/);

    await user.click(within(section).getByRole('button', { name: 'Copy diagnostics' }));
    expect(await within(section).findByText('Diagnostics copied.')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0]).toContain('Tend diagnostics');
  });

  it('shows recorded errors and can clear them', async () => {
    recordError('test', new Error('earlier problem'));
    const { user } = renderApp('/settings');
    const section = (await screen.findByRole('heading', { name: 'Diagnostics' })).closest(
      'section',
    )!;
    expect(await within(section).findByText('Recent errors')).toBeInTheDocument();
    await user.click(await within(section).findByRole('button', { name: 'Clear recorded errors' }));
    await waitFor(() => expect(recentErrors()).toEqual([]));
    expect(within(section).queryByRole('button', { name: 'Clear recorded errors' })).toBeNull();
  });

  it('says so when the browser blocks copying', async () => {
    const { user } = renderApp('/settings');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const section = (await screen.findByRole('heading', { name: 'Diagnostics' })).closest(
      'section',
    )!;
    await user.click(await within(section).findByRole('button', { name: 'Copy diagnostics' }));
    expect(await within(section).findByText(/would not allow copying/)).toBeInTheDocument();
  });
});

function Boom(): never {
  throw new Error('kaboom');
}

function mount(ui: React.ReactNode) {
  render(
    <AppProvider
      open={() => Promise.resolve(createNodeSqliteDatabase())}
      notifier={fakeNotifier().notifier}
      files={createMemoryAttachmentStorage()}
    >
      {ui}
    </AppProvider>,
  );
}

describe('when a screen fails', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a recovery panel with a backup, records the error, and can retry', async () => {
    mount(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
    expect(alert).toHaveTextContent('kaboom');
    expect(within(alert).getByRole('button', { name: 'Download a backup' })).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(recentErrors().some((e) => e.message === 'kaboom' && e.source === 'screen')).toBe(true);
  });

  it('downloads a backup from the recovery panel', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    mount(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Download a backup' }));
    expect(await screen.findByText(/Backup saved/)).toBeInTheDocument();
    expect(click).toHaveBeenCalled();
  });

  it('keeps the rest of the app usable when one route fails', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: <Outlet />,
          errorElement: <RouteErrorPage />,
          children: [{ index: true, element: <Boom /> }],
        },
      ],
      { initialEntries: ['/'] },
    );
    mount(<RouterProvider router={router} />);
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(recentErrors().some((e) => e.message === 'kaboom')).toBe(true);
  });
});
