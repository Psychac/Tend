# Tend — User Experience Audit

Found by running the app in headless Chromium (desktop 1280px and phone 390px) on 7 November 2026, at commit `17d5039`,
Creating activities, completing one and visiting every screen. This is separate from [GAPS.md](GAPS.md), which tracks conformance to [Tend.md](Tend.md); items here are about what a person experiences.

**Size:** S ≈ under a day · M ≈ 1–3 days · L ≈ a week or more.

## Problems (broken or misleading)

| ID   | Problem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Size | Status      |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------- |
| U-01 | **A "Does not repeat" activity can never be completed.** It is the form's default; the activity lists as "One-off" but never reaches the Dashboard or Calendar. **Part A (done):** a "Log done" button on every activity, with a date (not in the future), notes, cost, checklist and readings; if something is already due it offers to count the entry for that item. Logged work does not count towards "done on time", leaves calendar and usage schedules alone, restarts "after I complete it" schedules, and can trigger follow-up activities. **Part B (open):** a due date for a one-off, and a "Planned, no date" state with a "Set date" action for activities that have none yet. | M    | Part A done |
| U-02 | **A stray character in the sync note.** The Dashboard reads "Saved on this device � Sync is not enabled…". A literal U+FFFD sits in `SyncIndicator.tsx` where a separator should be.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | S    | Fixed       |
| U-03 | **Mobile navigation hides half the app.** Ten tabs scroll in a bottom bar and about five are visible, with no hint. Insights, History, Calendar and Settings (where Backup lives) are off-screen. Fix: a "More" tab or a reduced primary set.                                                                                                                                                                                                                                                                                                                                                                                                                                                 | M    | Open        |
| U-04 | **The Dashboard repeats one activity.** A weekly chore shows as three cards (this week and the next two) with nothing marking them as the same task. Fix: show the next occurrence once, with "+2 later".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | M    | Open        |
| U-05 | **Dashboard stat tiles are `aria-hidden`,** so screen readers never hear the Overdue / Due today / Coming up counts (`DashboardPage.tsx`, `Stat`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | S    | Open        |

## Lacking

- **Onboarding.** A new user gets an empty Dashboard and one sentence. The presets (Household, Digital, Routines) are the best way in but sit three items down the nav.
- **A long first form.** New activity shows type, priority, category, place, asset, repeat, reminder, checklist and readings at once. A presets-first or simple/advanced flow would shorten it.
- **Five buttons per Dashboard card** (Done, Details, Snooze a day, Skip, Cancel). Skip and Cancel are hard to tell apart.
- **Snooze is fixed at one day.** No "next week" or "pick a date".
- **Nothing can be deleted.** Activities can only be archived; assets have no delete (GAPS G-07).
- **No visible change log.** Audit events are written and never shown (GAPS G-28).
- **Notifications only fire while the app is open.** Web Push is Phase 2 (GAPS G-33).
- **No app-wide search,** only per-list filters.
- **Dates:** the Dashboard shows "Sat 7 Nov" with no year, while the date field shows "07-11-2026". The Calendar week always starts on Monday.
- **Insights with little data** shows "Total: none" and a one-bar chart. It needs a clearer empty state.
- **Inconsistent page headings.** Household is visibly smaller than Activities and Insights.
- **Sync status appears twice** on the mobile Dashboard (header and page).
- **Version is `0.0.0`** (GAPS G-23).

## Ideas

1. "Log done" per activity, including backdating (U-01).
2. A one-off with a due date.
3. A first-run picker ("What do you want to keep up? Home, car, subscriptions…") feeding the presets.
4. A "Today" view that lists each activity once.
5. Snooze choices: tomorrow, next week, pick a date.
6. A recurring "Back up your data" reminder, using the existing preset machinery.
7. CSV export of history and spending.
8. An install prompt and an offline-ready indicator.

## Not checked

Real preview deploy (G-05); Firefox, WebKit, Android and iOS (G-21); reminder delivery (headless Chromium refuses notification permission; the e2e suite stubs it); large-data behaviour (G-22); keyboard-only use and contrast ratios (judged by eye only); asset and readings screens with data.

## Suggested order

1. U-02, U-05 (small).
2. U-01, U-03 (most value).
3. U-04, then simplifying the Dashboard card and the activity form.
