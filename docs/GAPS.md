# Tend — Gap List

Comparison of the implementation against [Tend.md](Tend.md), checked against the code at commit `b5cffc3` (6 November 2026).
Phase 1 (offline-first, §3.5) is the target; Phase 2 items are listed last so nothing is lost.

**Priority:** P1 = needed to meet Phase 1 acceptance (§21) or protects user data · P2 = spec'd Phase 1 feature
that is missing or partial · P3 = polish, hygiene, or spec/repo drift · P4 = Phase 2 / deferred.
**Size:** S ≈ under a day · M ≈ 1–3 days · L ≈ a week or more.

## Where things stand

22 of the 32 Phase 1 items are done (G-05 with a follow-up), one is deferred indefinitely (G-06), and nine remain:

| Open | Item                                | Size |
| ---- | ----------------------------------- | ---- |
| G-20 | Accessibility audit                 | M    |
| G-21 | Browser compatibility testing       | M    |
| G-22 | Performance with large histories    | M    |
| G-24 | Repository structure drift from §16 | M    |
| G-25 | Notifications in the wrong layer    | S    |
| G-26 | shadcn/ui not used                  | S    |
| G-27 | Zustand dependency unused           | S    |
| G-28 | Audit events are write-only         | S    |
| G-29 | Spec document is stale              | S    |

The one follow-up to a done item is G-05: a real Vercel preview deploy has not been checked. Phase 2 (P4) is untouched by design.

---

## Done

What shipped, and what was deliberately left out. Decisions with a longer rationale are in
[decisions/](decisions/README.md).

### P1 — acceptance and data safety

| ID   | What shipped                                                                                                                                                                                                                                       | Known limits                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| G-01 | Persistence is requested after the first write. A full or evicted store is caught, the write rolls back, and the person is told it was not saved. Settings shows persistence and usage, and nudges a backup when storage is not persistent (§9.3). | Persistence is never guaranteed; the wording says so. The Settings label is "kept", not "protected" (G-19).                       |
| G-02 | A `SyncStatus` contract with a Phase 1 implementation that reports "saved on this device, sync not enabled". It shows in the app shell and on the Dashboard.                                                                                       | Phase 2 swaps in a PowerSync-backed implementation.                                                                               |
| G-03 | Two tabs share one database safely: reminders and reconciliation run in one tab at a time, changes in one tab refresh the other, and an end-to-end test drives two pages.                                                                          |                                                                                                                                   |
| G-04 | The device records a local schema version, migrations run at startup under a cross-tab lock and apply fully or not at all, and data from a newer app is never touched. [ADR 0001](decisions/0001-local-schema-migrations.md).                      | No migration has shipped yet (the list is empty). Raw-table migration for PowerSync is deferred until a breaking change needs it. |
| G-05 | `vercel.json` (SPA rewrite, immutable hashed assets, no-cache for the service worker and update files) and [deployment/vercel/README.md](../deployment/vercel/README.md). A test checks the rules.                                                 | **A real preview deploy has not been checked**: install, work offline, survive an update.                                         |

### P2 — Phase 1 features

