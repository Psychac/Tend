# Tend — Gap List

Comparison of the implementation against [Tend.md](Tend.md), as of the commit following `80404af`.
Phase 1 (offline-first, §3.5) is the target; Phase 2 items are listed last so nothing is lost.

**Priority:** P1 = needed to meet Phase 1 acceptance (§21) or protects user data · P2 = spec'd Phase 1 feature
that is missing or partial · P3 = polish, hygiene, or spec/repo drift · P4 = Phase 2 / deferred.
**Size:** S ≈ under a day · M ≈ 1–3 days · L ≈ a week or more.

## Corrections to the earlier summary

- "Superseded" is **used**: `setActivitySchedule` supports a `supersede_future` policy ([editing.ts](../packages/application/src/editing.ts)). Only `cancelled` is unused (G-17).
- The Dashboard **does** have a "Coming up" section; what's missing is maintenance/warranty _alerts_ (G-13).
- The activity form already covers checklist, measurement requirements, priority, location, asset and reminders.

## Status at a glance

| Area                | Done                                                                                                        | Partial                    | Missing                                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------- | --------------------------------------------- |
| Domain & scheduling | calendar, completion-interval, fixed-interval, usage, grace, snooze, skip, reschedule, pause/resume, TZ/DST | consolidation, statuses    | condition, event                              |
| Persistence         | local-only PowerSync, schema, repos, UoW                                                                    | storage-failure handling   | persist(), quota, multi-tab, local migrations |
| UX                  | 7 nav sections, dark mode, responsive, reminders                                                            | Dashboard, Asset lifecycle | sync/saved indicator, attachments             |
| Modules (§2)        | digital upkeep, routines, household (presets + views), replacement planning, asset alerts                   | —                          | —                                             |
| Backup              | export, restore, preview, merge/replace, checksum                                                           | —                          | attachments in export                         |
| Delivery            | PWA, tests                                                                                                  | Vercel readiness           | CI, README, ADRs                              |

---

## P1 — Phase 1 acceptance and data safety

### G-01 Persistent storage request and quota handling — S ✅ done

- **Spec:** §9.3 (persistent-storage requests, quota exhaustion, eviction), §14.
- **State:** No `navigator.storage.persist()` call anywhere. Only a startup failure notice exists ([AppProvider.tsx](../apps/web/src/app/providers/AppProvider.tsx)). A write that fails mid-session (quota, eviction) is not distinguished or explained.
- **Work:** Request persistence after first meaningful write; show result in Settings ("Storage: protected / best-effort") with the §9.3 caveat that it is never guaranteed; catch quota/write errors in the unit of work and surface a clear message that the change was _not_ saved; show `navigator.storage.estimate()` usage in Settings; nudge a backup when storage is not persistent.
- **Done when:** a simulated `QuotaExceededError` shows an error and leaves data consistent; Settings reports persistence status.

### G-02 "Saved on this device" / sync-state indicator — S ✅ done

- **Spec:** §7.1, §7.7, §13 (Dashboard sync status), criterion 13, Epic 2 "sync status indicators".
- **State:** No indicator at all. The sync-state vocabulary (Offline / Syncing / Synced / Attention / Unavailable) is not modelled.
- **Work:** Introduce a `SyncStatus` contract in `contracts` with a Phase 1 implementation that always reports "Saved on this device · sync not enabled". Render in the app shell and Dashboard. Phase 2 swaps in the PowerSync-backed implementation.
- **Done when:** indicator visible on every screen; component driven only by the contract.

### G-03 Multi-tab behaviour — M ✅ done

- **Spec:** §9.3 (multiple tabs, concurrent reads/writes), §20 browser tests.
- **State:** Untested and unhandled. [powersync.ts](../packages/infrastructure/src/powersync.ts) says "only open one instance per file"; two tabs open the same DB.
- **Work:** Verify PowerSync Web multi-tab/shared-worker behaviour for the pinned SDK version; make the reminder engine run in one tab only (avoid duplicate notifications); make reactive queries refresh across tabs; add an E2E with two pages.
- **Done when:** a completion in tab A appears in tab B without reload and a reminder notifies once.

