import { Issues, isNonBlank } from '../core';
import type {
  ActivityId,
  AssetId,
  CategoryId,
  ChecklistItemId,
  DomainError,
  Instant,
  LocationId,
  Result,
  UserId,
} from '../core';
import { newMeta, type EntityMeta } from './meta';

export type ActivityType =
  | 'cleaning'
  | 'inspection'
  | 'maintenance'
  | 'replacement'
  | 'renewal'
  | 'routine'
  | 'administrative'
  | 'custom';

export type Priority = 'low' | 'normal' | 'high';

export interface ChecklistItem {
  readonly id: ChecklistItemId;
  readonly label: string;
}

export interface MeasurementRequirement {
  readonly key: string;
  readonly unit: string;
  readonly required: boolean;
}

export interface Activity {
  readonly id: ActivityId;
  readonly meta: EntityMeta;
  readonly name: string;
  readonly description?: string | undefined;
  readonly type: ActivityType;
  readonly categoryId?: CategoryId | undefined;
  readonly locationId?: LocationId | undefined;
  readonly assetId?: AssetId | undefined;
  readonly priority: Priority;
  readonly estimatedMinutes?: number | undefined;
  readonly checklist: readonly ChecklistItem[];
  readonly measurementRequirements: readonly MeasurementRequirement[];
  readonly archivedAt?: Instant | undefined;
}

export interface NewActivity {
  readonly id: ActivityId;
  readonly ownerId: UserId;
  readonly now: Instant;
  readonly name: string;
  readonly description?: string | undefined;
  readonly type: ActivityType;
  readonly categoryId?: CategoryId | undefined;
  readonly locationId?: LocationId | undefined;
  readonly assetId?: AssetId | undefined;
  readonly priority?: Priority | undefined;
  readonly estimatedMinutes?: number | undefined;
  readonly checklist?: readonly ChecklistItem[] | undefined;
  readonly measurementRequirements?: readonly MeasurementRequirement[] | undefined;
}

export function createActivity(input: NewActivity): Result<Activity, DomainError> {
  const checklist = input.checklist ?? [];
  const requirements = input.measurementRequirements ?? [];
  const issues = new Issues();

  issues.check(isNonBlank(input.name), 'name', 'is required');
  issues.check(input.name.length <= 200, 'name', 'must be 200 characters or fewer');
  issues.check(
    input.estimatedMinutes === undefined ||
      (Number.isInteger(input.estimatedMinutes) && input.estimatedMinutes > 0),
    'estimatedMinutes',
    'must be a positive whole number',
  );
  issues.check(
    checklist.every((c) => isNonBlank(c.label)),
    'checklist',
    'items must have a label',
  );
  issues.check(
    new Set(checklist.map((c) => c.id)).size === checklist.length,
    'checklist',
    'item ids must be unique',
  );
  issues.check(
    requirements.every((r) => isNonBlank(r.key) && isNonBlank(r.unit)),
    'measurementRequirements',
    'each requirement needs a key and unit',
  );
  issues.check(
    new Set(requirements.map((r) => r.key)).size === requirements.length,
    'measurementRequirements',
    'keys must be unique',
  );

  return issues.finish(() => ({
    id: input.id,
    meta: newMeta(input.ownerId, input.now),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    type: input.type,
    categoryId: input.categoryId,
    locationId: input.locationId,
    assetId: input.assetId,
    priority: input.priority ?? 'normal',
    estimatedMinutes: input.estimatedMinutes,
    checklist,
    measurementRequirements: requirements,
    archivedAt: undefined,
  }));
}