| ID   | What shipped                                                                                                                                                                                                                                                                                                                                                       | Known limits                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G-07 | Attachments on assets, completions and activities, stored outside the database, with camera capture, usage in Settings, and an optional backup zip with per-file hash checks.                                                                                                                                                                                      | No asset delete exists yet, so the "block delete while attached" rule is untested.                                                                                   |
| G-08 | Condition schedules: a numeric reading fires when it meets the condition and the previous one did not. Staying past the limit does not refire; it must come back first. One open occurrence per schedule.                                                                                                                                                          | Qualitative readings and unit conversion (the unit is not compared).                                                                                                 |
| G-09 | Event schedules: completing another activity creates one occurrence of the dependent activity, due `delayDays` later. At most one open occurrence; triggers never chain, so A→B→A cannot loop; undoing the trigger supersedes the follow-up.                                                                                                                       | Named events fired by hand. A correction that moves the trigger's date does not re-date an existing follow-up.                                                       |
| G-10 | The activity form offers "every N units from a start date, regardless of completion", and existing fixed schedules are editable.                                                                                                                                                                                                                                   |                                                                                                                                                                      |
| G-11 | `reconcileSchedules` marks older overdue occurrences `missed` (a stored, terminal status). History has a Missed entry and filter; the Dashboard shows "+N earlier missed" since the last completion.                                                                                                                                                               | Rows stored earlier as `superseded` are not relabelled.                                                                                                              |
| G-12 | Digital upkeep: five presets (subscription, domain/hosting, backup, security review, account review) prefill the activity form through `/activities/new?preset=<key>`, are filed under a "Digital" category created on first use, and list at `/digital`. The form and page warn against storing passwords or recovery codes.                                      | No cost, provider or billing-cycle fields, on purpose: the app is about reminders. The description holds the provider.                                               |
| G-13 | `getAssetAlerts` derives a "Needs attention" list on the Dashboard: warranty ending within 60 days; replacement due within 90 days, past due or poor condition; a usage meter at 90% or more of its interval; and an asset older than 12 months with no completed maintenance in 12 months. Computed on demand, nothing stored (ADR-019).                          | Thresholds are function defaults, not settings. Not delivered as notifications.                                                                                      |
| G-14 | `/household` groups activities by place: those filed under Household, anything with a place, and cleaning tasks. Six presets (kitchen, bathroom, bedroom linens, spring clean, autumn gutter check, cooling service). A seasonal chore is a yearly calendar schedule that starts on the next preset date, with grace days as its window.                           | Seasons are fixed dates, not hemisphere-aware (the date is editable). No new entity or schedule type.                                                                |
| G-15 | `/routines` lists Routine, Administrative and Custom activities (not Digital), with five presets. A user-defined type is the `custom` type plus a category of the person's own.                                                                                                                                                                                    | No separate user-defined type entity.                                                                                                                                |
| G-16 | Assets gain `expectedLifeYears` and `condition` (good, fair, poor), both optional columns. The replacement date is derived, never stored. The Assets page has a "Replacement planning" list.                                                                                                                                                                       | Lifecycle states are unchanged (active, in storage, retired, disposed).                                                                                              |
| G-17 | `missed` is a stored status and is listed in spec §6.3. `cancelOccurrence` with a confirmed Cancel button; a cancel is not an outcome (Insights ignores it) and the date is not regenerated. History shows Cancelled, with a filter.                                                                                                                               |                                                                                                                                                                      |
| G-18 | A "Readings" view on each asset, grouped by what was measured: a plain SVG trend chart for numbers (latest, low, high; service readings filled) and a dated list for ratings. "Record a reading" can enter a Number or a Rating.                                                                                                                                   | Asset readings only; no per-activity view. A key recorded in several units uses the newest unit and is not converted. The chart has not been looked at in a browser. |
| G-19 | [ADR 0002](decisions/0002-local-data-protection.md) records the threat model. Settings has a "Privacy on this device" section, the backup section warns that backups are unencrypted, and a test fails if the Settings page claims encryption or protection.                                                                                                       | No encryption and no app lock in Phase 1. Encrypted storage, app lock and encrypted backups are Phase 2 options.                                                     |
| G-23 | Errors are recorded on the device only (the last ten). Settings → Diagnostics shows version, build date, data format, counts, storage and recent errors, with copy and clear. A failing screen shows a recovery panel inside the layout, and a top-level boundary catches layout failures. The panel offers a backup download, copy diagnostics, retry and reload. | No remote error reporting (it would need its own privacy decision). `apps/web/package.json` is still `0.0.0`, so the build date is the useful part of the version.   |

### P3 — hygiene and documentation

| ID   | What shipped                                                                                                                                                                                                                                                      | Known limits                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| G-30 | Root [README.md](../README.md) (requirements, commands, e2e suite, package layout, things to know) and [decisions/README.md](decisions/README.md), which indexes the spec's ADR-001 to 019 in order and the numbered records.                                     | The one-line ADRs are not split into separate files; the spec's own table order is G-29. |
| G-31 | The tracked vitest JSON output is removed and `.vitest` is ignored.                                                                                                                                                                                               |                                                                                          |
| G-32 | `dist` is ignored. The manifest, `index.html` and the icon background share the `--brand` colour (`#0f8a6d`), the PNG icons are regenerated, and the sidebar mark matches the icon (a checkmark). A test fails if the colours drift or an icon is the wrong size. | The regenerated icons and the new sidebar mark have not been looked at in a browser.     |

---

## Open

### P1

#### G-05 follow-up: check a real preview deploy — S

Open the preview URL, add an activity and reload, go offline and reload, then deploy a new version and check the update banner. Steps are in [deployment/vercel/README.md](../deployment/vercel/README.md).

### P2

#### G-20 Accessibility audit — M

- **Spec:** §19 Accessibility, §24.
- **State:** Some good practice (labels, `role="alert"`, `sr-only`, an accessible summary on the readings chart). No axe or other automated a11y test, no `prefers-reduced-motion` handling, and the calendar grid, charts and focus indicators are unverified.
- **Work:** axe checks in component or E2E tests; keyboard walkthrough of every screen; contrast check in both themes; reduced-motion handling. [DESIGN.md](DESIGN.md) overlaps this.