### G-04 Local schema migration strategy — M ✅ done

- **Spec:** §8.4, §9.3 (app upgrades and local schema migrations), §24 ("existing user data remains safe across upgrades"), E2E "upgrade the PWA while local data exists".
- **State:** The schema is declarative ([schema.ts](../packages/infrastructure/src/schema.ts)); there is no versioned local migration path or upgrade test. Backups have a schema version and migrations, the live DB does not.
- **Work:** Track a local schema version; define how added/renamed columns and data backfills run on startup; test upgrading a DB seeded from an older fixture. Also decide whether PowerSync's view-based schema needs raw-table migrations once the first breaking change lands.
- **Done when:** an automated test opens a v(N-1) database and ends on v(N) with data intact.

### G-05 Vercel deployment readiness — S ✅ config and docs done; a real preview deploy is still to be checked (see deployment/vercel/README.md)

- **Spec:** §17.3, criterion 14, Epic 12.
- **State:** No `vercel.json`, no deployment docs, no environment notes. SPA fallback and the headers PowerSync WASM may need (COOP/COEP depending on SDK mode) are unconfirmed.
- **Work:** Add `deployment/vercel/` config (SPA rewrite, cache headers for hashed assets, no-cache for `sw.js`); verify production build runs offline after install; document the deploy steps.
- **Done when:** a Vercel preview installs, works offline, and survives a version update.

### G-06 Continuous integration — S

- **Spec:** §24 Definition of Done (implied), §20.
- **State:** No `.github/` or other CI. Lint, typecheck, unit, and Playwright suites only run by hand.
- **Work:** CI running `lint`, `typecheck`, `test`, `format:check`, then Playwright.

---

## P2 — Spec'd Phase 1 features that are missing or partial

### G-07 Attachments — L — done (assets, completions, activities, camera, usage in Settings, optional backup zip with per-file hash checks). Asset-delete block deferred: no asset delete exists yet

- **Spec:** §10, §13 (activity creation and completion), §15 (export), Epic 3, Epic 11.
- **State:** Only an `Attachment` entity type in [supporting.ts](../packages/domain/src/entities/supporting.ts). No table in `schema.ts`, no repository, no `AttachmentStorage` abstraction, no UI, not in backup. The spec's `attachments` table is absent.
- **Work:** `attachments` table and repo; a provider-neutral `AttachmentStorage` with a Phase 1 local implementation (OPFS/IndexedDB blobs); attach to assets, activities and completions; states (stored / missing / failed); size limits and quota interaction with G-01; export as optional archive, restore with integrity check.
- **Open question:** where blobs live in Phase 1 (separate from the SQLite DB to keep it small).

### G-08 Condition-based scheduling — M — done (numeric readings; on `recordMeasurement` and on readings taken with a completion)

- **Spec:** §6.4 #5.
- **Semantics:** A new numeric reading fires when it meets the condition and the previous reading for the same key and subject (asset, or activity if none) did not. Staying past the limit never refires; it must come back first (re-arm). Only the newest reading counts, so a backdated one cannot fire. One open occurrence per schedule; due today. Completing with a reading that is still past the limit does not refire.
- **Not done:** Qualitative readings; unit conversion (the unit is not compared).

### G-09 Event-based scheduling — M — done (completion of another activity; named user events deferred)

- **Spec:** §6.4 #6.
- **Decision:** An "event" is the completion of another activity. Strategy is `{ kind: 'event', afterActivityId, delayDays }`. Completing the trigger creates one occurrence of the dependent activity, due `delayDays` later. At most one open occurrence per schedule (re-completing the trigger does not pile up). Triggers fire only from a person's completion, never chained, so A→B→A cannot loop. Undoing the trigger completion supersedes the open follow-up.
- **Not done:** Manually fired named events; a correction that moves the trigger's date does not re-date an existing follow-up.

