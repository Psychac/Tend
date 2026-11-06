import type {
  Activity,
  ActivityId,
  Asset,
  AssetId,
  Attachment,
  AttachmentId,
  AuditEvent,
  Category,
  CategoryId,
  Completion,
  CompletionId,
  CompletionVoid,
  CompletionVoidId,
  Reminder,
  ReminderDelivery,
  ReminderDeliveryId,
  ReminderId,
  EntityMeta,
  Instant,
  LocalDate,
  Location,
  LocationId,
  Measurement,
  MeasurementId,
  Occurrence,
  OccurrenceId,
  Schedule,
  ScheduleId,
  TimeZoneId,
  UserId,
} from '@tend/domain';
import type { SqlValue } from './sql';

export type Row = Record<string, unknown>;
export type RowValues = Record<string, SqlValue>;

const str = (r: Row, k: string): string => String(r[k]);
const optStr = <T extends string>(r: Row, k: string): T | undefined =>
  r[k] === null || r[k] === undefined ? undefined : (String(r[k]) as T);
const num = (r: Row, k: string): number => Number(r[k]);
const optNum = (r: Row, k: string): number | undefined =>
  r[k] === null || r[k] === undefined ? undefined : Number(r[k]);
const json = <T>(r: Row, k: string, fallback: T): T =>
  r[k] === null || r[k] === undefined ? fallback : (JSON.parse(String(r[k])) as T);
const nv = <T extends SqlValue>(v: T | undefined): T | null => v ?? null;

const metaFrom = (r: Row): EntityMeta => ({
  ownerId: str(r, 'owner_id') as UserId,
  createdAt: str(r, 'created_at') as Instant,
  updatedAt: str(r, 'updated_at') as Instant,
  version: num(r, 'version'),
});

const metaTo = (m: EntityMeta): RowValues => ({
  owner_id: m.ownerId,
  created_at: m.createdAt,
  updated_at: m.updatedAt,
  version: m.version,
});

export interface Mapper<E> {
  toRow(entity: E): RowValues;
  fromRow(row: Row): E;
}

export const categoryMapper: Mapper<Category> = {
  toRow: (c) => ({ ...metaTo(c.meta), name: c.name, description: nv(c.description) }),
  fromRow: (r) => ({
    id: str(r, 'id') as CategoryId,
    meta: metaFrom(r),
    name: str(r, 'name'),
    description: optStr(r, 'description'),
  }),
};

export const locationMapper: Mapper<Location> = {
  toRow: (l) => ({
    ...metaTo(l.meta),
    name: l.name,
    kind: l.kind,
    parent_id: nv(l.parentId),
  }),
  fromRow: (r) => ({
    id: str(r, 'id') as LocationId,
    meta: metaFrom(r),
    name: str(r, 'name'),
    kind: str(r, 'kind') as Location['kind'],
    parentId: optStr<LocationId>(r, 'parent_id'),
  }),
};

export const assetMapper: Mapper<Asset> = {
  toRow: (a) => ({
    ...metaTo(a.meta),
    name: a.name,
    category_id: nv(a.categoryId),
    location_id: nv(a.locationId),
    status: a.status,
    purchase_date: nv(a.purchase.date),
    purchase_price_minor: nv(a.purchase.price?.minor),
    purchase_currency: nv(a.purchase.price?.currency),
    vendor: nv(a.purchase.vendor),
    warranty_expires_on: nv(a.warranty?.expiresOn),
    warranty_notes: nv(a.warranty?.notes),
    notes: nv(a.notes),
  }),
  fromRow: (r) => {
    const priceMinor = optNum(r, 'purchase_price_minor');
    const warrantyOn = optStr<LocalDate>(r, 'warranty_expires_on');
    return {
      id: str(r, 'id') as AssetId,
      meta: metaFrom(r),
      name: str(r, 'name'),
      categoryId: optStr<CategoryId>(r, 'category_id'),
      locationId: optStr<LocationId>(r, 'location_id'),
      status: str(r, 'status') as Asset['status'],
      purchase: {
        date: optStr<LocalDate>(r, 'purchase_date'),
        price:
          priceMinor === undefined
            ? undefined
            : { minor: priceMinor, currency: str(r, 'purchase_currency') },
        vendor: optStr(r, 'vendor'),
      },
      warranty: warrantyOn
        ? { expiresOn: warrantyOn, notes: optStr(r, 'warranty_notes') }
        : undefined,
      notes: optStr(r, 'notes'),
    };
  },
};

