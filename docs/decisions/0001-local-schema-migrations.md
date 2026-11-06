# 0001 — Local schema migrations

Status: accepted · Spec: §8.4, §9.3, §24

## Context

The on-device database is PowerSync's SQLite. PowerSync stores each row as JSON and exposes the
tables in `schema.ts` as views over it. Opening the database re-applies the client schema, so:

- **Adding a column** needs no migration. Existing rows simply read `NULL` for it.
- **Removing or renaming a column** loses nothing on disk (the old key stays in the JSON), but the
  old name can no longer be read through the view.
- **Backfilling data** (computing a value for existing rows) always needs code.

## Decision

1. The device records a **local schema version** in the local-only `local_meta` table (never
   synced, never in a backup). A device with no record is version 1, the baseline; so is a new one.
2. Changes that need code are **migrations** in `packages/infrastructure/src/migrations.ts`,
   numbered 2, 3, 4… with no gaps. Each runs in one transaction together with the version bump, so
   it applies fully or not at all. Shipped migrations are never edited or reordered.
3. Migrations run at startup, after the database opens and before anything reads it, under a
   cross-tab lock so two tabs cannot both run one.
4. **Renames are done in steps across releases:** add the new column and backfill it from the old
   one in a migration; keep the old column in `schema.ts` until a later release drops it.
   Never remove a column in the same release that reads from it.
5. Data written by a **newer** app than the one running is never touched: startup stops with a
   message to update the app.
6. Backup files carry their own format version (`backup.ts`) and are independent of this one.

## Open

PowerSync's view-based schema is fine while changes are additive. If a change ever needs a real
SQL column type or constraint change, move that table to a PowerSync raw table and write a
migration to copy the data. Decide then; there is no such change yet.