### G-10 Fixed-interval strategy missing from the activity form — S — done (form option anchors on the start date; existing fixed schedules editable)

- **Spec:** §6.4 #3, Epic 4.
- **State:** Domain and generation support it; the form's `Repeat` is `none | calendar | after_completion | usage` and marks other strategies non-editable.
- **Work:** Add "every N units from a start date, regardless of completion" and make existing fixed schedules editable.

### G-11 Missed-occurrence consolidation not wired — M — done (`missed` status; History and Dashboard show it)

- **Spec:** §6.5, §12.1 (missed outcomes recorded faithfully).
- **State:** `consolidateMissed` exists in [policy.ts](../packages/domain/src/scheduling/policy.ts) and is tested, but the application layer never calls it. After a long absence, overdue items may pile up.
- **Work:** Call it in `reconcileSchedules`; define the resulting status/outcome ("missed" is named in §12.1 but is not an occurrence status); show consolidated items clearly in Dashboard and History.
- **Decision:** `missed` is a stored occurrence status. `reconcileSchedules` already consolidated, but as `superseded`; it now marks older overdue occurrences `missed` (terminal, no XP or streak effect). History has a Missed entry and filter; the Dashboard shows "+N earlier missed" since the last completion. Older rows already stored as `superseded` are not relabelled.

### G-12 Digital upkeep module — M — done (presets plus a Digital view; no cost fields by design)

- **Spec:** §2.4, Epic 7 (subscriptions, domain/hosting renewals, security reviews, backup reminders).
- **State:** Only reachable as generic `renewal`/`administrative` activities. No notion of a service or subscription: renewal date, amount, billing period, provider, or a list view.
- **Work:** Either dedicated lightweight entity/fields (provider, renewal date, cost, cycle) with a "Digital" view, or documented templates over activities and assets. Recommend templates plus a filtered view first. Must not store passwords or recovery codes.
- **Decision:** Templates plus a filtered view, nothing more. Tend is reminder-focused, so there are deliberately no cost, provider or billing-cycle fields; free-text description covers "which provider". Presets in [presets.ts](../packages/application/src/presets.ts) (subscription, domain/hosting, backup, security review, account review) prefill the activity form via `/activities/new?preset=<key>`. Saving files the activity under a "Digital" category, created on first use. `/digital` lists that category by next due date, linked from the Activities page. The form and page warn against storing passwords, secrets or recovery codes. The presets mechanism is reusable for G-15 (Routines).

### G-13 Dashboard: maintenance and warranty alerts — S — done (derived "Needs attention" list on the Dashboard)

- **Spec:** §13 Dashboard ("Maintenance alerts"), §2.2 (warranty reminders).
- **State:** Overdue / Due today / Coming up / Recently done exist. Warranty expiry is stored and displayed on the asset but never raised as an alert or reminder.
- **Work:** Derived alerts: warranty expiring within N days, usage meters near their threshold, assets with no recent service. Computed on demand like reminders (ADR-019).
- **Decision:** `getAssetAlerts` derives four kinds on demand and stores nothing: warranty ending within 60 days; replacement due within 90 days, past due, or poor condition (G-16); a usage meter at 90% or more of its interval but not yet due (due ones already have an occurrence); and an asset older than 12 months whose activities have no completion in 12 months (or ever). They show in a "Needs attention" list on the Dashboard, hidden when empty, each linking to Assets. Thresholds are options with these defaults, not user settings. They are not delivered as notifications; extending the reminder channel to them is a possible follow-up.

### G-14 Household module — M — done (Household view by room; room and seasonal presets)

