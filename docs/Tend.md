# Tend — Product & Engineering Specification

**Version:** 0.6 — Hybrid deployment architecture; gamification deferred; offline-first phasing; completion corrections; reminders  
**Date:** 5 November 2026  
**Status:** Proposed baseline for implementation

---

## 1. Product vision

**Maintain your life. Don't manage another to-do list.**

Tend is a local-first personal maintenance and life-management application. It helps users keep track of the things they own, the activities that need doing, and the history of what has happened.

It should feel like a personal upkeep companion rather than a conventional task manager: intuitive, engaging, progress-focused, and extensible.

### Core concepts

1. **Things:** assets, rooms, locations, subscriptions, services, and other entities that need attention.
2. **Activities:** recurring or one-off actions associated with those things.
3. **History:** what happened, when it happened, what it cost, measurements recorded, and what should happen next.

### Product principles

- Local-first: normal app usage must not depend on a network connection.
- User-owned data: export and restore must remain available independently of synchronization.
- Assisted automation: calculate due dates and surface suggestions, but require approval for meaningful changes.
- Extensible domain: new upkeep categories and scheduling strategies should not require architectural changes.
- Clear UX: completing an activity should be quick; recording detailed information should be optional.
- No punishment-based gamification.
- No mandatory hosted backend for core application functionality.

---

## 2. Product scope

All five modules are part of the initial product scope.

### 2.1 Household upkeep

- Rooms and household areas.
- Cleaning schedules and checklists.
- Kitchen, bathroom, laundry, and general household routines.
- Appliance cleaning and periodic inspections.
- Seasonal activities.

### 2.2 Asset maintenance

- Vehicles, computers, monitors, electronics, appliances, and other assets.
- Maintenance and servicing schedules.
- Usage-based schedules, such as kilometres or operating hours.
- Measurements and condition records.
- Maintenance costs, service history, and notes.
- Warranty and service reminders.

### 2.3 Ownership management

- Owned-item inventory.
- Purchase date, price, vendor, and warranty information.
- Condition and lifecycle status.
- Replacement planning.
- Links between owned items and maintenance activities.

### 2.4 Digital upkeep

- Subscriptions and renewal dates.
- Domains, hosting, licences, and services.
- Backup reminders.
- Security reviews.
- Periodic account and service reviews.

Do not store passwords, authentication secrets, or recovery codes.

### 2.5 Routines and life administration

- Personal recurring routines.
- One-off activities.
- Custom checklists.
- Administrative reminders.
- User-defined activity types.

### Non-goals

- Accounting or full personal finance management.
- Password management.
- Cloud file storage.
- Full project management or calendar replacement.
- Appliance control or vehicle telemetry.
- Medical or fitness tracking.
- Multi-user collaboration in the initial release.

---

## 3. Platforms and technology decisions

### 3.1 Client application

| Area | Decision |
|---|---|
| UI framework | React |
| Language | TypeScript |
| Build tooling | Vite |
| Application type | Installable PWA |
| Styling | Tailwind CSS |
| UI components | shadcn/ui, selectively |
| Client database | PowerSync Web SDK / SQLite WASM |
| Client state | Zustand for transient UI state |
| Data queries | PowerSync query APIs and reactive observers |
| Routing | React Router |
| Testing | Vitest, React Testing Library, Playwright |
| Package manager | pnpm |

The application should be designed for Android browsers and desktop browsers. A native mobile application may be considered later, reusing the domain and application layers where practical.

### 3.2 Persistence and synchronization

| Area | Decision |
|---|---|
| Local database | SQLite through PowerSync Web |
| Browser persistence | PowerSync-managed WASM SQLite storage |
| Central database | PostgreSQL |
| Initial PostgreSQL provider | Supabase |
| Initial sync service | PowerSync Cloud |
| Sync protocol | PowerSync replication and upload queue |
| Authentication | Supabase Auth |
| Backend write boundary | Application-defined upload implementation |
| Attachments | Separate storage abstraction; local-first queue |
| Backup | Independent export and restore system |

**Do not introduce Dexie as a parallel application database.** PowerSync's SQLite database is the primary client persistence layer.

Browser storage implementation details, including OPFS/IndexedDB behaviour, must be verified against the selected PowerSync SDK version and supported browsers. Treat the PowerSync SDK as the storage abstraction rather than writing application features against browser storage APIs.

### 3.3 Hosting

| Component | Initial deployment | Future option |
|---|---|---|
| PWA | Vercel | Any static hosting |
| PostgreSQL | Supabase | Self-managed PostgreSQL or another managed provider |
| Authentication | Supabase Auth | Provider-neutral auth adapter |
| Sync service | PowerSync Cloud | Self-hosted PowerSync |
| Application API | Supabase-backed upload implementation initially | Oracle-hosted API |
| Background jobs | Managed/serverless initially | Oracle-hosted workers |
| Attachments | Storage adapter, provider selected separately | S3-compatible storage or equivalent |

### 3.4 Architecture decision

Adopt a **hybrid-ready architecture**:

- Start with managed infrastructure to minimize operational overhead.
- Keep the client, domain model, database contracts, and sync integration independent of hosting providers.
- Maintain deployment configuration for a future self-hosted PowerSync environment.
- Do not make Oracle Cloud a runtime dependency for the initial release.

