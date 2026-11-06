# Deploying Tend to Vercel

Tend is a static PWA. Vercel hosts the built files over HTTPS; it never holds user data (that
lives on each device) and runs no server code in Phase 1.

The config is the repository-root [`vercel.json`](../../vercel.json) (Vercel only reads it from
the project root, so it cannot live in this folder).

## One-time setup

1. Import the repository in Vercel. Leave **Root Directory** as the repo root and the framework
   preset as "Other"; `vercel.json` sets the install command, build command and output directory.
2. No environment variables are needed in Phase 1. Later phases add only `VITE_`-prefixed,
   public values (see spec 17.2); never expose a server secret that way.
3. Deploy. Every push gets a preview URL; the production branch gets the production URL.

## What the config does

| Concern                                   | Setting                                                                                               | Why                                                                                                                                                                                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deep links (`/calendar`, `/activities/…`) | Rewrite everything except `/assets/` to `index.html`                                                  | The router is client-side. `/assets/` is excluded so a stale hashed file returns 404, not HTML that the browser would try to run as JavaScript.                                                                                                                                    |
| Hashed build files                        | `/assets/*` cached for a year, `immutable`                                                            | File names change whenever content does.                                                                                                                                                                                                                                           |
| Update detection                          | `sw.js`, `workbox-*.js`, `index.html`, `manifest.webmanifest`, `notification-click.js` are `no-cache` | The browser must re-check these on every visit to notice a new version; an update is then offered by the in-app "A new version is ready" banner and never applied mid-edit.                                                                                                        |
| WASM                                      | No special headers                                                                                    | The on-device database works without cross-origin isolation (COOP/COEP) in the default SDK mode, so none are set. Do not add them: they would break embedded third-party content for no benefit. Verified by the end-to-end suite, which runs against `vite preview` without them. |

## Checking a preview deployment

1. Open the preview URL, add an activity, and reload: it is still there.
2. Wait a few seconds, then switch the browser to offline (DevTools → Network → Offline) and
   reload: the app starts and your data is intact.
3. Deploy a new commit. Visit the preview again online: the "A new version is ready" banner
   appears; choose **Reload to update**, and your data is intact.
4. Open `/calendar` directly in a new tab: it loads (rewrite works).
5. In DevTools → Network, confirm `sw.js` is revalidated and `/assets/*` comes from cache.

The same checks run locally in `tests/e2e` (`pnpm test:e2e`), and
`apps/web/src/deployment.test.ts` guards the config.
