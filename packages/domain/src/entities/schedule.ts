import { Issues, isNonBlank } from '../core';
import type {
  ActivityId,
  DomainError,
  Instant,
  LocalDate,
  Quantity,
  Result,
  ScheduleId,
  TimeZoneId,
  UserId,
} from '../core';
import { newMeta, type EntityMeta } from './meta';

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

/** Weekday numbers follow ISO-8601: 1 = Monday ... 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Interval {
  readonly every: number;
  readonly unit: RecurrenceUnit;
}

/**
 * Scheduling strategies from spec 6.4.
 *
 * - `calendar`: rule-based (every 2 weeks on Mon/Thu, monthly on the 15th).
 * - `fixed_interval`: anchor + n intervals, regardless of when work was done.
 * - `completion_interval`: next due is one interval after the last completion
 *   (the floating strategy).
 * - `usage`: due when a meter advances by `every` since the last service.
 * - `event`: due `delayDays` after another activity is completed. Triggered by that
 *   completion (see the application layer), never by the date.
 * - `condition`: due when a numeric reading crosses the threshold (see `crossedCondition`).
 *   It fires on the crossing, so it must come back across before it can fire again.
 */
export type ScheduleStrategy =
  | {
      readonly kind: 'calendar';
      readonly interval: Interval;
      readonly byWeekday?: readonly IsoWeekday[] | undefined;
      readonly byMonthDay?: number | undefined;
    }
  | { readonly kind: 'completion_interval'; readonly interval: Interval }
  | { readonly kind: 'fixed_interval'; readonly interval: Interval; readonly anchor: LocalDate }
  | { readonly kind: 'usage'; readonly every: Quantity; readonly meterKey: string }
  | {
      readonly kind: 'condition';
      readonly measurementKey: string;
      readonly comparator: 'gt' | 'gte' | 'lt' | 'lte';
      readonly threshold: number;
    }
  | {
      readonly kind: 'event';
      /** Completing this activity triggers an occurrence of the schedule's own activity. */
      readonly afterActivityId: ActivityId;
      /** Whole days between that completion and the new occurrence's due date. */
      readonly delayDays: number;
    };

/** Policy knobs from spec 6.5 that apply to any strategy. */
export interface SchedulePolicy {
  /** Days after the due date before an occurrence counts as overdue. */
  readonly graceDays: number;
}

export interface Schedule {
  readonly id: ScheduleId;
  readonly meta: EntityMeta;
  readonly activityId: ActivityId;
  readonly strategy: ScheduleStrategy;
  readonly policy: SchedulePolicy;
  readonly timeZone: TimeZoneId;
  readonly startsOn: LocalDate;
  readonly endsOn?: LocalDate | undefined;
  readonly pausedAt?: Instant | undefined;
}

export interface NewSchedule {
  readonly id: ScheduleId;
  readonly ownerId: UserId;
  readonly now: Instant;
  readonly activityId: ActivityId;
  readonly strategy: ScheduleStrategy;
  readonly policy?: Partial<SchedulePolicy> | undefined;
  readonly timeZone: TimeZoneId;
  readonly startsOn: LocalDate;
  readonly endsOn?: LocalDate | undefined;
}

const isPositiveInt = (n: number): boolean => Number.isInteger(n) && n >= 1;

function checkInterval(issues: Issues, interval: Interval): void {
  issues.check(
    isPositiveInt(interval.every),
    'strategy.interval.every',
    'must be a whole number >= 1',
  );
}

function checkStrategy(issues: Issues, s: ScheduleStrategy): void {
  switch (s.kind) {
    case 'calendar':
      checkInterval(issues, s.interval);
      issues.check(
        s.byMonthDay === undefined ||
          (Number.isInteger(s.byMonthDay) && s.byMonthDay >= 1 && s.byMonthDay <= 31),
        'strategy.byMonthDay',
        'must be between 1 and 31',
      );
      issues.check(
        s.byWeekday === undefined ||
          (s.byWeekday.length > 0 && s.byWeekday.every((d) => d >= 1 && d <= 7)),
        'strategy.byWeekday',
        'must be a non-empty list of ISO weekdays (1-7)',
      );
      issues.check(
        (s.byWeekday === undefined || s.interval.unit === 'week') &&
          (s.byMonthDay === undefined || s.interval.unit === 'month'),
        'strategy',
        'byWeekday requires a weekly interval and byMonthDay a monthly one',
      );
      break;
    case 'completion_interval':
    case 'fixed_interval':
      checkInterval(issues, s.interval);
      break;
    case 'usage':
      issues.check(
        Number.isFinite(s.every.value) && s.every.value > 0,
        'strategy.every',
        'must be > 0',
      );
      issues.check(isNonBlank(s.meterKey), 'strategy.meterKey', 'is required');
      break;
    case 'condition':
      issues.check(isNonBlank(s.measurementKey), 'strategy.measurementKey', 'is required');
      issues.check(Number.isFinite(s.threshold), 'strategy.threshold', 'must be finite');
      issues.check(
        s.comparator === 'gt' ||
          s.comparator === 'gte' ||
          s.comparator === 'lt' ||
          s.comparator === 'lte',
        'strategy.comparator',
        'must be gt, gte, lt or lte',
      );
      break;
    case 'event':
      issues.check(isNonBlank(s.afterActivityId), 'strategy.afterActivityId', 'is required');
      issues.check(
        Number.isInteger(s.delayDays) && s.delayDays >= 0,
        'strategy.delayDays',
        'must be a whole number >= 0',
      );
      break;
  }
}

export function createSchedule(input: NewSchedule): Result<Schedule, DomainError> {
  const graceDays = input.policy?.graceDays ?? 0;
  const issues = new Issues();

  checkStrategy(issues, input.strategy);
  issues.check(Number.isInteger(graceDays) && graceDays >= 0, 'policy.graceDays', 'must be >= 0');
  issues.check(
    input.endsOn === undefined || input.endsOn >= input.startsOn,
    'endsOn',
    'cannot be before startsOn',
  );

  return issues.finish(() => ({
    id: input.id,
    meta: newMeta(input.ownerId, input.now),
    activityId: input.activityId,
    strategy: input.strategy,
    policy: { graceDays },
    timeZone: input.timeZone,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    pausedAt: undefined,
  }));
}