#### G-21 Browser compatibility testing — M

- **Spec:** §9.3, §20 browser tests.
- **State:** The Playwright config defines no projects, so the suite runs on Chromium only (or the browser named by `PW_CHANNEL`). Firefox and WebKit persistence of SQLite WASM is unverified; Android Chrome PWA install is untested.
- **Work:** Run the E2E suite on Chromium, Firefox and WebKit; manual pass on Android Chrome and iOS Safari; record known limitations.

#### G-22 Performance with large histories — M

- **Spec:** §19 Performance.
- **State:** History is paged and key indexes exist, but there is no large-data test. Dashboard, Insights and the new asset alerts and readings history are unmeasured. The alerts and household pages read all activities and schedules, and the alerts query completions once per activity.
- **Work:** Seed fixtures (for example 50k completions) and measure Dashboard, History, Insights, Calendar and asset alerts; add missing indexes; bound Insights queries.

### P3

#### G-24 Repository structure drift from §16 — M (partly done)

**Rule:** the spec is the authority. Each §16 item was scrutinised; where it is sound the code is brought in line, and the spec is not edited to fit the code. (An earlier edit to §16 that did the opposite was reverted.)

**Done:**

- `features/household`, `features/digital-upkeep` and `features/routines` are separate folders (they had been pages inside `features/activities`).
- `shared/` is split into `ui/` (pickers, currency field, sync indicator), `hooks/` and `utilities/` (storage, cross-tab, diagnostics).
- `apps/web/src/infrastructure/notifications/` holds the notifier and the reminder engine (they had been in `shared/` and `app/providers/`). The contract that lets a Web Push adapter slot in is still G-25.
- Infrastructure placement, as ruled: platform-neutral adapters stay in `packages/infrastructure` (SQL repositories, schema, migrations, backup, in-memory attachment storage); browser-bound adapters live in `apps/web/src/infrastructure/`: `powersync/` (the PowerSync web database, moved out of the package along with the `@powersync/*` dependencies), `attachments/` (the browser's private file system storage) and `notifications/`. `auth/` arrives with Phase 2.
- Spec §16 now says the web app manifest is generated at build time (approved); there is no hand-written `manifest.webmanifest`.
- End-to-end tests moved from `apps/web/e2e/` to `tests/e2e/`, as a workspace package `@tend/e2e` with its own Playwright config. Run them with `pnpm test:e2e`. All 12 pass.
- The e2e suite had been failing since G-10 (the new "Every N units…" option made `getByLabel('Unit')` match two controls) and had not been run since. Fixed in the same change.

**Scrutinised, still open:**

| Spec §16                                                                                        | Finding                                                                                                                                                                                                                                                              | Next step                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/design-system`                                                                        | Sound: [DESIGN.md](DESIGN.md) calls for tokens first, then components. An empty package would be noise.                                                                                                                                                              | Create it as part of the DESIGN.md work: tokens, then the shared components, extracted from `index.css` and the hand-rolled `btn` and `badge` classes.                               |
| `tests/integration`, `tests/fixtures`                                                           | Unit tests beside the code do not conflict with the spec, which names only integration, e2e and fixtures. The tests in `packages/infrastructure/src` that run use cases against real SQLite are integration tests in all but location. There are no shared fixtures. | Decide whether to move those into `tests/integration` (they would import the packages by name rather than relatively), and whether any fixtures are worth sharing.                   |
| `docs/{product,architecture,domain,deployment,testing}`                                         | Sound, and the content mostly exists in the README, the spec and `deployment/vercel/README.md`.                                                                                                                                                                      | Write real pages (architecture and domain from the README and §5 to §6, testing from the test layout) and give deployment a `docs/deployment` page pointing at `deployment/vercel/`. |
| `backend/`, `powersync/`, `deployment/oracle`, `deployment/environments`, `infrastructure/auth` | Phase 2 by the spec's own §3.5, so their absence conforms.                                                                                                                                                                                                           | None until Phase 2.                                                                                                                                                                  |

#### G-25 Notifications live in the wrong layer — S

Spec §5.1 puts notification adapters in infrastructure. They now sit in `apps/web/src/infrastructure/notifications/` (G-24), which is the layer's place in §16, but nothing defines a contract for them yet: the reminder code and the UI call `notifier.ts` directly. Define a notifier contract so a Web Push adapter (G-33) can slot in.

#### G-26 shadcn/ui not used — S (decide)

§3.1 says "shadcn/ui, selectively". Nothing in the repo uses shadcn or Radix; the UI is hand-rolled Tailwind (`btn`, `badge`, …). Either adopt it for complex controls (dialog, select, date picker) or amend the spec.

#### G-27 Zustand dependency unused — S

Listed in §3.1 and declared in `apps/web/package.json`, but no source file imports it. Remove it, or use it for the transient UI state it was chosen for.

#### G-28 Audit events are write-only — S

`audit_events` is written by most use cases, but nothing reads it, so there is no way to see it. Coverage is incomplete: completing, skipping, cancelling, voiding and correcting, editing, archiving, pausing and resuming, assets, categories, places, reminders and attachments write events. **Snoozing, rescheduling, recording a measurement and the automatic reconcile do not.** Decide: expose an activity or change log, or reduce scope, and either audit those four or record why not.

#### G-29 Spec document is stale — S

- §11.1 has escaped backticks (`\`lead_days\``, `\`at_time\``, `\`enabled\``, `\`reminder_deliveries\``) that render literally.
- ADR table (§23) is out of numeric order (015, 019, 018 misplaced).
- Missing: categories and places, multi-currency, Calendar behaviour, theming, the household, digital and routines views and presets, asset alerts, replacement planning, readings history, diagnostics, and the actual module layout.
- Version and date header (0.6, 5 November 2026) not bumped; no changelog.
- Add a "Spec vs implementation" status column or a link to this file.

