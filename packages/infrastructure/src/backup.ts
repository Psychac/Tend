/**
 * Backup and restore (spec 15). A backup is a versioned JSON snapshot of every
 * table, independent of how the database is hosted or synchronised. It works at
 * the row level, driven by the schema in schema.ts, so it covers any table added
 * there without further code.
 */
import { TABLES, type ColumnType, type TableDef, type TableName } from './schema';
import type { SqlDatabase, SqlExecutor, SqlValue } from './sql';

export const BACKUP_FORMAT = 'tend-backup';
/** Bump when the shape of an export changes, and add a step to `MIGRATIONS`. */
export const BACKUP_SCHEMA_VERSION = 3;

export type BackupRow = Readonly<Record<string, SqlValue>>;
export type BackupTables = Readonly<Record<TableName, readonly BackupRow[]>>;

export interface BackupFile {
  readonly format: typeof BACKUP_FORMAT;
  readonly schemaVersion: number;
  readonly exportedAt: string;
  readonly counts: Readonly<Record<TableName, number>>;
  /** SHA-256 over the canonical form of `tables`; detects truncation and hand edits. */
  readonly checksum: string;
  readonly tables: BackupTables;
}

export type RestoreMode = 'merge' | 'replace';

const TABLE_NAMES = Object.keys(TABLES) as TableName[];
const defOf = (table: TableName): TableDef => TABLES[table] as TableDef;

/** Which columns point at another table's rows. Parents appear before children in TABLES. */
const REFERENCES: Readonly<Record<string, Readonly<Record<string, TableName>>>> = {
  locations: { parent_id: 'locations' },
  assets: { category_id: 'categories', location_id: 'locations' },
  activities: { category_id: 'categories', location_id: 'locations', asset_id: 'assets' },
  schedules: { activity_id: 'activities' },
  occurrences: { activity_id: 'activities', schedule_id: 'schedules' },
  completions: { activity_id: 'activities', occurrence_id: 'occurrences' },
  completion_voids: { completion_id: 'completions', replaced_by: 'completions' },
  reminders: { activity_id: 'activities' },
  reminder_deliveries: { reminder_id: 'reminders', occurrence_id: 'occurrences' },
  measurements: { asset_id: 'assets', activity_id: 'activities', completion_id: 'completions' },
};

/**
 * The format version in which each table first appeared (1 if not listed). An
 * older backup simply has no rows for a newer table, so upgrading it means
 * adding that table empty; if a later change needs to rewrite rows, add a
 * per-version step here.
 */
const ADDED_IN: Readonly<Partial<Record<TableName, number>>> = {
  completion_voids: 2,
  reminders: 3,
  reminder_deliveries: 3,
};

const tableNamesFor = (version: number): TableName[] =>
  TABLE_NAMES.filter((t) => (ADDED_IN[t] ?? 1) <= version);

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Key order and row order are fixed so the same data always hashes the same. */
function canonical(tables: BackupTables, names: readonly TableName[] = TABLE_NAMES): string {
  return JSON.stringify(
    names.map((t) => {
      const columns = ['id', ...Object.keys(defOf(t).columns)];
      return [t, tables[t].map((row) => columns.map((c) => row[c] ?? null))];
    }),
  );
}

/** The checksum a backup of the given format version must carry for these tables. */
export const backupChecksum = (
  tables: BackupTables,
  version: number = BACKUP_SCHEMA_VERSION,
): Promise<string> => sha256Hex(canonical(tables, tableNamesFor(version)));

export async function exportBackup(db: SqlExecutor, now: string): Promise<BackupFile> {
  const entries: [TableName, BackupRow[]][] = [];
  for (const table of TABLE_NAMES) {
    entries.push([table, await db.getAll<BackupRow>(`SELECT * FROM ${table} ORDER BY id`)]);
  }
  const tables = Object.fromEntries(entries) as unknown as BackupTables;
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now,
    counts: Object.fromEntries(entries.map(([t, rows]) => [t, rows.length])) as Record<
      TableName,
      number
    >,
    checksum: await sha256Hex(canonical(tables)),
    tables,
  };
}