export const activityMapper: Mapper<Activity> = {
  toRow: (a) => ({
    ...metaTo(a.meta),
    name: a.name,
    description: nv(a.description),
    type: a.type,
    category_id: nv(a.categoryId),
    location_id: nv(a.locationId),
    asset_id: nv(a.assetId),
    priority: a.priority,
    estimated_minutes: nv(a.estimatedMinutes),
    checklist: JSON.stringify(a.checklist),
    measurement_requirements: JSON.stringify(a.measurementRequirements),
    archived_at: nv(a.archivedAt),
  }),
  fromRow: (r) => ({
    id: str(r, 'id') as ActivityId,
    meta: metaFrom(r),
    name: str(r, 'name'),
    description: optStr(r, 'description'),
    type: str(r, 'type') as Activity['type'],
    categoryId: optStr<CategoryId>(r, 'category_id'),
    locationId: optStr<LocationId>(r, 'location_id'),
    assetId: optStr<AssetId>(r, 'asset_id'),
    priority: str(r, 'priority') as Activity['priority'],
    estimatedMinutes: optNum(r, 'estimated_minutes'),
    checklist: json(r, 'checklist', []),
    measurementRequirements: json(r, 'measurement_requirements', []),
    archivedAt: optStr<Instant>(r, 'archived_at'),
  }),
};

export const scheduleMapper: Mapper<Schedule> = {
  toRow: (s) => ({
    ...metaTo(s.meta),
    activity_id: s.activityId,
    strategy: JSON.stringify(s.strategy),
    grace_days: s.policy.graceDays,
    time_zone: s.timeZone,
    starts_on: s.startsOn,
    ends_on: nv(s.endsOn),
    paused_at: nv(s.pausedAt),
  }),
  fromRow: (r) => ({
    id: str(r, 'id') as ScheduleId,
    meta: metaFrom(r),
    activityId: str(r, 'activity_id') as ActivityId,
    strategy: json(r, 'strategy', undefined as unknown as Schedule['strategy']),
    policy: { graceDays: num(r, 'grace_days') },
    timeZone: str(r, 'time_zone') as TimeZoneId,
    startsOn: str(r, 'starts_on') as LocalDate,
    endsOn: optStr<LocalDate>(r, 'ends_on'),
    pausedAt: optStr<Instant>(r, 'paused_at'),
  }),
};

export const occurrenceMapper: Mapper<Occurrence> = {
  toRow: (o) => ({
    ...metaTo(o.meta),
    activity_id: o.activityId,
    schedule_id: nv(o.scheduleId),
    due_on: o.dueOn,
    status: o.status,
    resolved_at: nv(o.resolvedAt),
    snoozed_until: nv(o.snoozedUntil),
  }),
  fromRow: (r) => ({
    id: str(r, 'id') as OccurrenceId,
    meta: metaFrom(r),
    activityId: str(r, 'activity_id') as ActivityId,
    scheduleId: optStr<ScheduleId>(r, 'schedule_id'),
    dueOn: str(r, 'due_on') as LocalDate,
    status: str(r, 'status') as Occurrence['status'],
    resolvedAt: optStr<Instant>(r, 'resolved_at'),
    snoozedUntil: optStr<LocalDate>(r, 'snoozed_until'),
  }),
};

export const completionMapper: Mapper<Completion> = {
  toRow: (c) => ({
    ...metaTo(c.meta),
    activity_id: c.activityId,
    occurrence_id: nv(c.occurrenceId),
    completed_at: c.completedAt,
    planned_for: nv(c.plannedFor),
    notes: nv(c.notes),
    cost_minor: nv(c.cost?.minor),
    cost_currency: nv(c.cost?.currency),
    checklist_results: JSON.stringify(c.checklistResults),
    deviation_reason: nv(c.deviationReason),
  }),
  fromRow: (r) => {
    const costMinor = optNum(r, 'cost_minor');
    return {
      id: str(r, 'id') as CompletionId,
      meta: metaFrom(r),
      activityId: str(r, 'activity_id') as ActivityId,
      occurrenceId: optStr<OccurrenceId>(r, 'occurrence_id'),
      completedAt: str(r, 'completed_at') as Instant,
      plannedFor: optStr<LocalDate>(r, 'planned_for'),
      notes: optStr(r, 'notes'),
      cost:
        costMinor === undefined
          ? undefined
          : { minor: costMinor, currency: str(r, 'cost_currency') },
      checklistResults: json(r, 'checklist_results', []),
      deviationReason: optStr(r, 'deviation_reason'),
    };
  },
};

