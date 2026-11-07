import { useState } from 'react';
import { getCalendarMonth, type CalendarEntry, type CalendarEntryKind } from '@tend/application';
import { localDateOf, type LocalDate } from '@tend/domain';
import { useApp } from '../../app/providers/AppProvider';
import { deviceTimeZone, formatDate, useLiveQuery } from '../../shared/hooks';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Every kind has a symbol and a word as well as a colour, so meaning never rests on colour alone. */
const KINDS: Record<CalendarEntryKind, { symbol: string; label: string; style: string }> = {
  overdue: { symbol: '⚠', label: 'Overdue', style: 'bg-danger-soft text-danger' },
  due: { symbol: '●', label: 'Due', style: 'bg-warn-soft text-warn' },
  done: { symbol: '✓', label: 'Done', style: 'bg-ok-soft text-ok' },
  skipped: { symbol: '↷', label: 'Skipped', style: 'bg-sunken text-muted' },
  projected: { symbol: '○', label: 'Planned', style: 'bg-info-soft text-info' },
};

const monthTitle = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

export function CalendarPage() {
  const { deps } = useApp();
  const timeZone = deviceTimeZone();
  const today = localDateOf(deps.clock.now(), timeZone);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [selected, setSelected] = useState<LocalDate>(today);

  const calendar = useLiveQuery(
    ({ repos }) => getCalendarMonth(repos, { year, month, today, timeZone }),
    `${year}-${month}-${today}`,
  );

  function step(delta: number) {
    const index = year * 12 + (month - 1) + delta;
    setYear(Math.floor(index / 12));
    setMonth((index % 12) + 1);
  }

  function goToToday() {
    setYear(Number(today.slice(0, 4)));
    setMonth(Number(today.slice(5, 7)));
    setSelected(today);
  }

  const selectedDay =
    calendar.status === 'ready'
      ? calendar.data.weeks.flat().find((d) => d.date === selected)
      : undefined;

  const nav = 'btn';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold">Calendar</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={nav}
            onClick={() => step(-1)}
            aria-label="Previous month"
          >
            ‹
          </button>
          <span role="status" aria-live="polite" className="min-w-36 text-center font-medium">
            {monthTitle(year, month)}
          </span>
          <button type="button" className={nav} onClick={() => step(1)} aria-label="Next month">
            ›
          </button>
          <button type="button" className={nav} onClick={goToToday}>
            Today
          </button>
        </div>
      </div>

      {calendar.status === 'loading' ? <p className="text-muted">Loading…</p> : null}
      {calendar.status === 'error' ? (
        <p role="alert" className="text-danger">
          {calendar.message}
        </p>
      ) : null}

      {calendar.status === 'ready' ? (
        <>
          <div role="grid" aria-label={monthTitle(year, month)} className="text-sm">
            <div role="row" className="grid grid-cols-7 gap-1 text-center text-xs text-muted">
              {WEEKDAYS.map((d) => (
                <div key={d} role="columnheader">
                  {d}
                </div>
              ))}
            </div>
            {calendar.data.weeks.map((week) => (
              <div key={week[0]?.date} role="row" className="mt-1 grid grid-cols-7 gap-1">
                {week.map((day) => {
                  const n = day.entries.length;
                  const isToday = day.date === today;
                  return (
                    <div role="gridcell" key={day.date}>
                      <button
                        type="button"
                        aria-label={`${formatDate(day.date)}, ${n === 0 ? 'nothing planned' : `${n} item${n === 1 ? '' : 's'}`}`}
                        aria-pressed={day.date === selected}
                        onClick={() => setSelected(day.date)}
                        className={`block h-16 w-full overflow-hidden rounded border p-1 text-left align-top sm:h-24 ${
                          day.inMonth ? 'bg-surface' : 'bg-canvas text-faint'
                        } ${day.date === selected ? 'border-brand ring-1 ring-brand' : 'border-line'}`}
                      >
                        <span
                          className={`text-xs ${isToday ? 'rounded bg-brand px-1 font-semibold text-white' : ''}`}
                        >
                          {Number(day.date.slice(8, 10))}
                        </span>
                        <span className="mt-0.5 block space-y-0.5">
                          {day.entries.slice(0, 2).map((e, i) => (
                            <Pill key={i} entry={e} compact />
                          ))}
                          {n > 2 ? <span className="block text-xs">+{n - 2} more</span> : null}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <section aria-labelledby="day-heading" className="space-y-2">
            <h3 id="day-heading" className="font-medium">
              {formatDate(selected)}
            </h3>
            {selectedDay && selectedDay.entries.length > 0 ? (
              <ul className="space-y-1">
                {selectedDay.entries.map((e, i) => (
                  <li key={i}>
                    <Pill entry={e} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nothing on this day.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Pill({ entry, compact = false }: { entry: CalendarEntry; compact?: boolean }) {
  const kind = KINDS[entry.kind];
  return (
    <span
      className={`block truncate rounded px-1 ${kind.style} ${compact ? 'text-xs' : 'px-2 py-1 text-sm'}`}
    >
      <span aria-hidden="true">{kind.symbol} </span>
      <span className="sr-only">{kind.label}: </span>
      {entry.activityName}
      {compact ? null : <span className="text-xs"> · {kind.label}</span>}
    </span>
  );
}