This gives us the option to migrate infrastructure without rebuilding the product.

### 3.5 Delivery phasing: offline first, sync later

The product is built in two phases.

**Phase 1: fully offline.** The app is complete and usable on a single device with no account and no network. Data lives in the local SQLite database through the PowerSync Web SDK running **local-only**: the database is created and used normally, but it is never connected to a backend. There is no Supabase project, no PowerSync Cloud instance, no authentication, and no upload handler in this phase. Export and restore (§15) are the user's data-safety mechanism.

**Phase 2: synchronization.** Connect the same local database to PowerSync and Supabase, add authentication, Sync Streams, the upload handler, RLS, and sync status UX.

Rules that keep Phase 2 cheap:

- Phase 1 uses the PowerSync SDK and the schema conventions of §8 (UUID keys, `owner_id`, `version`, append-only history) so no local data migration is needed when sync is enabled.
- Application and domain code depend only on repository contracts, never on the SDK (§9.2).
- With no account in Phase 1, a fixed local owner id is used; Phase 2 reassigns records to the authenticated user as part of first sign-in.
- Sections 7.4 to 7.7, 8.3, 10 (remote storage), and 17 to 18 describe Phase 2 and are not built in Phase 1.

---

## 4. High-level architecture

### 4.1 Initial deployment

```text
                USER DEVICES
        Android browser / Desktop browser
                       |
                       v
             Vercel - React PWA
                       |
              PowerSync Web SDK
                       |
            SQLite WASM (local DB)
                       |
              Local write queue
                       |
                 HTTPS / WSS
                       |
                       v
              PowerSync Cloud
                 /         \
                /           \
       Sync Streams       Upload queue
             |                 |
             v                 v
       PostgreSQL       Upload implementation
        (Supabase)       / validation boundary
             ^                 |
             |                 v
             +---------- PostgreSQL
                       |
                 Supabase Auth
```

The diagram separates two directions:

**Download / replication**

1. PostgreSQL changes are captured through logical replication.
2. PowerSync processes changes.
3. Sync Streams determine which records belong on each client.
4. The client receives changes and updates its local SQLite database.

**Upload**

1. The user changes data in local SQLite.
2. PowerSync records the change in its upload queue.
3. When connected, PowerSync invokes the application's upload implementation.
4. The implementation validates the operation and applies it to PostgreSQL.
5. PostgreSQL becomes the source for subsequent synchronization to other clients.

The application must not assume that a local write has already been accepted by PostgreSQL merely because it was successfully written locally.

### 4.2 Future self-hosted deployment

```text
                   USER DEVICES
                         |
                         v
                 Vercel / static host
                         |
                  PowerSync Web SDK
                         |
                  SQLite WASM
                         |
                         v
              Oracle Cloud ARM instance
                 PowerSync Service
                         |
                +--------+--------+
                |                 |
                v                 v
             MongoDB          PostgreSQL
          (sync storage)    (Supabase initially
                            or external Postgres)
                                  |
                                  v
                         Upload implementation
```

The exact self-hosted topology must follow the PowerSync version's deployment requirements. Do not assume that the initial Cloud configuration can simply be copied to Oracle without provisioning its supporting services.

### 4.3 Oracle deployment strategy

Available machines:

- AMD E2 Micro: 1 core / 1 GB RAM.
- ARM Ampere: 1 OCPU / 6 GB RAM.

Decision:

- Do not target the AMD 1 GB instance for the full self-hosted sync stack.
- Treat the ARM 6 GB instance as the preferred self-hosting candidate.
- Validate ARM64 container support for every selected component.
- Keep PostgreSQL managed initially.
- Run load and memory tests before moving production sync traffic.
- Do not promise production availability based on a single instance.

The Oracle machine may also host small API services, scheduled jobs, monitoring experiments, and internal tools independently of the sync service.

---

## 5. Architectural boundaries

Use a modular monolith for the application code. Modules communicate through domain and application interfaces rather than directly accessing one another's persistence implementations.

### 5.1 Layers

**Presentation**

- React pages and components.
- Navigation and layouts.
- Forms and user interactions.
- Dashboard and visualizations.
- Loading, offline, and sync-state indicators.

**Application**

- Use cases and workflows.
- Input validation.
- Activity completion orchestration.
- Scheduling commands.
- Asset maintenance workflows.
- Backup and restore orchestration.

**Domain**

- Entities and value objects.
- Scheduling policies.
- Domain invariants.
- Completion and measurement rules.
- Domain events.
- Progress and achievement rules *(deferred, see §12)*.

**Infrastructure**

- PowerSync database adapter.
- PostgreSQL upload implementation.
- Authentication adapter.
- Notification adapters.
- Attachment storage.
- Export and restore.
- Logging and diagnostics.

### 5.2 Module boundaries