- **Spec:** §2.1, Epic 5 (rooms, cleaning checklists, household dashboard views, seasonal activities).
- **State:** Locations and categories exist and filter activities. No household-specific dashboard view, checklist templates, or seasonal scheduling (e.g. "every spring", date-window schedules).
- **Work:** Room-grouped view, reusable checklist templates, seasonal recurrence (calendar yearly with month/day, optionally a window).
- **Decision:** No new entity or schedule type. `/household` (main nav) groups activities by place: those filed under a Household category, anything with a place, and cleaning tasks (Digital items excluded). Checklist templates are the G-12 presets (kitchen deep clean, bathroom clean, bedroom linens). A seasonal chore is a yearly calendar schedule: a preset may carry a start month and day, so the form starts it on the next such date, and its grace days act as the window (spring clean 20 March, autumn gutter check 1 October, cooling service 1 March). Seasons are fixed dates, not hemisphere-aware; the date is editable in the form.

### G-15 Routines and administrative life tasks — S — done (Routines view and presets; no new entity)

- **Spec:** §2.5, Epic 7.
- **State:** Works via activity types; no routine-specific view, no user-defined activity types (spec: "user-defined activity types"), only the fixed list plus `custom`.
- **Work:** Decide whether user-defined types are real entities or just `custom` + category; add a Routines view.
- **Decision:** No new entity. A user-defined type is the `custom` type plus a category of the user's own, which already filters and groups activities. `/routines` (in the main nav) lists activities of type Routine, Administrative or Custom, excluding those filed under Digital, by next due date. It offers five presets (weekly review, declutter, health check-up, ID and documents expiry, insurance review) that reuse the G-12 presets mechanism, plus a blank activity.

### G-16 Ownership management: replacement planning and lifecycle — M — done (expected life, condition, planning list)

- **Spec:** §2.3.
- **State:** Status, purchase, vendor and warranty exist, plus retire/reactivate. No expected lifespan, replacement-due date, condition rating, or replacement planning view; "links to maintenance activities" is done.
- **Work:** Add expected end-of-life and condition; surface "replace soon" in alerts (G-13); lifecycle states beyond active/retired/disposed if needed.
- **Decision:** Assets gain `expectedLifeYears` (whole years from the purchase date) and `condition` (good, fair, poor). Both are optional new columns, so no local migration is needed (ADR 0001). The replacement date is derived (`replacementDueOn`), never stored. `listReplacementPlan` returns active assets that are past it, reach it within a year, or are in poor condition, and the Assets page shows them in a "Replacement planning" section. Existing lifecycle states are kept. Still open for G-13: raising these as dashboard alerts or reminders.

### G-17 Occurrence statuses: `cancelled` unused; 'missed' undefined — S — done

- **Spec:** §6.3, §12.1.
- **State:** `cancelled` exists in the type but no use case or UI sets it. §12.1 lists `missed` as an outcome but §6.3 has no such status.
- **Resolved:** `missed` is a stored status (G-11) and is now listed in spec §6.3. `cancelOccurrence` plus a confirmed Cancel button on the occurrence card. Cancel is not an outcome: Insights does not count it, the date is not regenerated, History shows it as Cancelled (with a filter). A repeating schedule carries on as after a skip.

### G-18 Measurements: history and trends — M — done (Readings on each asset; rating entry)

- **Spec:** §2.2, Epic 9 ("measurement history"), §13.
- **State:** Measurements are recorded and shown inline in History entries; Insights has meter data. No per-asset/per-key measurement history view or chart, no condition-style (qualitative) entry UI.
- **Work:** Measurement history screen on the asset, with a simple trend chart; qualitative measurement entry.
- **Decision:** Each asset card has a "Readings" button showing everything recorded for it (`getAssetMeasurementHistory`), grouped by what was measured. A numeric series gets a plain SVG line chart, spaced by date, with latest, low and high; dots recorded with a service are filled. It has a screen-reader summary and an accessible list of entries below. A rating series is a dated list. "Record a reading" now has a Number or Rating kind; ratings suggest Good, Fair and Poor but accept any text. No charting library, and no per-activity view yet: only readings attached to an asset are shown.

