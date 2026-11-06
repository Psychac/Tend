# Tend

Tend keeps track of the upkeep that your home, vehicles, belongings and digital life need:
recurring chores, maintenance, renewals and reviews, with reminders and a history of what was
done. It is an installable web app (PWA) that works offline.

**Phase 1 is fully offline.** Everything is stored on the device, in the browser. There are no
accounts and no server. Sync, sign-in and a backend are Phase 2 (see the spec, §3.5).

## Documents

| File                                                       | What it is                                                        |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| [docs/Tend.md](docs/Tend.md)                               | The product and engineering specification                         |
| [docs/GAPS.md](docs/GAPS.md)                               | Where the implementation differs from the spec, and what was done |
| [docs/DESIGN.md](docs/DESIGN.md)                           | The UI and UX design spec                                         |
| [docs/decisions/](docs/decisions/README.md)                | Architecture decisions                                            |
| [deployment/vercel/README.md](deployment/vercel/README.md) | Deploying the static app                                          |

## Requirements

- Node.js 22 or newer
- pnpm 12 (the version is pinned by `packageManager` in `package.json`; `corepack enable` will
  pick it up)

## Getting started

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

Open the app, add an activity, and reload: it is still there, because it lives in your browser.

## Everyday commands

Run these from the repository root.

| Command          | What it does                                                        |
| ---------------- | ------------------------------------------------------------------- |
| `pnpm dev`       | Start the app with hot reload                                       |
| `pnpm test`      | Unit and component tests in every package (Vitest)                  |
| `pnpm typecheck` | TypeScript checks in every package                                  |
| `pnpm lint`      | ESLint                                                              |
| `pnpm format`    | Format everything with Prettier (`pnpm format:check` only checks)   |
| `pnpm build`     | Type-check and build every package; the app goes to `apps/web/dist` |

Before sending a change, run `pnpm lint`, `pnpm typecheck` and `pnpm test`.

### End-to-end tests

The Playwright suite in `apps/web/e2e` drives a real browser against a production build
(`vite preview` on port 4173).

```bash
pnpm --filter @tend/web exec playwright install chromium-headless-shell   # once
pnpm --filter @tend/web test:e2e
```

Set `PW_CHANNEL` (for example `chrome` or `msedge`) to use a browser you already have installed.
The suite covers things unit tests cannot, such as working offline, two tabs open at once,
backup and restore, reminders and attachments.

## How the code is organised

A pnpm workspace with four packages and one app. Dependencies point inward: the domain knows
nothing about the rest.

```
apps/web                  React app: screens, routing, layout, browser adapters
packages/application      Use cases: create, complete, schedule, back up, alerts, presets
packages/domain           Entities, scheduling rules and invariants. Pure TypeScript
packages/contracts        Interfaces the application needs: repositories, unit of work, storage
packages/infrastructure   The adapters: SQLite through PowerSync, backup files, migrations
```

- **domain** has no dependencies. It holds the entities (activity, schedule, occurrence,
  completion, asset, measurement) and the scheduling strategies: calendar, fixed interval,
  after completion, by usage, after another activity, and when a reading crosses a limit.
- **application** holds one function per thing a person can do. Each runs in a single
  transaction, so it applies fully or not at all. Screens call these, never the database.
- **contracts** are the interfaces between them, so the database could be swapped without
  touching a use case.
- **infrastructure** implements the contracts on the on-device database, and owns the table
  schema, versioned local migrations and the backup format.
- **apps/web** is the presentation layer. `features/` has one folder per area (activities,
  assets, dashboard, history, insights, calendar, reminders, settings). `shared/` holds hooks,
  pickers and browser adapters.

Each package has its own tests next to the code. Test helpers that build an in-memory database
live in each package's `testing/` folder.

## Things worth knowing

- **Data lives in the browser.** Clearing site data or losing the device loses it. Settings has
  backup and restore (JSON, or a zip with attached files). Backups and local data are **not
  encrypted** ([ADR 0002](docs/decisions/0002-local-data-protection.md)).
- **Reminders are computed on demand**, when the app is open or comes back into view. Nothing
  runs in the background before Web Push exists (ADR-019).
- **Local schema changes** are additive where possible. Anything that needs code goes in
  `packages/infrastructure/src/migrations.ts`
  ([ADR 0001](docs/decisions/0001-local-schema-migrations.md)). Backups carry their own format
  version.
- **No secrets in the app.** It tells people not to store passwords, authentication secrets or
  recovery codes, and the client holds no server credentials.
- **Errors stay on the device.** Settings → Diagnostics shows recent errors and a report you can
  copy. Nothing is sent anywhere.

## Deploying

Tend is a static site. [deployment/vercel/README.md](deployment/vercel/README.md) covers the
Vercel setup. There is no continuous integration yet; see G-06 in the gap list.
