# Tend — Gap List

Comparison of the implementation against [Tend.md](Tend.md), as of the commit following `80404af`.
Phase 1 (offline-first, §3.5) is the target; Phase 2 items are listed last so nothing is lost.

**Priority:** P1 = needed to meet Phase 1 acceptance (§21) or protects user data · P2 = spec'd Phase 1 feature
that is missing or partial · P3 = polish, hygiene, or spec/repo drift · P4 = Phase 2 / deferred.
**Size:** S ≈ under a day · M ≈ 1–3 days · L ≈ a week or more.

## Corrections to the earlier summary

- "Superseded" is **used**: `setActivitySchedule` supports a `supersede_future` policy ([editing.ts](../packages/application/src/editing.ts)). Only `cancelled` is unused (G-17).
- The Dashboard **does** have a "Coming up" section; what's missing is maintenance/warranty *alerts* (G-13).
- The activity form already covers checklist, measurement requirements, priority, location, asset and reminders.

## Status at a glance

| Area | Done | Partial | Missing |
|---|---|---|---|
| Domain & scheduling | calendar, completion-interval, fixed-interval, usage, grace, snooze, skip, reschedule, pause/resume, TZ/DST | consolidation, statuses | condition, event |
| Persistence | local-only PowerSync, schema, repos, UoW | storage-failure handling | persist(), quota, multi-tab, local migrations |
| UX | 7 nav sections, dark mode, responsive, reminders | Dashboard, Asset lifecycle | sync/saved indicator, attachments |
| Modules (§2) | household/routines via activity types | digital upkeep, ownership | dedicated UIs |
| Backup | export, restore, preview, merge/replace, checksum | — | attachments in export |
| Delivery | PWA, tests | Vercel readiness | CI, README, ADRs |

---

## P1 — Phase 1 acceptance and data safety

### G-01 Persistent storage request and quota handling — S ✅ done
- **Spec:** §9.3 (persistent-storage requests, quota exhaustion, eviction), §14.
- **State:** No `navigator.storage.persist()` call anywhere. Only a startup failure notice exists ([AppProvider.tsx](../apps/web/src/app/providers/AppProvider.tsx)). A write that fails mid-session (quota, eviction) is not distinguished or explained.
- **Work:** Request persistence after first meaningful write; show result in Settings ("Storage: protected / best-effort") with the §9.3 caveat that it is never guaranteed; catch quota/write errors in the unit of work and surface a clear message that the change was *not* saved; show `navigator.storage.estimate()` usage in Settings; nudge a backup when storage is not persistent.
- **Done when:** a simulated `QuotaExceededError` shows an error and leaves data consistent; Settings reports persistence status.

### G-02 "Saved on this device" / sync-state indicator — S
- **Spec:** §7.1, §7.7, §13 (Dashboard sync status), criterion 13, Epic 2 "sync status indicators".
- **State:** No indicator at all. The sync-state vocabulary (Offline / Syncing / Synced / Attention / Unavailable) is not modelled.
- **Work:** Introduce a `SyncStatus` contract in `contracts` with a Phase 1 implementation that always reports "Saved on this device · sync not enabled". Render in the app shell and Dashboard. Phase 2 swaps in the PowerSync-backed implementation.
- **Done when:** indicator visible on every screen; component driven only by the contract.

### G-03 Multi-tab behaviour — M
- **Spec:** §9.3 (multiple tabs, concurrent reads/writes), §20 browser tests.
- **State:** Untested and unhandled. [powersync.ts](../packages/infrastructure/src/powersync.ts) says "only open one instance per file"; two tabs open the same DB.
- **Work:** Verify PowerSync Web multi-tab/shared-worker behaviour for the pinned SDK version; make the reminder engine run in one tab only (avoid duplicate notifications); make reactive queries refresh across tabs; add an E2E with two pages.
- **Done when:** a completion in tab A appears in tab B without reload and a reminder notifies once.

### G-04 Local schema migration strategy — M
- **Spec:** §8.4, §9.3 (app upgrades and local schema migrations), §24 ("existing user data remains safe across upgrades"), E2E "upgrade the PWA while local data exists".
- **State:** The schema is declarative ([schema.ts](../packages/infrastructure/src/schema.ts)); there is no versioned local migration path or upgrade test. Backups have a schema version and migrations, the live DB does not.
- **Work:** Track a local schema version; define how added/renamed columns and data backfills run on startup; test upgrading a DB seeded from an older fixture. Also decide whether PowerSync's view-based schema needs raw-table migrations once the first breaking change lands.
- **Done when:** an automated test opens a v(N-1) database and ends on v(N) with data intact.

