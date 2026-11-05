import { NavLink, Outlet } from 'react-router';
import { useReminderCount } from '../../features/reminders/ReminderBadge';

const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/activities', label: 'Activities' },
  { to: '/assets', label: 'Assets' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/history', label: 'History' },
  { to: '/insights', label: 'Insights' },
  { to: '/settings', label: 'Settings' },
];

export function AppLayout() {
  const reminders = useReminderCount();
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold">Personal Upkeep</h1>
        <nav aria-label="Primary" className="mt-2 flex flex-wrap gap-3 text-sm">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                isActive ? 'font-semibold underline' : 'text-slate-600'
              }
            >
              {item.label}
              {item.to === '/' && reminders > 0 ? (
                <span
                  aria-label={`${reminders} reminder${reminders === 1 ? '' : 's'}`}
                  className="ml-1 rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white"
                >
                  {reminders}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  );
}