export type ParseResult =
  | { readonly ok: true; readonly backup: BackupFile }
  | { readonly ok: false; readonly errors: readonly string[] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function validCell(value: unknown, type: ColumnType): boolean {
  if (value === null) return true;
  if (type === 'text') return typeof value === 'string';
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Reads and fully validates backup text: structure, version, row shapes,
 * duplicate ids, references between rows, and the checksum. Nothing is
 * applied until this returns ok.
 */
export async function parseBackup(text: string): Promise<ParseResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: ['This is not a valid JSON file.'] };
  }
  if (!isRecord(raw) || raw['format'] !== BACKUP_FORMAT) {
    return { ok: false, errors: ['This file is not a Tend backup.'] };
  }

  const file: Record<string, unknown> = raw;
  const version = file['schemaVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, errors: ['The backup has no valid version number.'] };
  }
  if (version > BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [
        `This backup was made by a newer version of the app (format ${version}); this version understands up to ${BACKUP_SCHEMA_VERSION}. Update the app and try again.`,
      ],
    };
  }
  const rawTables = file['tables'];
  if (!isRecord(rawTables)) return { ok: false, errors: ['The backup has no data section.'] };

  const errors: string[] = [];
  const tables: Record<string, BackupRow[]> = {};
  const fileTables = tableNamesFor(version);
  for (const table of TABLE_NAMES) {
    // A table that did not exist when this backup was made is simply empty.
    if (!fileTables.includes(table)) {
      tables[table] = [];
      continue;
    }
    const rows = rawTables[table];
    if (!Array.isArray(rows)) {
      errors.push(`Missing data for "${table}".`);
      continue;
    }
    const columns = defOf(table).columns;
    const seen = new Set<string>();
    const accepted: BackupRow[] = [];
    rows.forEach((row: unknown, i) => {
      const where = `${table}[${i}]`;
      if (!isRecord(row)) return void errors.push(`${where} is not a record.`);
      const id = row['id'];
      if (typeof id !== 'string' || id === '') return void errors.push(`${where} has no id.`);
      if (seen.has(id)) return void errors.push(`${where}: duplicate id ${id}.`);
      seen.add(id);
      const unknown = Object.keys(row).filter((k) => k !== 'id' && !(k in columns));
      if (unknown.length > 0) errors.push(`${where}: unknown fields ${unknown.join(', ')}.`);
      for (const [column, type] of Object.entries(columns)) {
        if (!validCell(row[column], type)) {
          errors.push(`${where}: "${column}" is not a valid ${type} value.`);
        }
      }
      accepted.push(row as BackupRow);
    });
    tables[table] = accepted;
  }
  if (errors.length > 0) return { ok: false, errors: limit(errors) };

  const typed = tables as unknown as BackupTables;
  const broken = findBrokenReferences(typed, undefined);
  if (broken.length > 0) return { ok: false, errors: limit(broken) };

  if ((await sha256Hex(canonical(typed, fileTables))) !== file['checksum']) {
    return {
      ok: false,
      errors: ['The backup is damaged or was edited: its checksum does not match its contents.'],
    };
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: String(file['exportedAt'] ?? ''),
      counts: Object.fromEntries(TABLE_NAMES.map((t) => [t, typed[t].length])) as Record<
        TableName,
        number
      >,
      // Upgraded backups are re-signed, so they verify as current-format files afterwards.
      checksum:
        version === BACKUP_SCHEMA_VERSION
          ? String(file['checksum'])
          : await sha256Hex(canonical(typed)),
      tables: typed,
    },
  };
}

const limit = (errors: string[]): string[] =>
  errors.length <= 10 ? errors : [...errors.slice(0, 10), `…and ${errors.length - 10} more.`];