### G-19 Local data protection claims — S — done (statement, wording and ADR 0002; no encryption in Phase 1)

- **Spec:** §14 (do not claim encryption at rest unless verified; local DB encryption to be evaluated).
- **State:** No evaluation recorded; no user-facing statement about what is and is not protected.
- **Work:** Write the threat-model note, decide on app-lock/encryption (likely out of scope for Phase 1), and ensure no UI text overclaims.
- **Decision:** [ADR 0002](decisions/0002-local-data-protection.md) records the threat model: the data is not encrypted, Tend has no lock, and backups are plain files. Phase 1 does not encrypt or lock. Settings has a "Privacy on this device" section saying so, the backup section warns that backups are unencrypted, and the storage section's "protected" wording became "kept" (it only means the browser will not evict data). A test fails if the Settings page claims encryption or protection. Encrypted storage, app lock and encrypted backups are deferred to Phase 2, when sync arrives.

### G-20 Accessibility audit — M

- **Spec:** §19 Accessibility, §24.
- **State:** Some good practice (labels, `role="alert"`, `sr-only`). No systematic audit, no automated a11y tests, calendar grid and charts unverified for keyboard and screen readers, focus indicators not verified.
- **Work:** axe checks in component or E2E tests; keyboard walkthrough of every screen; contrast check in both themes; reduced-motion handling.

### G-21 Browser compatibility testing — M

- **Spec:** §9.3, §20 browser tests.
- **State:** Playwright config; confirm which browsers actually run. Safari/WebKit and Firefox persistence of SQLite WASM unverified; Android Chrome PWA install untested.
- **Work:** Run the E2E suite on Chromium, Firefox and WebKit; manual pass on Android Chrome and iOS Safari; record known limitations.

### G-22 Performance with large histories — M

- **Spec:** §19 Performance.
- **State:** History is paged and key indexes exist, but there is no large-data test. Dashboard/Insights queries unmeasured.
- **Work:** Seed fixtures (e.g. 5k activities-equivalent: 50k completions) and measure Dashboard, History, Insights, Calendar; add missing indexes; bound Insights queries.

### G-23 Error reporting and diagnostics — S — done (Settings diagnostics, error boundary and route error panel; no remote reporting)

- **Spec:** §5.1 (logging and diagnostics), Epic 12 (monitoring and error reporting).
- **State:** `console.error` only. No in-app diagnostics (app version, DB size, schema version, last error) for supportability.
- **Work:** Settings "Diagnostics" panel with copy-to-clipboard; a top-level error boundary with a path to export a backup.
- **Decision:** Errors are recorded on this device only (the last ten, in memory and in browser local storage, so they survive a reload) from uncaught errors, unhandled promise rejections, failed screens, and the reminder, schedule and storage-open failures. Nothing is sent anywhere; remote error reporting is out of scope for Phase 1 and would need its own privacy decision. Settings has a "Diagnostics" section: app version and build date, data format against the newest this app understands, record and attached-file counts, storage, browser and recent errors, with Copy diagnostics (falling back to a text box if the browser blocks copying) and Clear recorded errors. The report holds counts and versions, never record contents, but does include error messages. A failing screen now shows a recovery panel inside the layout (router error element), and a top-level boundary catches failures in the layout itself. The panel offers Download a backup, Copy diagnostics, Try again, Reload and a link to the dashboard, and works even if the database never opened (then without the backup button). The app version comes from `apps/web/package.json`, which is still 0.0.0, so the build date is the useful part until releases are versioned.

---

## P3 — Drift, hygiene and documentation

### G-24 Repository structure drift from §16 — M (decide first)

The code does not match §16. Either restructure or amend the spec.