### G-05 Vercel deployment readiness — S
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

### G-07 Attachments — L
- **Spec:** §10, §13 (activity creation and completion), §15 (export), Epic 3, Epic 11.
- **State:** Only an `Attachment` entity type in [supporting.ts](../packages/domain/src/entities/supporting.ts). No table in `schema.ts`, no repository, no `AttachmentStorage` abstraction, no UI, not in backup. The spec's `attachments` table is absent.
- **Work:** `attachments` table and repo; a provider-neutral `AttachmentStorage` with a Phase 1 local implementation (OPFS/IndexedDB blobs); attach to assets, activities and completions; states (stored / missing / failed); size limits and quota interaction with G-01; export as optional archive, restore with integrity check.
- **Open question:** where blobs live in Phase 1 (separate from the SQLite DB to keep it small).

### G-08 Condition-based scheduling — M
- **Spec:** §6.4 #5.
- **State:** Strategy type and validation exist; `missingDueDates` returns nothing for it ([generate.ts](../packages/domain/src/scheduling/generate.ts)); no form UI.
- **Work:** Trigger an occurrence when a recorded measurement crosses the threshold (on `recordMeasurement`), idempotent per crossing, with re-arm rule (must return across the threshold first); form UI; tests.

### G-09 Event-based scheduling — M
- **Spec:** §6.4 #6.
- **State:** Same as G-08. No event model exists.
- **Work:** Decide the event source (completion of another activity, named user event) and the trigger semantics; implement generation and form UI. Needs a short design note first.

### G-10 Fixed-interval strategy missing from the activity form — S
- **Spec:** §6.4 #3, Epic 4.
- **State:** Domain and generation support it; the form's `Repeat` is `none | calendar | after_completion | usage` and marks other strategies non-editable.
- **Work:** Add "every N units from a start date, regardless of completion" and make existing fixed schedules editable.

### G-11 Missed-occurrence consolidation not wired — M
- **Spec:** §6.5, §12.1 (missed outcomes recorded faithfully).
- **State:** `consolidateMissed` exists in [policy.ts](../packages/domain/src/scheduling/policy.ts) and is tested, but the application layer never calls it. After a long absence, overdue items may pile up.
- **Work:** Call it in `reconcileSchedules`; define the resulting status/outcome ("missed" is named in §12.1 but is not an occurrence status); show consolidated items clearly in Dashboard and History.
- **Decide:** whether "missed" becomes a status or stays derived.

### G-12 Digital upkeep module — M
- **Spec:** §2.4, Epic 7 (subscriptions, domain/hosting renewals, security reviews, backup reminders).
- **State:** Only reachable as generic `renewal`/`administrative` activities. No notion of a service or subscription: renewal date, amount, billing period, provider, or a list view.
- **Work:** Either dedicated lightweight entity/fields (provider, renewal date, cost, cycle) with a "Digital" view, or documented templates over activities and assets. Recommend templates plus a filtered view first. Must not store passwords or recovery codes.

### G-13 Dashboard: maintenance and warranty alerts — S
- **Spec:** §13 Dashboard ("Maintenance alerts"), §2.2 (warranty reminders).
- **State:** Overdue / Due today / Coming up / Recently done exist. Warranty expiry is stored and displayed on the asset but never raised as an alert or reminder.
- **Work:** Derived alerts: warranty expiring within N days, usage meters near their threshold, assets with no recent service. Computed on demand like reminders (ADR-019).

### G-14 Household module — M
- **Spec:** §2.1, Epic 5 (rooms, cleaning checklists, household dashboard views, seasonal activities).
- **State:** Locations and categories exist and filter activities. No household-specific dashboard view, checklist templates, or seasonal scheduling (e.g. "every spring", date-window schedules).
- **Work:** Room-grouped view, reusable checklist templates, seasonal recurrence (calendar yearly with month/day, optionally a window).

### G-15 Routines and administrative life tasks — S
- **Spec:** §2.5, Epic 7.
- **State:** Works via activity types; no routine-specific view, no user-defined activity types (spec: "user-defined activity types"), only the fixed list plus `custom`.
- **Work:** Decide whether user-defined types are real entities or just `custom` + category; add a Routines view.

