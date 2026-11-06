import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { SyncIndicator } from '../../shared/ui/SyncIndicator';
import { useReminderCount } from '../../features/reminders/ReminderBadge';

const icon = (d: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);

const NAV = [
  {
    to: '/',
    label: 'Dashboard',
    icon: icon(
      <>
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </>,
    ),
  },
  {
    to: '/activities',
    label: 'Activities',
    icon: icon(
      <>
        <path d="M9 11l3 3 8-8" />
        <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
      </>,
    ),
  },
  {
    to: '/household',
    label: 'Household',
    icon: icon(
      <>
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h14V10" />
        <path d="M10 20v-6h4v6" />
      </>,
    ),
  },
  {
    to: '/routines',
    label: 'Routines',
    icon: icon(
      <>
        <path d="M17 2l4 4-4 4" />
        <path d="M3 11V9a3 3 0 0 1 3-3h15" />
        <path d="M7 22l-4-4 4-4" />
        <path d="M21 13v2a3 3 0 0 1-3 3H3" />
      </>,
    ),
  },
  {
    to: '/digital',
    label: 'Digital',
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </>,
    ),
  },
  {
    to: '/assets',
    label: 'Assets',
    icon: icon(
      <>
        <path d="M21 8l-9-5-9 5 9 5 9-5z" />
        <path d="M3 8v8l9 5 9-5V8" />
        <path d="M12 13v8" />
      </>,
    ),
  },
  {
    to: '/calendar',
    label: 'Calendar',
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="17" rx="2" />
        <path d="M8 2v4M16 2v4M3 10h18" />
      </>,
    ),
  },
  {
    to: '/history',
    label: 'History',
    icon: icon(
      <>
        <path d="M3 12a9 9 0 1 0 3-6.7" />
        <path d="M3 4v5h5" />
        <path d="M12 8v4l3 2" />
      </>,
    ),
  },
  {
    to: '/insights',
    label: 'Insights',
    icon: icon(
      <>
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
      </>,
    ),
  },
  {
    to: '/settings',
    label: 'Settings',
    icon: icon(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>,
    ),
  },
];

type Theme = 'system' | 'light' | 'dark';
const THEME_KEY = 'tend.theme';
const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };

function readTheme(): Theme {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      if (theme === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Theme still applies for this session when storage is unavailable.
    }
  }, [theme]);
  return [theme, () => setTheme(NEXT[theme])];
}

export function AppLayout() {
  const reminders = useReminderCount();
  const [theme, cycleTheme] = useTheme();

  return (
    <div className="min-h-screen md:pl-60">
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 flex overflow-x-auto border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:inset-y-0 md:right-auto md:w-60 md:flex-col md:gap-1 md:overflow-visible md:border-r md:border-t-0 md:p-3"
      >
        <div className="hidden items-center gap-2.5 px-2 pb-4 pt-2 md:flex">
          <span
            className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-white"
            aria-hidden="true"
          >
            {icon(<path d="M5 12.5l4.5 4.5L19 7" strokeWidth="2.6" />)}
          </span>
          <span className="text-base font-semibold tracking-tight">Tend</span>
        </div>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `relative flex min-w-[4.25rem] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-medium transition-colors md:min-w-0 md:flex-none md:flex-row md:justify-start md:gap-3 md:rounded-lg md:px-3 md:py-2 md:text-sm ${
                isActive
                  ? 'text-brand md:bg-brand-soft'
                  : 'text-muted hover:text-ink md:hover:bg-sunken'
              }`
            }
          >
            {item.icon}
            <span>{item.label}</span>
            {item.to === '/' && reminders > 0 ? (
              <span
                aria-label={`${reminders} reminder${reminders === 1 ? '' : 's'}`}
                className="badge absolute right-1/4 top-1 bg-warn-solid text-white md:static md:ml-auto"
              >
                {reminders}
              </span>
            ) : null}
          </NavLink>
        ))}
        <SyncIndicator className="hidden px-3 pb-1 md:mt-auto md:flex" />
        <button
          type="button"
          onClick={cycleTheme}
          aria-label={`Theme: ${theme}. Switch theme`}
          className="hidden items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-sunken hover:text-ink md:flex"
        >
          {theme === 'dark'
            ? icon(<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />)
            : theme === 'light'
              ? icon(
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </>,
                )
              : icon(
                  <>
                    <rect x="3" y="4" width="18" height="12" rx="2" />
                    <path d="M8 20h8M12 16v4" />
                  </>,
                )}
          <span className="capitalize">{theme} theme</span>
        </button>
      </nav>

      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface/90 px-4 py-3 backdrop-blur md:hidden">
        <h1 className="text-base font-semibold tracking-tight">Tend</h1>
        <SyncIndicator />
        <button
          type="button"
          onClick={cycleTheme}
          aria-label={`Theme: ${theme}. Switch theme`}
          className="btn !min-h-8 !px-2.5 !text-xs capitalize"
        >
          {theme}
        </button>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">
        <Outlet />
      </main>
    </div>
  );
}
