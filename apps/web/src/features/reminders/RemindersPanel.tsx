import { dueText } from '../../shared/notifier';
import { useReminderStatus } from './useReminderStatus';

/** Work whose reminder time has come, shown at the top of the dashboard. */
export function RemindersPanel() {
  const status = useReminderStatus();
  if (status.status !== 'ready' || status.data.fired.length === 0) return null;
  const { fired } = status.data;

  return (
    <section
      aria-labelledby="reminders-heading"
      className="space-y-2 rounded border border-amber-300 bg-amber-50 p-3"
    >
      <h3 id="reminders-heading" className="text-sm font-semibold text-amber-900">
        Reminders ({fired.length})
      </h3>
      <ul className="space-y-1 text-sm">
        {fired.map((item) => (
          <li key={`${item.reminder.id}|${item.occurrence.id}`}>
            <span className="font-medium">{item.activity.name}</span>{' '}
            <span className={item.daysUntilDue < 0 ? 'font-medium text-red-800' : 'text-slate-700'}>
              {dueText(item.daysUntilDue)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