| Module | Responsibility |
|---|---|
| Core | IDs, dates, money, units, errors, common contracts |
| Activities | Activity definitions and activity lifecycle |
| Scheduling | Recurrence, due dates, occurrences, scheduling policies |
| Assets | Asset inventory and lifecycle |
| Maintenance | Maintenance records, inspections, measurements |
| Household | Rooms, household areas, cleaning activities |
| Digital upkeep | Services, subscriptions, domains, renewals |
| Routines | Personal routines and administrative activities |
| Notifications | Reminder scheduling and delivery |
| History | Completion history and audit events |
| Insights | Trends, progress, maintenance summaries |
| Gamification *(deferred)* | XP, levels, streaks, achievements. Not built in the first release; see §12 |
| Backup | Export, import, restore, integrity validation |
| Synchronization | PowerSync connection, upload, sync state, conflict handling |
| Settings | Preferences, account, storage and sync configuration |

A feature module must not reach into another feature's database implementation. Cross-module operations should use application services or domain contracts.

---

## 6. Domain model

### 6.1 Core entities

| Entity | Purpose |
|---|---|
| Category | Activity classification |
| Location | Room, area, or physical location |
| Asset | Owned item or maintained entity |
| Activity | Reusable activity definition |
| Schedule | Rules for generating due work |
| Occurrence | A specific instance of an activity due |
| Completion | Record of an activity being completed |
| Measurement | Numeric or qualitative measurement |
| Reminder | Notification configuration |
| Attachment | Reference to an associated file |
| AuditEvent | Record of important changes |
| UserProgress *(deferred)* | Gamification progress |
| ExperienceTransaction *(deferred)* | XP award or adjustment |
| Achievement *(deferred)* | Achievement definition |
| UserAchievement *(deferred)* | Achievement earned by a user |

The four entities marked deferred are not part of the first-release schema (see §12).

### 6.2 Activity types

- Cleaning
- Inspection
- Maintenance
- Replacement
- Renewal
- Routine
- Administrative
- Custom

### 6.3 Occurrence statuses

- Pending
- Completed
- Skipped
- Snoozed
- Superseded
- Cancelled
- Missed (an overdue occurrence rolled up after a long absence)

### 6.4 Scheduling strategies

1. Calendar-based: every Monday, first day of the month, etc.
2. Completion interval: 30 days after the last completion.
3. Fixed calendar interval: every month regardless of completion date.
4. Usage-based: every 1,000 km or 100 operating hours.
5. Condition-based: trigger when a measurement crosses a threshold.
6. Event-based: triggered by another activity or user-defined event.

### 6.5 Scheduling policies

Support:

- Grace periods.
- Early and late completion.
- Snoozing.
- Skipping.
- Rescheduling.
- Missed-occurrence consolidation.
- Fixed versus floating schedules.
- Timezone and daylight-saving handling.
- Pause and resume.
- Completion-based next due date.
- Fixed-date next due date.

Schedule generation must be bounded and idempotent. Never generate an unlimited number of future occurrences.

When a schedule changes, preserve completed history. Outstanding occurrences should be updated using an explicit policy rather than silently deleted.

---

## 7. Data ownership and synchronization model

This is a critical part of the architecture.

### 7.1 Local-first behaviour

The local SQLite database is the application's immediate read/write database.

- UI queries read from local SQLite.
- User mutations write to local SQLite.
- Writes should not wait for a network request.
- Offline changes remain queued.
- Sync resumes automatically when connectivity returns.
- The UI must distinguish local persistence from server acknowledgement.

A local write is considered **saved on this device** when its SQLite transaction succeeds. It is considered **synced** only after the upload has been accepted and the synchronization state confirms it.

### 7.2 Authority model

| Data | Immediate authority | Cross-device authority |
|---|---|---|
| User-created activity | Local SQLite | PostgreSQL after upload |
| Asset changes | Local SQLite | PostgreSQL after upload |
| Completion records | Local SQLite | PostgreSQL after upload |
| Measurements | Local SQLite | PostgreSQL after upload |
| Preferences | Local SQLite | PostgreSQL if sync enabled |
| Derived dashboard values | Recomputed locally | Not independently authoritative |
| Sync metadata | PowerSync | PowerSync |
| XP transactions *(deferred)* | Domain-generated locally | PostgreSQL after upload |

The application must remain usable if synchronization is unavailable for an extended period.

### 7.3 Synchronization responsibilities

**PowerSync owns:**

- Replication from PostgreSQL.
- Local sync metadata.
- Download synchronization.
- Upload queue management.
- Sync checkpoints and stream processing.
- Client connection and sync status.

**Tend owns:**

- Domain validation.
- Authorization decisions beyond basic authentication.
- Upload implementation.
- Conflict resolution policy.
- Business invariants.
- Schema migration strategy.
- Backup and restore.
- User-facing sync diagnostics.

PowerSync is not a replacement for application business logic.

### 7.4 Sync Streams

Define streams around user ownership and access boundaries.

Initial stream design:

- `user_profile`: the signed-in user's profile and preferences.
- `user_data`: activities, schedules, occurrences, assets, locations, categories, and measurements owned by the user.
- `user_history`: completions and audit events owned by the user.
- `user_progress` *(deferred, see §12)*: XP transactions and achievements.
- `user_attachments`: attachment metadata for the user.

Every synced record must have an ownership relationship that can be checked server-side.

Use `auth.user_id()` or the supported equivalent in PowerSync Sync Streams to scope user records. Do not trust a client-supplied owner ID as authorization.

Avoid syncing every user's data to every device. Sync only the records required by the authenticated user and the active product experience.