| Spec §16                                                           | Actual                                                                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `features/household`, `digital-upkeep`, `routines`                 | absent (see G-12, G-14, G-15)                                                                                                                     |
| `infrastructure/{powersync,auth,attachments,notifications}` in app | PowerSync lives in `packages/infrastructure`; notifications in `shared/notifier.ts` and `app/providers/reminderEngine.ts`; no auth or attachments |
| `packages/design-system`                                           | absent; styles in `index.css`                                                                                                                     |
| `backend/`, `powersync/`, `deployment/`                            | absent (Phase 2 / G-05)                                                                                                                           |
| `tests/{integration,e2e,fixtures}`                                 | tests are colocated; E2E in `apps/web/e2e/`                                                                                                       |
| `docs/{product,architecture,domain,decisions,deployment,testing}`  | only `Tend.md`, `GAPS.md`, and an empty `decisions/`                                                                                              |

**Recommendation:** keep colocated tests and the single `packages/infrastructure`; amend the spec. Create `deployment/` when G-05 lands.

### G-25 Notifications live in the wrong layer — S

Spec §5.1 puts notification adapters in infrastructure. `notifier.ts` and `reminderEngine.ts` are in the web app. Move behind a contract so a Web Push adapter (G-33) can slot in.

### G-26 shadcn/ui not used — S (decide)

§3.1 says "shadcn/ui, selectively". The UI uses hand-rolled Tailwind (`btn`, `badge`, …). Either adopt it for complex controls (dialog, select, date picker) or amend the spec.

### G-27 Zustand dependency unused — S

Listed in §3.1 and installed, but nothing imports it. Remove, or use it for the transient UI state it was chosen for.

### G-28 Audit events are write-only — S

`audit_events` is written by several use cases but there is no way to see it, and not every mutation writes one (coverage unaudited). Decide: expose an activity/change log, or reduce scope. Check that completions, voids and edits are covered.

### G-29 Spec document is stale — S

- §11.1 has escaped backticks (`\`lead_days\``) that render literally.
- ADR table is out of numeric order (015, 019, 018 misplaced).
- Missing: categories/places feature, multi-currency, Calendar behaviour, theming, the actual module layout.
- Version/date header not bumped; no changelog.
- Add a "Spec vs implementation" status column or link to this file.

### G-30 No README or contributor docs — S

No root `README.md`: how to install, run, test, build, and the architecture in a page. `docs/decisions/` is empty although the ADRs live in the spec; split them out as the spec suggests.

### G-31 Checked-in test output — S

`apps/web/.vitest/json/output.json` is tracked in git. Remove and ignore it.

### G-32 `apps/web/dist` and assets — S

Confirm `dist` is ignored. Icons are generated by `scripts/make-icons.mjs`; the icons still depict the old wrench mark and should be refreshed for **Tend** (also `theme_color` mismatch: `#059669` in the manifest vs `#0f8a6d` in `index.html`).

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

---

## Suggested order of work

1. **Data safety:** G-01, G-04, G-03.
2. **Visible acceptance gaps:** G-02, G-10, G-11, G-13, G-17.
3. **Hygiene while context is fresh:** G-31, G-32, G-27, G-06, G-30.
4. **Module completeness:** G-12, G-14, G-15, G-16, G-18.
5. **Larger features:** G-08, G-09, G-07 (G-07 last: it interacts with G-01 and backup).
6. **Quality passes:** G-20, G-21, G-22, G-23, G-19.
7. **Decisions and docs:** G-24, G-25, G-26, G-28, G-29, G-05.

## Decisions needed from you

1. G-24 / G-26: amend the spec to match the code, or move the code toward the spec?
2. G-09: what counts as an "event"?
3. G-11 / G-17: is "missed" a stored status or a derived label?
4. G-12 / G-15: dedicated entities, or templates over activities?
5. G-07: should Phase 1 attachments store blobs locally (and in exports), given storage limits?
