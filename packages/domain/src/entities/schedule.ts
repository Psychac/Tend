import type { ActivityId, LocalDate, Quantity, ScheduleId, TimeZoneId } from '../core';
import type { Instant } from '../core';
import type { EntityMeta } from './meta';

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

/** Weekday numbers follow ISO-8601: 1 = Monday ... 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Interval {
  readonly every: number;
  readonly unit: RecurrenceUnit;
}

/**
 * Scheduling strategies from spec 6.4. Parameters are intentionally minimal;
 * Epic 4 (Scheduling) refines them alongside the occurrence generator.
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
  | { readonly kind: 'event'; readonly eventName: string };

/** Policy knobs from spec 6.5 that apply to any strategy. */
export interface SchedulePolicy {
  readonly graceDays: number;
  /** Whether the next due date moves with the completion date or stays on the calendar. */
  readonly floating: boolean;
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