### 7.5 Upload implementation

Create a provider-neutral interface:

```ts
interface SyncUploadHandler {
  uploadData(
    user: AuthenticatedUser,
    batch: UploadBatch
  ): Promise<UploadResult>;
}
```

The initial implementation may use Supabase APIs and PostgreSQL transactions.

The implementation must:

1. Authenticate the caller.
2. Verify record ownership.
3. Validate the operation and payload.
4. Enforce domain invariants.
5. Apply the operation transactionally.
6. Handle duplicate submissions idempotently.
7. Return actionable errors.
8. Avoid accepting arbitrary table or column updates from an untrusted client.

Use a controlled operation allowlist for sensitive or complex workflows. Do not expose a generic unrestricted database mutation endpoint.

### 7.6 Conflict resolution

Do not use blind whole-record last-write-wins for every entity.

Initial policies:

| Data | Conflict strategy |
|---|---|
| Activity metadata | Version check; resolve compatible edits or ask user |
| Schedule changes | Explicit version check and conflict resolution |
| Completion records | Append-only; unique operation ID. Mistakes are corrected by appending a void (see 8.2), never by editing |
| Measurements | Append-only; unique operation ID |
| Audit events | Append-only |
| XP transactions *(deferred)* | Append-only, idempotent |
| Preferences | Per-field merge where safe |
| Attachments | Unique IDs and metadata reconciliation |

Each client-originated mutation should carry:

- `id`
- `owner_id`
- `created_at`
- `updated_at`
- `client_id`
- `client_mutation_id`
- `version` where applicable

Use a unique constraint on `(owner_id, client_mutation_id)` for idempotent uploads.

For mutable entities, include a version or revision number. A stale update should not silently overwrite a newer server-side change.

### 7.7 Sync UX

Expose clear states:

- Offline — changes are saved on this device.
- Syncing — changes are being uploaded or downloaded.
- Synced — no pending changes.
- Attention required — one or more changes need resolution.
- Sync unavailable — the app remains usable locally.

Do not block completion workflows just because the network is unavailable.

---

## 8. PostgreSQL data architecture

PostgreSQL is the central cross-device data store. The local SQLite schema and PostgreSQL schema should be intentionally aligned, but should not be assumed to be identical in every implementation detail.

### 8.1 Initial schema

Suggested tables:

```text
profiles
categories
locations
assets
activities
schedules
occurrences
completions
completion_voids
measurements
reminders
reminder_deliveries
attachments
audit_events
```

Deferred until gamification is built (not in the first-release schema): `user_progress`, `experience_transactions`, `achievements`, `user_achievements`.

Every user-owned table should contain an `owner_id` referencing the authenticated user.

### 8.2 Schema conventions

- UUID primary keys.
- UTC timestamps for persisted instants.
- Explicit timezone identifiers for calendar-based scheduling.
- Numeric values for money and measurements where precision matters.
- Explicit units for measurements.
- JSONB only for genuinely flexible metadata, not as a substitute for relational structure.
- Foreign keys and indexes for ownership and relationship columns.
- Soft deletion only where recovery or synchronization requires it.
- Append-only history for completions and measurements (and XP transactions once gamification is built).
- Corrections to history are appended, not edited. A `completion_voids` row marks a completion as undone or as replaced by a corrected one (`replaced_by`); every list, total and reading ignores voided completions and the measurements recorded with them, and the original stays on record. Editing an entry in the app saves a corrected completion and voids the old one, so the person edits once while every device still agrees on the data.

### 8.3 PostgreSQL security

Enable Row Level Security on user-owned tables.

Policies must enforce that authenticated users can access only their own records. The upload implementation must still validate ownership and domain invariants.

PowerSync requires a dedicated database connection with the privileges required for replication. Do not use the application's ordinary client credentials for the replication connection.

Use separate secrets and roles for:

- Application access.
- PowerSync replication.
- Administrative migrations.
- Background jobs.

Never expose database passwords, service-role keys, PowerSync administrative tokens, or server secrets in the PWA bundle.

### 8.4 Migrations

Maintain version-controlled PostgreSQL migrations.

- Schema changes must be reviewed.
- Sync configuration changes must be versioned.
- Client migrations must be tested against existing local data.
- Destructive migrations require a recovery strategy.
- Deploy compatible schema changes before deploying clients that depend on them.

---

## 9. Local database and browser persistence

### 9.1 PowerSync Web

Use the official PowerSync Web SDK as the client database and synchronization layer.

The SDK provides the local SQLite-backed database and synchronization machinery. React components should query through application-level repositories or hooks rather than directly coupling every screen to PowerSync APIs.

### 9.2 Local data access

Define interfaces such as:

```ts
interface ActivityRepository {
  getById(id: string): Promise<Activity | null>;
  list(filter: ActivityFilter): Promise<Activity[]>;
  save(activity: Activity): Promise<void>;
  delete(id: string): Promise<void>;
}

interface CompletionRepository {
  add(completion: Completion): Promise<void>;
  list(filter: CompletionFilter): Promise<Completion[]>;
}
```

Provide PowerSync-backed implementations.

Domain and application code should depend on these contracts, not on the SDK's internal database objects.

### 9.3 Browser storage requirements

Test:

- Persistent database availability after refresh.
- Offline startup after installation.
- Browser restart.
- Multiple tabs.
- Concurrent reads and writes.
- Storage quota exhaustion.
- Private browsing limitations.
- Browser storage eviction.
- Device storage cleanup.
- App upgrades and local schema migrations.

Use browser persistent-storage requests where supported, but never promise that the browser can guarantee permanent storage.

The app must detect storage failures and explain the implications to the user.

### 9.4 Data recovery

Synchronization is not a backup.

Users must be able to export their data even if sync is disabled. A user must also be able to restore an export without depending on PowerSync Cloud.

---

## 10. Attachments

Attachments should not be embedded directly in the main relational sync model.

Create an attachment abstraction:

```ts
interface AttachmentStorage {
  upload(file: File, metadata: AttachmentMetadata): Promise<StoredAttachment>;
  download(id: string): Promise<Blob>;
  delete(id: string): Promise<void>;
}
```

Requirements:

- Store attachment metadata in PostgreSQL.
- Keep file bytes in a dedicated storage provider.
- Queue attachment uploads while offline.
- Track upload state and retry safely.
- Verify file ownership and access.
- Support missing-file and failed-upload states.
- Include attachment metadata and, where requested, file contents in exports.

Choose the initial storage provider during implementation planning. Keep the interface provider-neutral.

---

## 11. Notifications and reminders

Support:

- In-app reminders.
- Browser notifications where permission is granted.
- Optional Web Push in a later phase.
- Reminder reconciliation on application startup and resume.

Do not rely on persistent browser timers. A PWA service worker can be suspended, and browser background execution differs across platforms.

The scheduling engine determines whether something is due. Notification adapters only deliver reminders.

The application must remain correct even if a notification is delayed, suppressed, or never delivered.

### 11.1 Phase 1 behaviour

