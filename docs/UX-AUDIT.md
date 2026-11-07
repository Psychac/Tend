# Tend — User Experience Audit

Found by running the app in headless Chromium (desktop 1280px and phone 390px) on 7 November 2026, at commit `17d5039`,
Creating activities, completing one and visiting every screen. This is separate from [GAPS.md](GAPS.md), which tracks conformance to [Tend.md](Tend.md); items here are about what a person experiences.

**Size:** S ≈ under a day · M ≈ 1–3 days · L ≈ a week or more.

## Problems (broken or misleading)

| ID   | Problem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Size | Status |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ------ |
| U-01 | **A "Does not repeat" activity can never be completed.** It is the form's default; the activity lists as "One-off" but never reaches the Dashboard or Calendar. **Part A (done):** a "Log done" button on every activity, with a date (not in the future), notes, cost, checklist and readings; if something is already due it offers to count the entry for that item. Logged work does not count towards "done on time", leaves calendar and usage schedules alone, restarts "after I complete it" schedules, and can trigger follow-up activities. **Part B (done):** "Does not repeat" has an optional "Due on" date, which creates one dated item. With no date the activity is "Planned, no date" on the Activities list, with a "Set date" button ("Change date" once it has one). Planned items stay off the Dashboard until given a date. Known limit: reminders are still only for repeating activities. | M    | Fixed  |
| U-02 | **A stray character in the sync note.** The Dashboard reads "Saved on this device � Sync is not enabled…". A literal U+FFFD sits in `SyncIndicator.tsx` where a separator should be.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | S    | Fixed  |
| U-03 | **Mobile navigation hides half the app.** Ten tabs scroll in a bottom bar and about five are visible, with no hint. Insights, History, Calendar and Settings (where Backup lives) are off-screen. Fix: a "More" tab or a reduced primary set. The phone bar now has Dashboard, Activities, Calendar, History and a **More** menu holding Household, Routines, Digital, Assets, Insights and Settings. It closes when you pick a page or press Escape. Desktop sidebar unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                   | M    | Fixed  |
| U-04 | **The Dashboard repeats one activity.** A weekly chore shows as three cards (this week and the next two) with nothing marking them as the same task. Fix: show the next occurrence once, with "+2 later". Each activity now shows once: its nearest item, with "· N more coming up". If something is already due, later items fold into it. Overdue items are all still listed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | M    | Fixed  |
| U-05 | **Dashboard stat tiles are `aria-hidden`,** so screen readers never hear the Overdue / Due today / Coming up counts (`DashboardPage.tsx`, `Stat`). Now a description list (term, then count), so the counts are read out. Looks the same.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | S    | Fixed  |

## Lacking

- ~~**Onboarding.**~~ **Fixed.** An empty Dashboard now asks "What do you want to keep up?" with six starting points (home, subscriptions, health, documents, car or appliances, backups) that open ready-made forms.
- ~~**A long first form.**~~ **Fixed.** New activity shows name, repeat, date and reminder; the rest sits under "More options" (open when editing or starting from a preset).
- ~~**Five buttons per Dashboard card.**~~ **Fixed.** Cards show Done, Details, Snooze and More. More holds Skip and Cancel, each with a one-line explanation.
- ~~**Snooze is fixed at one day.**~~ **Fixed.** Tomorrow, in 3 days, next week, or a picked date.
- ~~**Nothing can be deleted.**~~ **Fixed.** A never-done activity, or an unused asset, can be deleted after a confirmation. Anything with history can only be archived (assets: retired), with the reason shown.
- ~~**No visible change log.**~~ **Fixed.** Settings has a read-only "Recent changes" list (last 30). Snoozing, moving an item and recording a reading are now recorded too. The automatic reconcile is not, because a person did not do it (GAPS G-28 can be closed).
- **Notifications only fire while the app is open.** Web Push is Phase 2 (GAPS G-33).
- ~~**No app-wide search.**~~ **Fixed.** A Search page finds activities (including archived), assets and the notes written when work was done.
- **Dates:** ~~no year~~ the year now shows when it is not this year. Still open: the date field's own format follows the browser, and the Calendar week always starts on Monday.
- ~~**Insights with little data**~~ **Fixed.** "No costs recorded in this period" replaces "Total: none". (The page already had an empty state when nothing is done.)
- ~~**Inconsistent page headings.**~~ **Fixed.** Every page title is the same size.
- ~~**Sync status appears twice** on the mobile Dashboard.~~ **Fixed.** The header copy is hidden on the Dashboard.
- ~~**Version is `0.0.0`**~~ **Fixed.** The web app is `0.1.0`; bump it when releasing.

## Ideas

1. "Log done" per activity, including backdating (U-01).
2. A first-run picker ("What do you want to keep up? Home, car, subscriptions…") feeding the presets.
3. A "Today" view that lists each activity once.
4. Snooze choices: tomorrow, next week, pick a date.
5. ~~A "Back up your data" reminder.~~ **Done.** The Dashboard asks for a first backup once there is data, and again after 30 days; "Remind me later" puts it off for a week. A hint kept on this device only.
6. ~~CSV export of history and spending.~~ **Done.** Settings → "Export history (.csv)": date, activity, what happened, planned date, cost, currency and notes. Not a backup; cells that look like formulas are defused.
7. An install prompt and an offline-ready indicator.

## Still open

- An install prompt and an "ready offline" indicator (idea 7).
- The Calendar week always starts on Monday, and the date field's format follows the browser. Both want a setting.
- Notifications only fire while the app is open (Phase 2, GAPS G-33).
- Reminders cannot be set on a one-off with a due date.
- Logging a usage-schedule service does not reset the open usage item.

## Not checked

Real preview deploy (G-05); Firefox, WebKit, Android and iOS (G-21); reminder delivery (headless Chromium refuses notification permission; the e2e suite stubs it); large-data behaviour (G-22); keyboard-only use and contrast ratios (judged by eye only); asset and readings screens with data.

## Suggested order

1. U-02, U-05 (small).
2. U-01, U-03 (most value).
3. U-04, then simplifying the Dashboard card and the activity form.
