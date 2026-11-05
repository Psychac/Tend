/**
 * The local database schema, defined once as data. It feeds both the PowerSync
 * client schema (powersync.ts) and the plain SQL used to test the repositories.
 *
 * PowerSync adds the `id` primary key itself, so it is not listed here. Types
 * are limited to what PowerSync supports: text, integer, real. Dates are ISO
 * strings, booleans and JSON are text, and money is integer minor units.
 *
 * Every user-owned table carries the sync-ready columns from spec 7.6 and 8
 * (owner_id, created_at, updated_at, version) so enabling sync later needs no
 * data migration.
 */
export type ColumnType = 'text' | 'integer' | 'real';

export interface TableDef {
  readonly columns: Readonly<Record<string, ColumnType>>;
  readonly indexes?: Readonly<Record<string, readonly string[]>>;
}

const META = {
  owner_id: 'text',
  created_at: 'text',
  updated_at: 'text',
  version: 'integer',
} as const satisfies Record<string, ColumnType>;

export const TABLES = {
  categories: {
    columns: { ...META, name: 'text', description: 'text' },
  },
  locations: {
    columns: { ...META, name: 'text', kind: 'text', parent_id: 'text' },
  },
  assets: {
    columns: {
      ...META,
      name: 'text',
      category_id: 'text',
      location_id: 'text',
      status: 'text',
      purchase_date: 'text',
      purchase_price_minor: 'integer',
      purchase_currency: 'text',
      vendor: 'text',
      warranty_expires_on: 'text',
      warranty_notes: 'text',
      notes: 'text',
    },
    indexes: { by_status: ['status'] },
  },
  activities: {
    columns: {
      ...META,
      name: 'text',
      description: 'text',
      type: 'text',
      category_id: 'text',
      location_id: 'text',
      asset_id: 'text',
      priority: 'text',
      estimated_minutes: 'integer',
      checklist: 'text',
      measurement_requirements: 'text',
      archived_at: 'text',
    },
    indexes: { by_asset: ['asset_id'] },
  },
  schedules: {
    columns: {
      ...META,
      activity_id: 'text',
      strategy: 'text',
      grace_days: 'integer',
      time_zone: 'text',
      starts_on: 'text',
      ends_on: 'text',
      paused_at: 'text',
    },
    indexes: { by_activity: ['activity_id'] },
  },
  occurrences: {
    columns: {
      ...META,
      activity_id: 'text',
      schedule_id: 'text',
      due_on: 'text',
      status: 'text',
      resolved_at: 'text',
      snoozed_until: 'text',
    },
    indexes: { by_activity_due: ['activity_id', 'due_on'], by_status_due: ['status', 'due_on'] },
  },
  completions: {
    columns: {
      ...META,
      activity_id: 'text',
      occurrence_id: 'text',
      completed_at: 'text',
      planned_for: 'text',
      notes: 'text',
      cost_minor: 'integer',
      cost_currency: 'text',
      checklist_results: 'text',
      deviation_reason: 'text',
    },
    indexes: { by_activity_completed: ['activity_id', 'completed_at'] },
  },
  reminders: {
    columns: {
      ...META,
      activity_id: 'text',
      lead_days: 'integer',
      at_time: 'text',
      enabled: 'integer',
    },
    indexes: { by_activity: ['activity_id'] },
  },
  reminder_deliveries: {
    columns: {
      ...META,
      reminder_id: 'text',
      occurrence_id: 'text',
      due_on: 'text',
      delivered_at: 'text',
    },
    indexes: { by_reminder: ['reminder_id'] },
  },
  completion_voids: {
    columns: {
      ...META,
      completion_id: 'text',
      replaced_by: 'text',
      voided_at: 'text',
      reason: 'text',
    },
    indexes: { by_completion: ['completion_id'] },
  },
  measurements: {
    columns: {
      ...META,
      key: 'text',
      kind: 'text',
      numeric_value: 'real',
      unit: 'text',
      label: 'text',
      measured_at: 'text',
      asset_id: 'text',
      activity_id: 'text',
      completion_id: 'text',
    },
    indexes: {
      by_key_measured: ['key', 'measured_at'],
      by_asset: ['asset_id'],
      by_activity: ['activity_id'],
    },
  },
  audit_events: {
    columns: {
      ...META,
      entity_type: 'text',
      entity_id: 'text',
      action: 'text',
      occurred_at: 'text',
      summary: 'text',
    },
  },
} as const satisfies Record<string, TableDef>;

export type TableName = keyof typeof TABLES;

/** SQL to create the schema in a plain SQLite database (tests, tooling). */
export function schemaDdl(): string[] {
  return Object.entries(TABLES as Record<string, TableDef>).flatMap(([name, def]) => {
    const columns = Object.entries(def.columns).map(([c, t]) => `${c} ${t.toUpperCase()}`);
    const create = `CREATE TABLE ${name} (id TEXT PRIMARY KEY, ${columns.join(', ')})`;
    const indexes = Object.entries(def.indexes ?? {}).map(
      ([idx, cols]) => `CREATE INDEX ${name}_${idx} ON ${name} (${cols.join(', ')})`,
    );
    return [create, ...indexes];
  });
}