- A reminder belongs to an activity: \`lead_days\` before each due date (0 is the day itself) at a wall-clock \`at_time\` in the person's time zone. A reminder can be switched off without losing it (\`enabled\`).
- What has fired is computed on demand from the outstanding work and each reminder's time; nothing is stored for it, so it is correct after any length of absence. The Dashboard shows it as a Reminders panel and a count beside Dashboard (and as the app-icon badge where supported). It clears when the work is done, and moves with a snooze.
- Browser notifications are opt-in per device and need browser permission. Reminders that fire together become one notification. Each delivery is recorded in \`reminder_deliveries\` (reminder, occurrence, due date) so it is not repeated; a snooze changes the due date and so re-arms it. If a notification cannot be shown, it is not recorded, and is offered again later.
- The check runs at startup, on resume, and once a minute while the app is open. No notification appears while the app is fully closed; that needs Web Push (Phase 2).

---

## 12. Gamification

> **Status: deferred. Out of scope for the first release.**
> The first release delivers a basic, fully functional upkeep app. No XP, levels, streaks, achievements, milestones, challenges, or progress summaries are built, and no gamification tables, sync streams, or UI are included. The material below is retained as the intended direction for a later release.

### 12.1 First-release obligations

Deferral must not make gamification harder to add later. The first release must:

- Record occurrence outcomes faithfully (completed, skipped, snoozed, superseded, cancelled, missed), including timestamps and grace-period information.
- Preserve completion history, including planned versus actual completion date.
- Keep activity completion free of any gamification coupling (ADR-014).
- Not add placeholder gamification UI, empty tables, or stub sync streams.

Because XP, levels, and streaks are to be derived from occurrence and completion history, they can be introduced later without a data migration.

### 12.2 Intended direction (post-first-release)

Gamification should encourage consistency without creating anxiety or punishment.

Features:

- XP for completed activities.
- Levels.
- Streaks.
- Category progress.
- Achievements.
- Milestones.
- Optional challenges.
- Progress summaries.

Rules:

- Never remove XP simply because an activity was missed.
- Keep gamification separate from scheduling.
- Make it possible to disable gamification.
- Use idempotent XP transactions.
- Do not let a gamification failure prevent activity completion.

### 12.3 Open design questions (to resolve before building)

- **Streak model.** Streaks are daily-cadence by nature but schedules are weekly, monthly, seasonal, usage-based, or condition-based. Leading proposal:
  - Count consecutive on-time occurrences per activity, not calendar days.
  - Late completion, snooze within grace, intentional skip, and pause are neutral; only a true miss breaks a streak.
  - Show current and best streak together, with an optional recovery window or earned freeze.
  - Offer a non-resetting "active days" count as the anxiety-free headline metric.
  - Always derive streaks from history; never store them as authoritative.
  - Open: late completion (hold vs extend), break softening, headline metric, treatment of usage and condition-based schedules.
- **XP economy.** XP per activity, weighting by type, effort, or priority, level curve, and protection against farming trivial activities.
- **Achievements and challenges.** Catalogue, rule engine (declarative or coded), and authorship of challenges.
- **Backfilled and restored data.** XP rules for backdated completions, imports, and restored exports.
- **Sync edge cases.** Duplicate achievement awards across offline devices; uniqueness constraints; levels and streaks always recomputed from the transaction log.
- **Disabling gamification.** Whether this hides UI only or also stops earning.
- **Scope.** Which modules and activity types earn XP.
- **Presentation.** Feedback design, reduced-motion and accessibility handling, and whether achievements trigger notifications.

---

## 13. UX and navigation

Primary navigation:

1. Dashboard
2. Activities
3. Assets
4. Calendar
5. History
6. Insights
7. Settings

### Dashboard

- Due today.
- Overdue activities.
- Upcoming activities.
- Recent completions.
- Maintenance alerts.
- Quick completion actions.
- Sync status.

### Activity creation

Fields:

- Name and description.
- Category.
- Location.
- Linked asset.
- Activity type.
- Schedule.
- Reminder settings.
- Priority.
- Estimated duration.
- Checklist.
- Measurement requirements.
- Optional attachments.

### Completion workflow

Allow quick completion with one action.

Optional details:

- Notes.
- Measurements.
- Cost.
- Checklist completion.
- Attachments.
- Actual completion date.
- Deviation reason.

Completion should be possible offline.

---

## 14. Security and privacy

- Do not store passwords or authentication secrets.
- Use Supabase Auth initially.
- Enforce user ownership in PostgreSQL.
- Enable RLS on user-owned tables.
- Keep server credentials out of the client.
- Use HTTPS and secure WebSocket connections.
- Validate uploads server-side.
- Use minimal permissions for PowerSync replication.
- Provide account export and deletion workflows.
- Avoid collecting unnecessary personal data.
- Provide clear sync and storage controls.

Local database encryption should be evaluated against the actual browser SDK capabilities and threat model. Do not claim that browser-local data is encrypted at rest unless the implementation and key management have been verified.

---

## 15. Backup and restore

Backup is an independent subsystem, not a feature of synchronization.

### Export

- Versioned JSON data export.
- Optional attachment archive.
- Include all user-owned records.
- Include metadata and schema version.
- Validate export integrity.

### Restore

- Preview before applying.
- Merge or replace modes.
- Duplicate detection.
- Referential integrity validation.
- Schema version migration.
- Clear recovery errors.

A backup must be usable independently of the hosting provider and PowerSync deployment.

---

## 16. Repository structure

```text
tend/
├── apps/
│   └── web/
│       ├── public/
│       │   └── icons/
│       ├── src/
│       │   ├── app/
│       │   │   ├── router/
│       │   │   ├── providers/
│       │   │   └── layouts/
│       │   ├── features/
│       │   │   ├── dashboard/
│       │   │   ├── activities/
│       │   │   ├── assets/
│       │   │   ├── household/
│       │   │   ├── digital-upkeep/
│       │   │   ├── routines/
│       │   │   ├── calendar/
│       │   │   ├── history/
│       │   │   ├── insights/
│       │   │   └── settings/
│       │   ├── infrastructure/
│       │   │   ├── powersync/
│       │   │   ├── auth/
│       │   │   ├── attachments/
│       │   │   └── notifications/
│       │   ├── shared/
│       │   │   ├── ui/
│       │   │   ├── hooks/
│       │   │   └── utilities/
│       │   └── main.tsx
│       └── vite.config.ts
├── packages/
│   ├── domain/
│   ├── application/
│   ├── contracts/
│   ├── infrastructure/
│   └── design-system/
├── backend/
│   ├── upload/
│   ├── migrations/
│   └── functions/
├── powersync/
│   ├── sync-config.yaml
│   └── README.md
├── deployment/
│   ├── vercel/
│   ├── oracle/
│   │   ├── docker-compose.yml
│   │   └── README.md
│   └── environments/
├── docs/
│   ├── product/
│   ├── architecture/
│   ├── domain/
│   ├── decisions/
│   ├── deployment/
│   └── testing/
├── tests/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

The web app manifest is generated at build time from the PWA configuration in `vite.config.ts`, so the theme colour, name and icons are defined once. There is no hand-written `manifest.webmanifest` in `public/`.

Keep Oracle deployment files separate from the application. The PWA must not need to know whether PowerSync is hosted or self-hosted.

---

## 17. Environment and deployment boundaries

### 17.1 Environments

| Environment | Purpose |
|---|---|
| Local development | Local PWA, local/test database and sync service |
| Development cloud | Integration testing with hosted services |
| Staging | Production-like end-to-end testing |
| Production | User data and production sync |

Use separate Supabase projects and PowerSync instances/configurations for development, staging, and production where practical.

### 17.2 Environment variables