### G-16 Ownership management: replacement planning and lifecycle — M
- **Spec:** §2.3.
- **State:** Status, purchase, vendor and warranty exist, plus retire/reactivate. No expected lifespan, replacement-due date, condition rating, or replacement planning view; "links to maintenance activities" is done.
- **Work:** Add expected end-of-life and condition; surface "replace soon" in alerts (G-13); lifecycle states beyond active/retired/disposed if needed.

### G-17 Occurrence statuses: `cancelled` unused; 'missed' undefined — S
- **Spec:** §6.3, §12.1.
- **State:** `cancelled` exists in the type but no use case or UI sets it. §12.1 lists `missed` as an outcome but §6.3 has no such status.
- **Work:** Add a cancel action (or drop the status and update the spec); resolve the missed-status question with G-11.

### G-18 Measurements: history and trends — M
- **Spec:** §2.2, Epic 9 ("measurement history"), §13.
- **State:** Measurements are recorded and shown inline in History entries; Insights has meter data. No per-asset/per-key measurement history view or chart, no condition-style (qualitative) entry UI.
- **Work:** Measurement history screen on the asset, with a simple trend chart; qualitative measurement entry.

### G-19 Local data protection claims — S
- **Spec:** §14 (do not claim encryption at rest unless verified; local DB encryption to be evaluated).
- **State:** No evaluation recorded; no user-facing statement about what is and is not protected.
- **Work:** Write the threat-model note, decide on app-lock/encryption (likely out of scope for Phase 1), and ensure no UI text overclaims.

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

### G-23 Error reporting and diagnostics — S
- **Spec:** §5.1 (logging and diagnostics), Epic 12 (monitoring and error reporting).
- **State:** `console.error` only. No in-app diagnostics (app version, DB size, schema version, last error) for supportability.
- **Work:** Settings "Diagnostics" panel with copy-to-clipboard; a top-level error boundary with a path to export a backup.

---

## P3 — Drift, hygiene and documentation

### G-24 Repository structure drift from §16 — M (decide first)
The code does not match §16. Either restructure or amend the spec.

| Spec §16 | Actual |
|---|---|
| `features/household`, `digital-upkeep`, `routines` | absent (see G-12, G-14, G-15) |
| `infrastructure/{powersync,auth,attachments,notifications}` in app | PowerSync lives in `packages/infrastructure`; notifications in `shared/notifier.ts` and `app/providers/reminderEngine.ts`; no auth or attachments |
| `packages/design-system` | absent; styles in `index.css` |
| `backend/`, `powersync/`, `deployment/` | absent (Phase 2 / G-05) |
| `tests/{integration,e2e,fixtures}` | tests are colocated; E2E in `apps/web/e2e/` |
| `docs/{product,architecture,domain,decisions,deployment,testing}` | only `Tend.md`, `GAPS.md`, and an empty `decisions/` |

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

| ID | Item | Spec |
|---|---|---|
| G-33 | Web Push for background reminders | §11, ADR-019 |
| G-34 | Supabase project, Auth adapter, account export and deletion | §3.2, §14 |
| G-35 | PowerSync Cloud, Sync Streams (`powersync/sync-config.yaml`) | §7.4 |
| G-36 | Upload handler, `SyncUploadHandler` contract, idempotency via `(owner_id, client_mutation_id)` | §7.5–7.6 |
| G-37 | `client_id` / `client_mutation_id` columns (not yet in schema; deliberately Phase 2 per [meta.ts](../packages/domain/src/entities/meta.ts)) | §7.6 |
| G-38 | PostgreSQL schema, RLS, roles and migrations in `backend/migrations` | §8, §8.3 |
| G-39 | Conflict-resolution UI (version checks, "attention required") | §7.6–7.7 |
| G-40 | Reassign local owner ID to the authenticated user on first sign-in | §3.5 |
| G-41 | Remote attachment storage and upload queue | §10 |
| G-42 | Dev/staging/prod environments, secrets handling | §17 |
| G-43 | Self-hosted PowerSync on Oracle ARM; migration path | §4.2–4.3, §18 |
| G-44 | Sync integration, RLS and infrastructure tests | §20 |
| G-45 | Gamification (XP, levels, streaks, achievements) — deferred by §12/ADR-016 | §12 |

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