export const completionVoidMapper: Mapper<CompletionVoid> = {
  toRow: (v) => ({
    ...metaTo(v.meta),
    completion_id: v.completionId,
    replaced_by: nv(v.replacedBy),
    voided_at: v.voidedAt,
    reason: nv(v.reason),
  }),
  fromRow: (r) => ({
    id: str(r, 'id') as CompletionVoidId,
    meta: metaFrom(r),
    completionId: str(r, 'completion_id') as CompletionId,
    voidedAt: str(r, 'voided_at') as Instant,
    replacedBy: optStr<CompletionId>(r, 'replaced_by'),
    reason: optStr(r, 'reason'),
  }),
};

export const reminderMapper: Mapper<Reminder> = {
  toRow: (r) => ({
    ...metaTo(r.meta),
    activity_id: r.activityId,
    lead_days: r.leadDays,
    at_time: r.atTime,
    enabled: r.enabled ? 1 : 0,
  }),
  fromRow: (r) => ({
    id: str(r, 'id') as ReminderId,
    meta: metaFrom(r),
    activityId: str(r, 'activity_id') as ActivityId,
    leadDays: num(r, 'lead_days'),
    atTime: str(r, 'at_time'),
    enabled: num(r, 'enabled') === 1,
  }),
};

export const reminderDeliveryMapper: Mapper<ReminderDelivery> = {
  toRow: (d) => ({
    ...metaTo(d.meta),
    reminder_id: d.reminderId,
    occurrence_id: d.occurrenceId,
    due_on: d.dueOn,
    delivered_at: d.deliveredAt,
  }),
  fromRow: (r) => ({
    id: str(r, 'id') as ReminderDeliveryId,
    meta: metaFrom(r),
    reminderId: str(r, 'reminder_id') as ReminderId,
    occurrenceId: str(r, 'occurrence_id') as OccurrenceId,
    dueOn: str(r, 'due_on') as LocalDate,
    deliveredAt: str(r, 'delivered_at') as Instant,
  }),
};

export const measurementMapper: Mapper<Measurement> = {
  toRow: (m) => ({
    ...metaTo(m.meta),
    key: m.key,
    kind: m.value.kind,
    numeric_value: m.value.kind === 'numeric' ? m.value.quantity.value : null,
    unit: m.value.kind === 'numeric' ? m.value.quantity.unit : null,
    label: m.value.kind === 'qualitative' ? m.value.label : null,
    measured_at: m.measuredAt,
    asset_id: nv(m.assetId),
    activity_id: nv(m.activityId),
    completion_id: nv(m.completionId),
  }),
  fromRow: (r) => ({
    id: str(r, 'id') as MeasurementId,
    meta: metaFrom(r),
    key: str(r, 'key'),
    value:
      str(r, 'kind') === 'numeric'
        ? { kind: 'numeric', quantity: { value: num(r, 'numeric_value'), unit: str(r, 'unit') } }
        : { kind: 'qualitative', label: str(r, 'label') },
    measuredAt: str(r, 'measured_at') as Instant,
    assetId: optStr<AssetId>(r, 'asset_id'),
    activityId: optStr<ActivityId>(r, 'activity_id'),
    completionId: optStr<CompletionId>(r, 'completion_id'),
  }),
};

export const auditMapper: Mapper<AuditEvent> = {
  toRow: (e) => ({
    ...metaTo(e.meta),
    entity_type: e.entityType,
    entity_id: e.entityId,
    action: e.action,
    occurred_at: e.occurredAt,
    summary: nv(e.summary),
  }),
  fromRow: (r) => ({
    id: str(r, 'id') as AuditEvent['id'],
    meta: metaFrom(r),
    entityType: str(r, 'entity_type'),
    entityId: str(r, 'entity_id'),
    action: str(r, 'action') as AuditEvent['action'],
    occurredAt: str(r, 'occurred_at') as Instant,
    summary: optStr(r, 'summary'),
  }),
};

export const attachmentMapper: Mapper<Attachment> = {
  toRow: (a) => ({
    ...metaTo(a.meta),
    subject_type: a.subject.type,
    subject_id: a.subject.id,
    file_name: a.fileName,
    mime_type: a.mimeType,
    size_bytes: a.sizeBytes,
    sha256: a.sha256,
    status: a.status,
    uploaded_at: nv(a.uploadedAt),
  }),
  fromRow: (r) => ({
    id: str(r, 'id') as AttachmentId,
    meta: metaFrom(r),
    subject: {
      type: str(r, 'subject_type') as Attachment['subject']['type'],
      id: str(r, 'subject_id'),
    },
    fileName: str(r, 'file_name'),
    mimeType: str(r, 'mime_type'),
    sizeBytes: num(r, 'size_bytes'),
    sha256: str(r, 'sha256'),
    status: str(r, 'status') as Attachment['status'],
    uploadedAt: optStr<Instant>(r, 'uploaded_at'),
  }),
};
