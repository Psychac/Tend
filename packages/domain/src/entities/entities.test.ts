import type {
  ActivityId,
  AssetId,
  ChecklistItemId,
  CompletionId,
  Instant,
  LocalDate,
  MeasurementId,
  OccurrenceId,
} from '../core';
import { NOW, OWNER, sequentialIds } from '../testing';
import { createActivity } from './activity';
import { createAsset } from './asset';
import { createCompletion, createMeasurement } from './history';
import { newMeta } from './meta';
import { canTransition, transitionOccurrence, type Occurrence } from './occurrence';

const ids = sequentialIds();

describe('createActivity', () => {
  const base = () => ({
    id: ids.next<'Activity'>() as ActivityId,
    ownerId: OWNER,
    now: NOW,
    name: '  Clean AC filter ',
    type: 'maintenance' as const,
  });

  it('trims the name and applies defaults', () => {
    const r = createActivity(base());
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.name).toBe('Clean AC filter');
    expect(r.value.priority).toBe('normal');
    expect(r.value.meta.version).toBe(1);
  });

  it('reports every problem at once', () => {
    const r = createActivity({ ...base(), name: ' ', estimatedMinutes: -5 });
    if (r.ok) throw new Error('expected failure');
    expect(r.error.code).toBe('validation');
    expect(r.error.issues.map((i) => i.path).sort()).toEqual(['estimatedMinutes', 'name']);
  });

  it('rejects duplicate checklist item ids', () => {
    const item = { id: ids.next<'ChecklistItem'>() as ChecklistItemId, label: 'Rinse' };
    expect(createActivity({ ...base(), checklist: [item, item] }).ok).toBe(false);
  });
});

describe('createAsset', () => {
  it('rejects a warranty that expires before purchase', () => {
    const r = createAsset({
      id: ids.next<'Asset'>() as AssetId,
      ownerId: OWNER,
      now: NOW,
      name: 'Monitor',
      purchase: { date: '2026-06-01' as LocalDate },
      warranty: { expiresOn: '2026-01-01' as LocalDate },
    });
    expect(r.ok).toBe(false);
  });

  it('defaults status to active', () => {
    const r = createAsset({
      id: ids.next<'Asset'>() as AssetId,
      ownerId: OWNER,
      now: NOW,
      name: 'Car',
    });
    expect(r.ok && r.value.status).toBe('active');
  });
});

describe('createCompletion', () => {
  const base = () => ({
    id: ids.next<'Completion'>() as CompletionId,
    ownerId: OWNER,
    now: NOW,
    activityId: ids.next<'Activity'>() as ActivityId,
  });

  it('defaults completedAt to now and allows backdating', () => {
    const r1 = createCompletion(base());
    expect(r1.ok && r1.value.completedAt).toBe(NOW);
    const r2 = createCompletion({ ...base(), completedAt: '2026-11-01T08:00:00.000Z' as Instant });
    expect(r2.ok).toBe(true);
  });

  it('rejects completion in the future', () => {
    const r = createCompletion({ ...base(), completedAt: '2026-11-06T00:00:00.000Z' as Instant });
    expect(r.ok).toBe(false);
  });
});

describe('createMeasurement', () => {
  const base = () => ({
    id: ids.next<'Measurement'>() as MeasurementId,
    ownerId: OWNER,
    now: NOW,
    key: 'odometer',
    value: { kind: 'numeric' as const, quantity: { value: 42000, unit: 'km' } },
  });

  it('requires an asset or activity subject', () => {
    expect(createMeasurement(base()).ok).toBe(false);
    const assetId = ids.next<'Asset'>() as AssetId;
    expect(createMeasurement({ ...base(), assetId }).ok).toBe(true);
  });
});

describe('occurrence lifecycle', () => {
  const pending = (): Occurrence => ({
    id: ids.next<'Occurrence'>() as OccurrenceId,
    meta: newMeta(OWNER, NOW),
    activityId: ids.next<'Activity'>() as ActivityId,
    dueOn: '2026-11-05' as LocalDate,
    status: 'pending',
  });
  const later = '2026-11-05T12:00:00.000Z' as Instant;

  it('completes a pending occurrence and bumps the version', () => {
    const r = transitionOccurrence(pending(), 'completed', later);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.status).toBe('completed');
    expect(r.value.resolvedAt).toBe(later);
    expect(r.value.meta.version).toBe(2);
  });

  it('treats terminal states as final', () => {
    const done = transitionOccurrence(pending(), 'completed', later);
    if (!done.ok) throw new Error('setup failed');
    expect(transitionOccurrence(done.value, 'pending', later).ok).toBe(false);
    expect(canTransition('cancelled', 'completed')).toBe(false);
  });

  it('requires a later date to snooze, and snoozed is not a resolution', () => {
    expect(transitionOccurrence(pending(), 'snoozed', later).ok).toBe(false);
    expect(
      transitionOccurrence(pending(), 'snoozed', later, { snoozedUntil: '2026-11-05' as LocalDate })
        .ok,
    ).toBe(false);
    const r = transitionOccurrence(pending(), 'snoozed', later, {
      snoozedUntil: '2026-11-07' as LocalDate,
    });
    if (!r.ok) throw new Error(r.error.message);
    expect(r.value.resolvedAt).toBeUndefined();
    expect(canTransition(r.value.status, 'completed')).toBe(true);
  });
});