/**
 * Rows that point at something that does not exist. `existing` lists ids
 * already on the device, which a merge may legitimately refer to.
 */
function findBrokenReferences(
  tables: BackupTables,
  existing: Partial<Record<TableName, ReadonlySet<string>>> | undefined,
): string[] {
  const ids = (t: TableName): Set<string> =>
    new Set([...tables[t].map((r) => String(r['id'])), ...(existing?.[t] ?? [])]);
  const known = Object.fromEntries(TABLE_NAMES.map((t) => [t, ids(t)])) as Record<
    TableName,
    Set<string>
  >;
  const problems: string[] = [];
  for (const [table, columns] of Object.entries(REFERENCES)) {
    for (const row of tables[table as TableName]) {
      for (const [column, target] of Object.entries(columns)) {
        const value = row[column];
        if (typeof value === 'string' && !known[target].has(value)) {
          problems.push(
            `${table} ${String(row['id'])}: "${column}" points at a missing ${target} record.`,
          );
        }
      }
    }
  }
  return problems;
}

export interface TablePreview {
  readonly table: TableName;
  /** Rows that would be written to the device. */
  readonly add: number;
  /** Rows already on the device with the same id (kept as they are in a merge). */
  readonly alreadyPresent: number;
  /** Rows on the device that a replace would remove. */
  readonly remove: number;
}

export interface RestorePreview {
  readonly mode: RestoreMode;
  readonly tables: readonly TablePreview[];
  readonly problems: readonly string[];
}

async function existingIds(db: SqlExecutor): Promise<Record<TableName, Set<string>>> {
  const out = {} as Record<TableName, Set<string>>;
  for (const table of TABLE_NAMES) {
    const rows = await db.getAll<{ id: string }>(`SELECT id FROM ${table}`);
    out[table] = new Set(rows.map((r) => r.id));
  }
  return out;
}

/** What a restore would do, without changing anything. */
export async function previewRestore(
  db: SqlExecutor,
  backup: BackupFile,
  mode: RestoreMode,
): Promise<RestorePreview> {
  const onDevice = await existingIds(db);
  const tables = TABLE_NAMES.map((table): TablePreview => {
    const here = onDevice[table];
    const present = backup.tables[table].filter((r) => here.has(String(r['id']))).length;
    return mode === 'replace'
      ? { table, add: backup.tables[table].length, alreadyPresent: 0, remove: here.size }
      : { table, add: backup.tables[table].length - present, alreadyPresent: present, remove: 0 };
  });
  // A merge may point at rows already on the device; a replace may not.
  const problems = findBrokenReferences(backup.tables, mode === 'merge' ? onDevice : undefined);
  return { mode, tables, problems };
}

export type RestoreOutcome =
  | { readonly ok: true; readonly preview: RestorePreview }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Applies a validated backup in one transaction: either all of it lands or
 * none of it does. Merge adds rows the device lacks and leaves existing rows
 * untouched; replace makes the device match the backup exactly.
 */
export async function restoreBackup(
  db: SqlDatabase,
  backup: BackupFile,
  mode: RestoreMode,
): Promise<RestoreOutcome> {
  const preview = await previewRestore(db, backup, mode);
  if (preview.problems.length > 0) return { ok: false, errors: limit([...preview.problems]) };

  await db.writeTransaction(async (tx) => {
    if (mode === 'replace') {
      for (const table of [...TABLE_NAMES].reverse()) await tx.execute(`DELETE FROM ${table}`);
    }
    for (const table of TABLE_NAMES) {
      const columns = ['id', ...Object.keys(defOf(table).columns)];
      const sql = `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${columns
        .map(() => '?')
        .join(', ')})`;
      for (const row of backup.tables[table]) {
        await tx.execute(
          sql,
          columns.map((c) => row[c] ?? null),
        );
      }
    }
  });
  return { ok: true, preview };
}