---

## Deferred indefinitely

#### G-06 Continuous integration — S

Deferred by decision; not planned. Lint, typecheck, unit and Playwright suites are run by hand before a change goes out (the README lists the commands). If this is picked up later:

- **Spec:** §24 Definition of Done (implied), §20.
- **Work:** CI running `lint`, `typecheck`, `test`, `format:check`, then Playwright.
- **Note:** `format:check` currently reports files that recent work did not change (`apps/web/index.html`, `docs/DESIGN.md`, `package.json`, `packages/application/tsconfig.json`). Fix or ignore them first, or the check fails on day one.

---

## P4 — Phase 2 and deferred (not to be built yet)

| ID   | Item                                                                                                                                        | Spec          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| G-33 | Web Push for background reminders                                                                                                           | §11, ADR-019  |
| G-34 | Supabase project, Auth adapter, account export and deletion                                                                                 | §3.2, §14     |
| G-35 | PowerSync Cloud, Sync Streams (`powersync/sync-config.yaml`)                                                                                | §7.4          |
| G-36 | Upload handler, `SyncUploadHandler` contract, idempotency via `(owner_id, client_mutation_id)`                                              | §7.5–7.6      |
| G-37 | `client_id` / `client_mutation_id` columns (not yet in schema; deliberately Phase 2 per [meta.ts](../packages/domain/src/entities/meta.ts)) | §7.6          |
| G-38 | PostgreSQL schema, RLS, roles and migrations in `backend/migrations`                                                                        | §8, §8.3      |
| G-39 | Conflict-resolution UI (version checks, "attention required")                                                                               | §7.6–7.7      |
| G-40 | Reassign local owner ID to the authenticated user on first sign-in                                                                          | §3.5          |
| G-41 | Remote attachment storage and upload queue                                                                                                  | §10           |
| G-42 | Dev/staging/prod environments, secrets handling                                                                                             | §17           |
| G-43 | Self-hosted PowerSync on Oracle ARM; migration path                                                                                         | §4.2–4.3, §18 |
| G-44 | Sync integration, RLS and infrastructure tests                                                                                              | §20           |
| G-45 | Gamification (XP, levels, streaks, achievements) — deferred by §12/ADR-016                                                                  | §12           |

Phase 2 also inherits deferrals from done items: encrypted storage, app lock and encrypted backups (G-19), remote error reporting (G-23), and notifications for asset alerts (G-13).

---

## Suggested order of what is left

1. **Cheap hygiene:** G-27 (remove or use Zustand), then G-05's preview check.
2. **Quality passes:** G-20, G-21, G-22.
3. **Spec alignment and docs:** G-24 (remaining rows), G-25, G-26, G-28, G-29.

## Decisions needed from you

1. G-26: adopt shadcn/ui for complex controls, or amend the spec to say the UI is hand-rolled Tailwind? (Per the rule above, the default is to adopt it so the code matches §3.1; say if you would rather drop it from the spec.)
2. G-28: expose a change log in the app, or keep the audit trail as an internal record only?
3. G-25: do the Web Push contract now, or wait until G-33 is scheduled?

Settled earlier: infrastructure adapters are split by platform and the manifest is generated at build time (G-24); CI is deferred indefinitely (G-06); an "event" is the completion of another activity (G-09); `missed` is a stored status (G-11, G-17); digital, routines and household use presets over activities rather than new entities (G-12, G-14, G-15); Phase 1 attachments store files locally outside the database and optionally in a backup zip (G-07).