Client-side configuration may include:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_POWERSYNC_URL
```

These are public client configuration values, not secrets.

Server-side configuration may include:

```text
SUPABASE_SERVICE_ROLE_KEY
POWERSYNC_DATABASE_URL
POWERSYNC_DATABASE_PASSWORD
POWERSYNC_ADMIN_TOKEN
```

Never expose server-side variables through Vite's `VITE_` prefix.

### 17.3 Vercel

Vercel is responsible for:

- Hosting the compiled PWA.
- HTTPS.
- Static asset delivery.
- SPA routing fallback.
- Environment-specific client configuration.
- PWA asset deployment.

It is not responsible for maintaining the user's local data or running the sync engine.

### 17.4 Supabase

Supabase is responsible for:

- PostgreSQL.
- Authentication.
- RLS.
- Database migrations.
- Initial upload API integration.
- Optional attachment storage.

Keep business rules in application/domain code and the controlled upload boundary, not scattered across frontend components.

### 17.5 PowerSync Cloud

PowerSync Cloud is responsible for:

- PostgreSQL replication.
- Sync Streams.
- Client synchronization.
- Sync checkpoints and upload queue coordination.

Maintain the sync configuration in version control and document how it is deployed.

### 17.6 Oracle Cloud

Oracle is an optional infrastructure target.

Initial use cases:

- Self-hosted PowerSync evaluation.
- API hosting experiments.
- Background workers.
- Scheduled jobs.
- Monitoring and diagnostics.

Do not run production-critical services on Oracle until health checks, backups, monitoring, recovery, resource limits, and deployment automation are in place.

---

## 18. Migration path: managed to self-hosted

The migration should not change the application domain or UI.

### Phase A — Managed-first

- Vercel PWA.
- Supabase PostgreSQL and Auth.
- PowerSync Cloud.
- PowerSync Web SDK.
- SQLite WASM on each client.

### Phase B — Self-hosting preparation

- Maintain PowerSync configuration in source control.
- Document database replication requirements.
- Keep deployment manifests separate from application code.
- Validate ARM64 images.
- Create a repeatable deployment process.
- Test a separate self-hosted environment with non-production data.

### Phase C — Oracle deployment evaluation

- Provision Oracle ARM.
- Deploy PowerSync Service.
- Provision its required supporting sync-storage component.
- Connect it to the existing PostgreSQL environment.
- Configure TLS, firewall rules, secrets, monitoring, and backups.
- Run multi-client synchronization tests.
- Measure memory, CPU, latency, and recovery behaviour.

### Phase D — Controlled migration

- Export and validate current sync configuration.
- Deploy the self-hosted environment.
- Validate Sync Streams and authentication.
- Test uploads, downloads, and offline recovery.
- Switch staging clients first.
- Verify data consistency.
- Switch production only after successful validation.
- Keep a documented rollback path.

Do not run two independent sync services against production clients without an explicit migration and checkpoint strategy.

---

## 19. Quality requirements

### Performance

- Fast initial application load.
- Dashboard queries should remain responsive with large histories.
- Avoid loading entire tables into React state.
- Use indexed queries and bounded history views.
- Avoid unnecessary full-table reactivity.

### Reliability

- Offline writes must survive normal refreshes and browser restarts.
- Upload retries must be idempotent.
- Failed sync must not corrupt local data.
- Schedule generation must be deterministic and idempotent.
- Backup restore must validate integrity.

### Accessibility

- Keyboard navigation.
- Screen-reader-friendly controls.
- Appropriate contrast.
- Clear focus indicators.
- Responsive layouts.

### Privacy

- Minimize personal data collection.
- Do not leak records across accounts.
- Make local and cloud data boundaries understandable.
- Support complete export and account deletion.

---

## 20. Testing strategy

### Unit tests

- Domain invariants.
- Scheduling calculations.
- Date and timezone logic.
- Activity completion.
- Conflict policies.
- Gamification calculations *(deferred with §12)*.

### Integration tests

- PowerSync local database writes.
- Upload implementation.
- PostgreSQL persistence.
- RLS enforcement.
- Sync Stream ownership filtering.
- Duplicate upload handling.
- Offline-to-online recovery.
- Schema migrations.

### End-to-end tests

- Create activity offline.
- Complete activity offline.
- Restart browser.
- Reconnect and synchronize.
- Verify changes on a second device.
- Edit conflicting schedules on two devices.
- Export and restore user data.
- Upgrade the PWA while local data exists.

### Browser tests

Test supported versions of Chromium, Firefox, and Safari where practical, with particular attention to SQLite WASM persistence, worker behaviour, multiple tabs, and storage restrictions.

### Infrastructure tests

- PowerSync Cloud connection failure.
- PostgreSQL connection failure.
- Upload API failure.
- PowerSync restart.
- Supporting storage restart.
- Oracle instance restart.
- Backup and restore of self-hosted infrastructure.
- ARM64 image compatibility.

---

## 21. MVP acceptance criteria

The first release is acceptable when:

1. All five product modules are usable.
2. Users can create and manage activities and assets.
3. Calendar-based and completion-based scheduling works.
4. Usage-based scheduling is supported.
5. Occurrence generation is bounded and idempotent.
6. Completion history and measurements are preserved.
7. The app works offline after installation and initial setup.
8. *(Phase 2: sync)* Local writes are queued and synchronize after reconnection.
9. *(Phase 2: sync)* A second device receives synchronized changes.
10. *(Phase 2: sync)* Ownership and RLS boundaries are tested.
11. Users can export and restore their data.
12. Occurrence outcomes and completion history are recorded faithfully so gamification can be added later without migration (gamification itself is deferred, see §12).
13. Sync state is visible and understandable.
14. The PWA can be deployed to Vercel.
15. *(Phase 2: sync)* The PowerSync deployment can be switched by configuration without changing feature code.

---

## 22. Implementation backlog

### Epic 0 — Engineering foundation

- Create pnpm workspace.
- Configure TypeScript strict mode.
- Set up Vite and React.
- Add linting, formatting, and tests.
- Establish module boundaries.
- Create initial design system.

### Epic 1 — Domain foundation

- Define core entities and value objects.
- Implement IDs and timestamps.
- Define repository contracts.
- Define validation and error conventions.
- Implement domain unit tests.

### Epic 2 — Local database and synchronization foundation

- Integrate PowerSync Web SDK.
- Configure SQLite WASM persistence.
- Implement database initialization and migrations.
- Implement authentication integration. *(Phase 2)*
- Configure development PostgreSQL. *(Phase 2)*
- Configure PowerSync replication. *(Phase 2)*
- Define initial Sync Streams. *(Phase 2)*
- Implement upload handler. *(Phase 2)*
- Implement sync status indicators.
- Test offline writes and reconnect behaviour. *(offline persistence is Phase 1; reconnect is Phase 2)*

Phase 1 scope for this epic: PowerSync Web SDK in local-only mode, SQLite WASM persistence, schema and local migrations, repository implementations, and storage-failure handling.

### Epic 3 — Activities

- Activity CRUD.
- Categories and locations.
- Activity forms.
- Checklist support.
- Activity filtering and search.

### Epic 4 — Scheduling

- Calendar schedules.
- Completion intervals.
- Fixed intervals.
- Usage-based schedules.
- Occurrence generation.
- Snooze, skip, pause, and resume.
- Timezone and DST tests.

### Epic 5 — Household upkeep

- Rooms and locations.
- Cleaning activities.
- Household checklists.
- Household dashboard views.

### Epic 6 — Assets and maintenance

- Asset inventory.
- Maintenance history.
- Measurements.
- Usage tracking.
- Warranty reminders.
- Maintenance costs.

### Epic 7 — Digital upkeep and routines

- Subscription tracking.
- Domain and hosting renewals.
- Digital security reviews.
- Personal routines.
- Administrative activities.

### Epic 8 — Notifications

- In-app reminders.
- Browser notification permissions.
- Due-date reconciliation.
- Optional Web Push evaluation.

### Epic 9 — History and insights

- Completion history.
- Measurement history.
- Cost summaries.
- Upcoming maintenance overview.
- Activity trends.

### Epic 10 — Gamification *(deferred — post-first-release)*

Not scheduled for the first release. Resolve the open questions in §12.3 before starting.

- XP transactions.
- Levels.
- Streaks.
- Achievements.
- Progress indicators.

### Epic 11 — Backup and restore

- Versioned export.
- Import preview.
- Merge and replace.
- Attachment handling.
- Integrity validation.

### Epic 12 — Deployment hardening

- Vercel deployment.
- Supabase production configuration.
- PowerSync Cloud production configuration.
- Monitoring and error reporting.
- Security review.
- Browser compatibility review.
- Oracle ARM self-hosted proof of concept.

---

## 23. Architecture decision records

| ADR | Decision |
|---|---|
| ADR-001 | React + TypeScript |
| ADR-002 | Vite-based PWA |
| ADR-003 | Modular monolith |
| ADR-004 | PowerSync Web SDK for local-first persistence and sync |
| ADR-005 | SQLite WASM as the client database |
| ADR-006 | PostgreSQL as the central synchronized database |
| ADR-007 | Supabase as the initial PostgreSQL and authentication provider |
| ADR-008 | PowerSync Cloud as the initial sync service |
| ADR-009 | Provider-neutral upload and repository interfaces |
| ADR-010 | Version-aware and append-only conflict policies |
| ADR-011 | Backup independent of synchronization |
| ADR-012 | Vercel for initial static hosting |
| ADR-013 | Oracle ARM as an optional self-hosting target |
| ADR-014 | Gamification isolated from scheduling |
| ADR-016 | Gamification (XP, levels, streaks, achievements) deferred past the first release; build the basic app first |
| ADR-017 | Build fully offline first: PowerSync Web SDK in local-only mode; Supabase, authentication, and sync are Phase 2 |
| ADR-015 | No separate Dexie application database |
| ADR-019 | Reminders are computed on demand and delivered at most once per due date; browser notifications are an opt-in per-device channel; no background delivery before Web Push |
| ADR-018 | Completions stay append-only; mistakes are fixed by voiding (undo) or by a corrected replacement (edit), recorded in `completion_voids` |

---

## 24. Definition of Done

A feature is complete when:

- Domain rules are implemented and tested.
- Application workflows are independent of UI components.
- Persistence uses the defined repository boundary.
- Offline behaviour is understood and tested.
- Sync behaviour is tested where the feature uses synchronized data.
- Ownership and authorization are enforced.
- Loading, empty, error, and offline states are implemented.
- Accessibility requirements are met.
- Documentation is updated.
- No secrets are exposed in client code.
- Existing user data remains safe across upgrades.

---

## 25. Final architectural position

Tend is a **local-first PWA with optional cloud synchronization**, not a cloud application with an offline cache.

The device provides immediate persistence and responsiveness through SQLite WASM. PostgreSQL provides the cross-device data store. PowerSync coordinates replication and upload delivery. The application retains ownership of its domain rules, validation, conflict policies, backup, and user experience.

The first deployment uses Vercel, Supabase, and PowerSync Cloud. Oracle ARM remains a deliberately optional self-hosting destination.

This architecture prioritizes product development now without closing off infrastructure ownership later.