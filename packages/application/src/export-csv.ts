import type { Repositories } from '@tend/contracts';
import { currencyExponent, localDateOf, type TimeZoneId } from '@tend/domain';
import { getHistory } from './queries';

/** Quotes a cell. Text a spreadsheet would run as a formula gets a leading apostrophe. */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const WHAT = { completed: 'Done', skipped: 'Skipped', missed: 'Missed', cancelled: 'Cancelled' };

/**
 * Everything in History as CSV, newest first: one row per entry, with the date in the person's
 * own zone and any cost as a plain decimal in its own currency (never converted).
 */
export async function exportHistoryCsv(repos: Repositories, timeZone: TimeZoneId): Promise<string> {
  const { entries } = await getHistory(repos, { timeZone, limit: 1_000_000 });
  const rows = [['Date', 'Activity', 'What happened', 'Planned for', 'Cost', 'Currency', 'Notes']];
  for (const e of entries) {
    const date = localDateOf(e.at, timeZone);
    if (e.kind === 'completed') {
      const cost = e.completion.cost;
      rows.push([
        date,
        e.activityName,
        WHAT.completed,
        e.completion.plannedFor ?? '',
        cost
          ? (cost.minor / 10 ** currencyExponent(cost.currency)).toFixed(
              currencyExponent(cost.currency),
            )
          : '',
        cost?.currency ?? '',
        e.completion.notes ?? '',
      ]);
    } else {
      rows.push([date, e.activityName, WHAT[e.kind], e.occurrence.dueOn, '', '', '']);
    }
  }
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
