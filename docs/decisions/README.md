# Architecture decisions

Two series live here.

**ADR-001 to ADR-019** are the decisions recorded in the specification, in
[Tend.md](../Tend.md) (§23, Architecture decision records). They are one line each and
are listed below in numeric order. The spec table is the source until each is expanded into
its own file.

**0001 onward** are longer records written during implementation, one file each. Add new ones
here with the next number, using the same shape as the existing files: Status, Context,
Decision, and what is still open.

## Implementation records

| File                                    | Decision                                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------------------------- |
| [0001](0001-local-schema-migrations.md) | How local database changes are versioned and applied on a device                            |
| [0002](0002-local-data-protection.md)   | Local data and backups are not encrypted and Tend has no lock in Phase 1; why and what next |

## Specification decisions

| ADR     | Decision                                                                                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ADR-001 | React + TypeScript                                                                                                                                                       |
| ADR-002 | Vite-based PWA                                                                                                                                                           |
| ADR-003 | Modular monolith                                                                                                                                                         |
| ADR-004 | PowerSync Web SDK for local-first persistence and sync                                                                                                                   |
| ADR-005 | SQLite WASM as the client database                                                                                                                                       |
| ADR-006 | PostgreSQL as the central synchronized database                                                                                                                          |
| ADR-007 | Supabase as the initial PostgreSQL and authentication provider                                                                                                           |
| ADR-008 | PowerSync Cloud as the initial sync service                                                                                                                              |
| ADR-009 | Provider-neutral upload and repository interfaces                                                                                                                        |
| ADR-010 | Version-aware and append-only conflict policies                                                                                                                          |
| ADR-011 | Backup independent of synchronization                                                                                                                                    |
| ADR-012 | Vercel for initial static hosting                                                                                                                                        |
| ADR-013 | Oracle ARM as an optional self-hosting target                                                                                                                            |
| ADR-014 | Gamification isolated from scheduling                                                                                                                                    |
| ADR-015 | No separate Dexie application database                                                                                                                                   |
| ADR-016 | Gamification (XP, levels, streaks, achievements) deferred past the first release; build the basic app first                                                              |
| ADR-017 | Build fully offline first: PowerSync Web SDK in local-only mode; Supabase, authentication, and sync are Phase 2                                                          |
| ADR-018 | Completions stay append-only; mistakes are fixed by voiding (undo) or by a corrected replacement (edit), recorded in `completion_voids`                                  |
| ADR-019 | Reminders are computed on demand and delivered at most once per due date; browser notifications are an opt-in per-device channel; no background delivery before Web Push |
