# Premium UI/UX Spec — From AI-Generated to Hand-Crafted

Nov 6, 2026 · @Aniket

## 0. How to use this spec

You are the design engineer on this app. Your job is to make every screen feel like it was designed by one obsessive person over months, not assembled from defaults in an afternoon.

**The benchmark is quality, not appearance.** First-party Apple apps (Weather, Wallet, Photos, Fitness) and the best indie apps (Things 3, Flighty, Linear, Arc, Halide) set the bar for smoothness, responsiveness, physics, consistency, restraint and attention to detail. Match that bar. Do **not** copy their look. This app must have its own visual identity: its own typography, color world, shape language, iconography and motion personality (Section 2, Identity). An app that looks like a reskinned iOS Settings screen fails this spec just as much as one that looks AI-generated.

Where this spec gives concrete values (font sizes, colors, radii, spring numbers), treat them as calibrated defaults and as the quality floor, not as the target look. Keep the structure and the discipline; tune the values to the identity.

**Non-negotiables**

1. Read the whole spec before touching code. Then audit the app against Section 1 and Section 13 and write down every violation before fixing anything.
2. Build tokens first (Section 3), then components (Section 7), then screens. Never style a screen with raw values. If a value is not a token, it does not ship.
3. Every animation must answer "what does this tell the user?" If it tells them nothing, remove it (Section 5).
4. Every interactive element must respond within one frame of touch-down, not on release (Section 6).
5. Every screen must have designed empty, loading, error and success states (Section 8). A blank screen or a raw spinner is a bug.
6. Test on a real device, in light and dark mode, at the smallest and largest text size, with Reduce Motion on. Simulator-only work is not done.
7. Do less, better. Removing a decorative element is almost always an improvement. Restraint is the premium signal.

**Order of work**

1. Audit: screenshot every screen and state; list every AI-generated tell (Section 1).
2. Foundations: implement the token file (type, color, spacing, radius, elevation, motion).
3. Components: rebuild primitives to spec (Section 7), with all states.
4. Screens: re-compose each screen from components, one at a time, highest-traffic first.
5. Motion and haptics pass: add transitions and feedback across the whole app at once so they feel like one system.
6. Polish pass: run the Section 13 checklist on every screen. Fix, re-run, repeat.

Platform _behavior_ is not negotiable: back gestures, safe areas, scrolling physics, text input, accessibility and system settings must work the way users expect on their device. Platform _appearance_ is optional: the visuals are yours to design, as long as they meet every quality rule here. Familiar behavior plus a distinctive look is the goal.

## 1. Diagnosis: why apps look AI-generated

AI-generated UI looks the same because it takes the median default at every decision. Each row below is a tell to hunt down and its replacement.

| Tell                                                                                                                         | Why it reads as cheap                                                           | Replace with                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Purple-to-blue gradients, glowing blobs, gradient text                                                                       | The default "modern" look of 2023 templates                                     | One confident brand color on neutral surfaces; gradients only if they mean something (e.g. a sky, a progress fill) |
| Every element in a rounded card with a drop shadow                                                                           | No hierarchy; everything shouts equally                                         | Grouped lists and whitespace; cards only for things that are genuinely objects (a ticket, a photo, a workout)      |
| Inter / system font at 3 sizes, all medium weight                                                                            | No typographic voice or rhythm                                                  | A defined type scale with clear weight contrast (Section 3.1), tight tracking on large titles                      |
| Emoji or generic Lucide icons as decoration                                                                                  | Filler, not meaning                                                             | A single icon family, one stroke weight, used only where an icon is faster than a word                             |
| Centered hero text + 3 feature cards + CTA                                                                                   | Landing-page template inside an app                                             | Content-first screens: the user's data is the hero                                                                 |
| Fade-in on everything, 300 ms ease-in-out                                                                                    | Animation as decoration; feels sluggish                                         | Spring physics, interruptible, tied to user input (Section 5)                                                      |
| Buttons that only change on release                                                                                          | Feels dead and laggy                                                            | Instant press state on touch-down: scale, dim, haptic                                                              |
| Spinners for every load                                                                                                      | Exposes the machine                                                             | Skeletons shaped like the real content, optimistic updates, cached first paint                                     |
| "Oops! Something went wrong 😢"                                                                                              | Cute instead of useful                                                          | Plain cause + one action: "Couldn't sync. Check your connection. \[Retry\]"                                        |
| Inconsistent padding (12 here, 15 there, 20 elsewhere)                                                                       | The eye notices misalignment even when the brain doesn't                        | 4-pt grid, spacing tokens only, one horizontal margin per screen class                                             |
| Borders AND shadows AND backgrounds on the same element                                                                      | Three ways of saying "this is separate"                                         | Pick one separation method per surface                                                                             |
| Pure black #000 text on pure white, or pure gray dark mode                                                                   | Harsh contrast, flat dark mode                                                  | Tinted neutrals; layered dark-mode elevations                                                                      |
| Modal dialogs for everything                                                                                                 | Interrupts flow                                                                 | Inline edits, sheets with detents, undo instead of "Are you sure?"                                                 |
| Placeholder copy ("Welcome to your dashboard!")                                                                              | No one wrote it                                                                 | Specific, useful text written for this product (Section 9)                                                         |
| Tab bar with 5 tabs, half rarely used                                                                                        | No editorial decision                                                           | 3–4 tabs max; the rest lives one level down                                                                        |
| Looks like a stock iOS app: system blue, gray grouped lists everywhere, default SF Symbols, large-title bars on every screen | Copying the platform's look is another kind of default; it has no point of view | Keep the platform's behavior, design your own look (Section 2, Identity)                                           |

## 2. Design principles and identity

When this spec doesn't cover a case, decide with these, in this order.

1. **Content is the interface.** Chrome (bars, borders, backgrounds, labels) should recede so the user's data stands forward. If you can remove a container and the layout still reads, remove it.
2. **Direct and physical.** Things move the way objects do: they have mass, they follow your finger, they can be thrown and caught mid-flight. Nothing teleports unless it is instant feedback.
3. **Every motion has a cause.** Animation shows where something came from, where it went, or what changed. No idle bouncing, no entrance animations on every scroll.
4. **Respond instantly, finish gracefully.** Feedback starts in under 16 ms; the full transition can take 300–500 ms because the user already knows it worked.
5. **Hierarchy through restraint.** One primary action per screen. One accent color. Emphasis comes from size, weight and space before color.
6. **Forgiving.** Undo beats confirmation. Swipes can be cancelled halfway. Destructive actions are reversible for at least a few seconds.
7. **Consistent to the pixel.** Same thing, same look, same motion, everywhere. Inconsistency is the fastest way to look unfinished.
8. **Detail where hands and eyes land.** Spend polish budget on the moments users repeat daily: the main list, the primary button, the pull-to-refresh, the completion moment. A delightful finish on a daily action beats an elaborate onboarding.

### Identity: borrow the craft, not the look

The best apps feel premium because of how they behave and how carefully they are made, not because they look like Apple. Things 3, Flighty, Linear, Arc and Airbnb all reach first-party quality with looks that are unmistakably their own.

| Take from first-party apps                                     | Do not copy                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| Instant touch response, spring physics, interruptible gestures | System blue as the accent                                    |
| Spatial continuity between screens                             | Gray inset grouped lists as the default for every screen     |
| Typographic rigor: a clear scale, tight hierarchy              | SF Pro at system sizes with no thought behind it             |
| Restraint: one accent, one primary action                      | Unstyled SF Symbols dropped in everywhere                    |
| Designed empty, loading and error states                       | Large-title nav bars and Settings-style rows on every screen |
| Haptics, accessibility, performance discipline                 | Apple's specific screens, layouts or illustrations           |

**Before building any screen, write a one-page art direction brief and get it approved:**

1. **Personality:** 3–5 adjectives the app should feel like (e.g. calm, precise, warm, editorial, playful). Every visual and motion choice is checked against these.
2. **References from outside app-land:** print and editorial design, architecture, industrial design, signage, film titles, fashion, the product's own physical world. Screenshots of other apps are the weakest references; they lead to copies.
3. **Signature elements (pick 2–3, apply them everywhere):**
   - A typeface pairing with character (a distinctive display face for headlines and numbers, a highly legible text face)
   - A color world beyond one accent: a tinted neutral family, a signature background tone, a deliberate dark mode
   - A shape language: soft squircles, crisp near-square corners, pills, or a recurring geometric motif. One, consistently
   - A custom or customized icon set drawn to match the typeface's stroke
   - Texture or material: paper grain, subtle noise, glass, flat ink. One, used with restraint
   - A motion personality: crisp and mechanical, soft and fluid, or springy and playful (tune the Section 5 springs to it)
4. **One or two signature moments:** the interactions people will remember and screenshot, placed on the app's most repeated or most meaningful action (e.g. completing a task, finishing a workout, sending money).

**Distinctiveness test:** hide the logo and app name. If a screenshot could belong to any app, or looks like a system app, it is not done. **Usability guardrail:** novelty never overrides clarity. Controls must still look tappable, navigation must still be predictable, and standard gestures must still work.

## 3. Foundations (tokens)

All values live in one token file and are the only values components may use. The structure is mandatory: a defined type scale, semantic color roles, a spacing grid, radius, elevation and motion tokens. The specific values below are calibrated defaults; replace them with the identity from Section 2 while keeping the same rigor. Numbers are in points (pt on iOS, dp on Android, px at 1x on web).

### 3.1 Typography

Typography is the single biggest lever for identity. Choose typefaces deliberately: a display face with character for large titles, hero numbers and key moments, paired with a highly legible text face for everything else (they can be the same family). Good starting points include quality commercial or open faces (e.g. from Klim, Grilli Type, Commercial Type, or Google Fonts' better families). The system font is allowed only as a conscious choice that fits the brief, never as a default. Never more than two families. The sizes below are a proven scale; adjust them to the chosen faces' x-height and personality, but keep the number of steps and the contrast between them.

| Token      | Size / line height | Weight         | Tracking            | Use                                      |
| ---------- | ------------------ | -------------- | ------------------- | ---------------------------------------- |
| largeTitle | 34 / 41            | Bold (700)     | +0.4 (iOS) or −0.5% | Top of root screens, collapses on scroll |
| title1     | 28 / 34            | Bold           | −0.4%               | Screen hero numbers, detail titles       |
| title2     | 22 / 28            | Bold           | −0.3%               | Section heroes                           |
| title3     | 20 / 25            | Semibold (600) | −0.2%               | Card titles                              |
| headline   | 17 / 22            | Semibold       | −0.4%               | List row titles, emphasized body         |
| body       | 17 / 22            | Regular (400)  | −0.4%               | Default text                             |
| callout    | 16 / 21            | Regular        | −0.3%               | Secondary body                           |
| subhead    | 15 / 20            | Regular        | −0.2%               | Row subtitles                            |
| footnote   | 13 / 18            | Regular        | −0.1%               | Metadata, section footers                |
| caption    | 12 / 16            | Medium (500)   | 0                   | Labels, timestamps                       |
| caption2   | 11 / 13            | Medium         | +0.1%               | Badges only                              |

Rules:

- Hierarchy comes from weight and size contrast, then from color (label secondary/tertiary). Never more than 3 text styles in one row or card.
- Large display numbers (balances, stats, timers) use tabular figures (`font-variant-numeric: tabular-nums`, `.monospacedDigit()`) so they don't jitter when they change, and SF Pro Rounded or the display face if the brand is friendly.
- Max line length 60–70 characters for reading text. Left-align body text; center only short titles and empty states.
- Support Dynamic Type / user font scaling. Every style must scale; layouts must reflow, not truncate.
- No ALL-CAPS body text. Small caps labels allowed at caption size with +5% tracking.
- Truncate with tail ellipsis on one line for titles; allow two lines for subtitles before truncating.

### 3.2 Color

Define colors as semantic roles, never as hex in components. Every role has a light and dark value. Neutrals are slightly tinted toward the brand hue (2–4% saturation) so grays feel warm or cool on purpose, not dead. The hex values in the table are a neutral reference showing the required roles and contrast relationships; build the app's own palette (its accent, tinted neutrals and signature tones from the brief) to the same roles and contrast ratios instead of shipping these values.

| Role                            | Light                                           | Dark                               | Use                                          |
| ------------------------------- | ----------------------------------------------- | ---------------------------------- | -------------------------------------------- |
| bg.primary                      | #FFFFFF                                         | #000000 or #0A0A0B                 | Plain screens                                |
| bg.grouped                      | #F2F2F7                                         | #000000                            | Behind grouped lists                         |
| bg.elevated                     | #FFFFFF                                         | #1C1C1E                            | Cards, sheets, rows on grouped bg            |
| bg.elevated2                    | #F2F2F7                                         | #2C2C2E                            | Inputs and controls inside elevated surfaces |
| label.primary                   | #000000 at 92%                                  | #FFFFFF at 96%                     | Titles, body                                 |
| label.secondary                 | #3C3C43 at 60%                                  | #EBEBF5 at 60%                     | Subtitles                                    |
| label.tertiary                  | #3C3C43 at 30%                                  | #EBEBF5 at 30%                     | Placeholders, disabled                       |
| separator                       | #3C3C43 at 29%, hairline                        | #545458 at 60%, hairline           | Row dividers                                 |
| accent                          | brand color, AA on bg                           | brand color lifted 8–12% lightness | Primary actions, selection, links            |
| success / warning / destructive | #34C759 / #FF9F0A / #FF3B30 (or tuned to brand) | dark-tuned variants                | Status only, never decoration                |

Rules:

- One accent color. It marks what is tappable and what is selected. If everything is accented, nothing is.
- Dark mode is not inverted light mode. Surfaces get lighter as they rise (elevation = lightness), shadows mostly disappear, and accent colors are slightly desaturated and lightened.
- Text on colored backgrounds must hit WCAG AA (4.5:1 body, 3:1 large text). Check every pair.
- Secondary text is made with opacity of the label color, not a separate gray, so it adapts to any background.
- Gradients are allowed only as subtle material (e.g. a 2–3% top-to-bottom lightness shift on a hero surface) or when they encode data.

### 3.3 Spacing

4-pt base grid. Tokens: `2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80`.

- Screen horizontal margin: 16 on compact phones, 20 on large phones, readable-width centered column on tablet/desktop.
- Related items: 4–8 apart. Items in a group: 12–16. Between groups/sections: 32–40. Space should make grouping obvious without lines.
- List rows: minimum 44 tall; 11–12 vertical padding for one-line rows, 10 for two-line rows.
- Inside cards: 16 padding (20 for hero cards). Inner padding never exceeds outer margin.

### 3.4 Shape and radius

Pick one shape language from the identity brief and apply it everywhere. If it uses rounded corners, use continuous (squircle) corners wherever the platform allows: `RoundedRectangle(cornerRadius:style: .continuous)` on iOS; on web use `corner-shape: squircle` where supported, else an SVG mask for hero elements, plain radius elsewhere.

Tokens: `xs 6` (badges, small chips), `sm 10` (inputs, small buttons), `md 14` (buttons, list groups), `lg 20` (cards), `xl 28` (sheets, large cards), `full` (pills, avatars).

**Nested radius rule:** inner radius = outer radius − padding between them. A card at 20 with 8 padding holds an image at 12. Mismatched nested corners are one of the most visible amateur tells.

### 3.5 Elevation and materials

Prefer three levels only: base, raised (cards), overlay (sheets, menus, toasts).

- Raised shadow, light mode: two layers, `0 1 2 rgba(0,0,0,0.04)` + `0 4 12 rgba(0,0,0,0.06)`. Dark mode: no shadow; use bg.elevated plus a 0.5 pt inner hairline at white 6%.
- Overlay shadow: `0 8 24 rgba(0,0,0,0.12)` + `0 2 6 rgba(0,0,0,0.06)`.
- Shadows are tinted with the surface's hue, never pure black at high opacity. Never use a shadow larger than 32 blur.
- Materials: bars and floating controls over content use background blur (iOS `.regularMaterial` / `.ultraThinMaterial`; web `backdrop-filter: blur(20px) saturate(180%)` over a 70–80% opaque bg). Bars are transparent at scroll top and gain material + hairline only once content scrolls under them.

### 3.6 Iconography and imagery

- One icon set only, chosen or drawn to match the typeface's stroke and personality: custom, a customized open set (Phosphor, Lucide), or SF Symbols only if the brief deliberately calls for a native feel. One stroke weight throughout (e.g. 1.5 pt at 24 size), matched to adjacent text weight.
- Icon size follows text: 17 pt body → \~20–22 pt icon box; optically center, don't geometrically center.
- Filled variant = selected state; outline = unselected. Don't mix filled and outline in the same group otherwise.
- No decorative icons in front of every label. An icon must earn its place by being faster to scan than the word.
- Images: always reserve their aspect ratio (no layout shift), fade in over 200 ms on load, show a dominant-color or blurhash placeholder, never a gray box with a spinner.
- Illustrations, if any, are custom and in one style. No stock 3D blobs or generic people illustrations.

## 4. Layout and responsiveness

Layouts adapt by size class, not by stretching. A phone layout scaled up to a tablet is a fail.

| Size class                     | Width   | Layout                                                                                           |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------ |
| Compact phone                  | < 390   | Single column, 16 margins, bottom tab bar, sheets for secondary flows                            |
| Regular phone                  | 390–430 | Single column, 20 margins                                                                        |
| Tablet portrait / small window | 600–900 | Readable column max 672 wide, or sidebar + content                                               |
| Tablet landscape / desktop     | > 900   | Sidebar (260–320) + content + optional inspector; sheets become centered popovers or side panels |

Rules:

- Respect safe areas on every edge. Content scrolls under translucent bars; tappable content never sits under the home indicator or notch.
- Primary actions live in the bottom third of the screen on phones (thumb zone). Destructive or rare actions go top-right or into a menu.
- Headers respond to scroll: whatever header style the identity uses, it condenses smoothly as content scrolls under it and gains its background at the same moment (a collapsing large title is one option, not the default).
- Use a real grid on wide screens: 4 columns compact, 8 regular, 12 wide; 16–24 gutters.
- Never let text run edge-to-edge on wide screens; cap reading width.
- Test with the largest accessibility text size: rows grow, horizontal stacks wrap into vertical stacks, nothing clips.
- Keyboard: content scrolls so the focused field and its primary button stay visible; the screen never jumps.
- Rotation, split view and window resizing animate the layout change rather than snapping (matched geometry / layout animations).
- Web: no horizontal scroll at 320 wide; touch targets stay 44+ on touch devices; hover states exist only on hover-capable pointers (`@media (hover: hover)`).

## 5. Motion system

Motion is physics, not timing. Default to springs for anything that moves, scales or follows a gesture; use timed curves only for opacity and color. Every animation must be interruptible: a new touch mid-animation takes over from the current position and velocity, it never waits or jumps.

### 5.1 Spring tokens

The same five springs are used everywhere. Values given as Apple-style (response, damping fraction) and as mass-1 stiffness/damping for Reanimated, Framer Motion, React Spring, Compose.

| Token         | Response / damping fraction        | Stiffness / damping | Use                                                                              |
| ------------- | ---------------------------------- | ------------------- | -------------------------------------------------------------------------------- |
| spring.press  | 0.20 s / 1.0                       | 987 / 63            | Press-down and release on buttons, rows, cards                                   |
| spring.snappy | 0.30 s / 0.90                      | 439 / 38            | Toggles, segmented controls, small UI changes, menus                             |
| spring.smooth | 0.40 s / 0.85 (iOS `.smooth`-like) | 247 / 27            | Default: navigation, layout changes, sheets                                      |
| spring.gentle | 0.55 s / 0.85                      | 131 / 19            | Large surfaces, hero expansions, full-screen zoom                                |
| spring.bouncy | 0.50 s / 0.65                      | 158 / 16            | Rare moments of delight only: success, a completed goal, a dropped item settling |

Rules: no bounce on things that carry information (text, numbers, layout). Bounce only on objects the user threw or a celebration. Overshoot never exceeds \~5% of the distance.

Tune these to the motion personality in the brief. A calm, precise app can run every spring at damping fraction 0.9–1.0 with slightly faster responses; a playful app can drop spring.snappy to 0.75 damping and use spring.bouncy more often. Keep the five-token structure and keep every value within response 0.15–0.6 s and damping fraction 0.6–1.0.

### 5.2 Timed tokens (opacity, color, blur)

| Token         | Duration | Curve                                 | Use                                             |
| ------------- | -------- | ------------------------------------- | ----------------------------------------------- |
| fade.fast     | 120 ms   | ease-out `cubic-bezier(0.2, 0, 0, 1)` | Press highlight off, tooltip, hover             |
| fade.standard | 200 ms   | ease-out                              | Content swap, image load, crossfades            |
| fade.exit     | 150 ms   | ease-in `cubic-bezier(0.4, 0, 1, 1)`  | Things leaving; exits are faster than entrances |
| color.state   | 180 ms   | ease-in-out                           | Background/tint change on selection             |

Never use linear easing except for indeterminate progress or scrubbing tied 1:1 to a gesture. Never exceed 500 ms for anything the user waits on.

### 5.3 Choreography

- **Spatial continuity.** Elements travel from where they were to where they go. Tapping a card expands _that card_ into the detail view (matched geometry / shared element transition); dismissing shrinks it back into its slot. Nothing appears from nowhere.
- **Gesture-driven and velocity-aware.** Swipe-to-go-back, sheet drags and card swipes track the finger 1:1, then hand the release velocity to the spring. A fast flick completes; a slow drag past 50% completes; anything else springs back.
- **Hierarchy in time.** The thing the user touched moves first; context follows. Stagger list items by 20–30 ms, maximum 6 items staggered, the rest appear together. Total stagger under 200 ms.
- **Exits are quick and quiet.** Leaving elements fade + scale to 0.96 over 150 ms; entering elements take the longer spring.
- **Small distances.** Enter offsets are 8–24 pt, not whole screens. Scale entrances start at 0.92–0.96, never 0.
- **Layout animates.** When an item is inserted, removed or reordered, siblings slide to their new positions with spring.smooth instead of jumping.
- **Content transitions for values.** Changing numbers roll digit-by-digit (iOS `.contentTransition(.numericText())`; elsewhere a per-digit vertical slide). Icons morph or crossfade with a slight scale (0.8 → 1) rather than swapping.

### 5.4 Transition catalogue

| Moment                   | Transition                                                                                                                                                     |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Push to detail           | Platform push (iOS: slide + parallax, edge swipe back). If the source is a card or image, zoom from it instead                                                 |
| Open card / photo / item | Shared-element zoom with spring.gentle; background dims to 40% and scales to 0.94                                                                              |
| Sheet                    | Slides up with spring.smooth; supports detents (medium, large); drag down to dismiss with rubber-banding at the top                                            |
| Tab switch               | Instant content swap, or a 150 ms crossfade; never a slide. Tab icon does a small bounce or symbol effect on select                                            |
| Menus / popovers         | Scale from the source point (0.9 → 1) + fade, spring.snappy, anchored at the trigger                                                                           |
| Toast / banner           | Slides in from the edge nearest its cause, auto-dismisses after 3–4 s, swipe to dismiss                                                                        |
| Delete from list         | Row collapses height + fades with spring.smooth; siblings close the gap; undo toast appears                                                                    |
| Pull to refresh          | Indicator stretches with the pull, haptic tick at the threshold, content settles back with spring.smooth when done                                             |
| Completion / success     | One restrained moment: checkmark draws (stroke animation 300 ms), spring.bouncy scale on the item, success haptic. No confetti unless it's a genuine milestone |

### 5.5 When not to animate

- Typing, scrolling content into view on every scroll, and anything the user does 50 times a day beyond its instant feedback.
- Loading the same screen again (no re-running entrance animations on back navigation).
- Idle states: no breathing, pulsing or looping decoration unless it signals something live (recording, syncing).

### 5.6 Reduce Motion

When the OS Reduce Motion setting is on: replace slides, zooms and parallax with 200 ms crossfades; keep opacity and color changes; disable bounce and stagger; keep haptics. Respect `prefers-reduced-motion` on web.

## 6. Interaction and feedback

The app must acknowledge every touch on touch-down, before the user lifts their finger. This single rule does more for perceived quality than any visual change.

### 6.1 Touch response

| Element                    | On press (touch-down)                                           | On release                                                 |
| -------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| Primary / secondary button | Scale to 0.97, brightness −8% (spring.press)                    | Spring back; action fires; haptic if meaningful            |
| List row                   | Background fills to a highlight (label color at 6–8%) instantly | Highlight fades out over fade.fast after navigation starts |
| Card                       | Scale to 0.98, shadow tightens                                  | Spring back or zoom into detail                            |
| Icon button                | Icon scales to 0.88 and dims to 60%                             | Spring back                                                |
| Toggle / checkbox          | Thumb stretches slightly in the drag direction                  | Snaps to state with spring.snappy + selection haptic       |

- If the finger drags off the element, the press state releases and the action cancels (standard iOS behavior). Scrolling a list must never trigger a row's action.
- Hit targets are at least 44 × 44 even when the visible element is smaller; extend with invisible padding.
- Long-press opens a context menu with a preview (iOS `contextMenu`, Android long-press menu, web right-click). Every list item and card gets one with its 3–5 most useful actions.

### 6.2 Gestures

- Edge-swipe back works on every pushed screen. Never break it with a custom nav.
- Swipe actions on list rows: trailing swipe for destructive (delete/archive), leading for positive (pin/mark done). Full swipe triggers the first action with a haptic at the threshold.
- Sheets dismiss by dragging down; scroll content inside sheets hands off to the sheet drag when scrolled to top.
- Pinch to zoom on images; double-tap to toggle zoom at the tap point.
- Rubber-banding at every scroll edge and drag limit (resistance increasing with distance), never a hard stop.
- Every gesture has a visible alternative (button or menu) for discoverability and accessibility.

### 6.3 Haptics

Haptics confirm; they don't decorate. Use the platform's semantic generators, never raw vibration.

| Event                                                                        | Haptic (iOS / Android equivalent)                                      |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Selection change (picker, segmented control, toggle, drag over a snap point) | selection / `CLOCK_TICK`                                               |
| Button that commits something (save, send, add)                              | impact light / `CONFIRM`                                               |
| Crossing a gesture threshold (swipe action, pull-to-refresh)                 | impact medium, once per crossing                                       |
| Drop / snap of a dragged object                                              | impact soft or rigid depending on surface                              |
| Success of a meaningful task                                                 | notification success                                                   |
| Error or validation failure                                                  | notification error, paired with a field shake (3 cycles, 6 pt, 300 ms) |
| Destructive confirm                                                          | notification warning                                                   |

Rules: never fire a haptic for scrolling, navigation pushes or plain taps on links. Never two haptics within 100 ms. Prepare generators ahead of time so feedback lands on the same frame as the visual.

### 6.4 State model

Every interactive component defines all of these, visually distinct: default, pressed, focused (keyboard/switch control ring, 2 pt accent outline offset 2 pt), hover (pointer devices only), selected, disabled (40% opacity, no press response), loading (content replaced in place by a spinner or progress, width fixed so nothing shifts).

### 6.5 Optimistic and forgiving

- Apply the user's change in the UI immediately; sync in the background; roll back with an explanation only if it fails.
- Replace "Are you sure?" dialogs with an undo toast (5 s) for anything reversible. Keep confirmations only for irreversible, high-cost actions, and name the consequence on the button ("Delete 12 photos", not "OK").
- Preserve state: scroll position, form drafts, selected tab, and expanded sections survive navigation and app relaunch.

## 7. Component standards

Each component is built once, with every state from 6.4, and reused everywhere. Specs below set the behavior and the quality floor; dimensions and styling follow the app's own identity as long as they stay consistent.

**Buttons**

- Primary: filled accent, label in headline weight, height 50 (large) or 44 (regular), radius md (14) or full pill, horizontal padding 20. One per screen.
- Secondary: tinted (accent at 12–15% fill, accent label). Tertiary: label-only in accent.
- Destructive: destructive color, used only for the destructive action itself.
- Loading: label crossfades to a spinner; button keeps its width; disabled until resolved.
- Full-width buttons on phones sit above the safe area with 16 bottom padding, on a material bar if content scrolls beneath.

**Lists (the most important component in most apps)**

- Settings-style inset grouped lists belong on settings screens only. Elsewhere, design rows to the identity (custom layouts, editorial spacing, rich leading visuals), keeping the anatomy and behavior below.
- Separators are hairlines (1 physical pixel), inset to align with the text, not the cell edge. No separator after the last row.
- Row anatomy: optional leading icon/avatar (28–40) → title (headline or body) + subtitle (subhead, secondary) → trailing value (secondary) and chevron (tertiary, only if it navigates).
- Section headers in footnote/secondary or a bold title3 for editorial sections; footers in footnote/secondary for explanations.

**Cards**

- Only for discrete objects. Radius lg (20), padding 16–20, bg.elevated, raised shadow in light mode.
- Never nest cards inside cards. Never put a border, shadow and tinted background on the same card.

**Inputs**

- Height 44–50, bg.elevated2 fill, radius sm (10), no border at rest; accent 1.5 pt ring on focus with spring.snappy.
- Labels above the field (footnote, secondary), not floating placeholders that vanish.
- Validate on blur, not on every keystroke; error text appears below with fade.standard and pushes content smoothly.
- Correct keyboard type, autofill/textContentType, return key label ("Next", "Search", "Send") and autocapitalization for every field.

**Navigation**

- Tab bar: 3–4 destinations, icon + short label, filled icon when selected, material background. Tapping the active tab scrolls to top, tapping again pops to root.
- Header: one consistent pattern across the app, designed to the identity (a collapsing large title is one option, not the default); at most 2 trailing actions; back is always available and behaves predictably.

**Sheets and modals**

- Prefer sheets with detents over full-screen modals. Grabber visible, radius xl (28), background dims to 30–40%.
- Full-screen modal only for focused creation tasks; it has Cancel (left) and a primary action (right). Swipe-to-dismiss asks before discarding unsaved input.

**Menus, segmented controls, toasts**

- Context menus and pull-down menus use native components where possible. Group actions; destructive last and in red.
- Segmented control: the selection pill slides between segments with spring.snappy + selection haptic.
- Toasts: pill or rounded rect at top or bottom, one line, optional action ("Undo"), material background, 3–4 s, one at a time (new replaces old with a crossfade).

**Data display**

- Charts: no gridline clutter, labels on the data, tabular numerals, scrubbing with a finger shows the value with a selection haptic per data point.
- Avatars: initials on a hue derived from the name when no photo; ring for selection, not a border at rest.

## 8. Empty, loading, error and success states

These states are where hand-crafted apps and generated apps differ most, because generated apps forget them. Design all four for every screen and every async component.

| State                          | Standard                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First launch / empty           | Says what will appear here and offers the one action that fills it. Small custom illustration or large SF Symbol (48–64, tertiary), title3 headline, one line of subhead, one button. Vertically centered slightly above middle (optical center). Optionally a ghosted preview of what filled content looks like |
| Empty after filtering / search | "No results for “query”" + suggestion ("Check spelling or try a broader term") + clear-filter action. No illustration                                                                                                                                                                                            |
| Loading, first time            | Skeletons that match real content shape and size, with a subtle shimmer (1.2 s loop, low contrast) or a slow pulse. Never a centered spinner on a blank screen                                                                                                                                                   |
| Loading under 300 ms           | Show nothing new. Flashing a skeleton for 100 ms looks broken; delay loading UI by \~300 ms                                                                                                                                                                                                                      |
| Loading, refresh               | Keep showing cached content; indicate refresh in place (pull indicator or small inline progress)                                                                                                                                                                                                                 |
| Long task                      | Determinate progress with honest estimates; let the user leave and get notified on completion                                                                                                                                                                                                                    |
| Error, recoverable             | Inline, near the cause, plain language, one action (Retry / Edit). Keep whatever content can still be shown                                                                                                                                                                                                      |
| Error, offline                 | Persistent but quiet banner; queue user actions and sync later; show which items are pending                                                                                                                                                                                                                     |
| Success                        | Usually silent: the result appearing is the confirmation. For meaningful completions, one moment from 5.4 plus success haptic                                                                                                                                                                                    |

Transitions between states crossfade (fade.standard) and keep layout stable: skeletons occupy the same frames as the content that replaces them, so nothing jumps.

## 9. Copy and microcopy

Words are part of the interface. Premium apps sound like a calm, competent person, not a marketing page and not a robot.

- **Specific over generic.** "3 tasks due today" beats "Welcome back!". Show the user's data in the copy whenever possible.
- **Verbs on buttons.** "Save draft", "Send invoice", "Delete account". Never "OK", "Submit", "Yes".
- **Short.** Titles under 4 words. Body under 2 sentences. Cut every word that doesn't change meaning.
- **Sentence case** everywhere except proper nouns. No exclamation marks except for real celebrations. No emoji in UI chrome.
- **Errors explain and help:** what happened, why if useful, what to do. Never blame the user, never show raw error codes as the headline.
- **Consistent vocabulary.** One word per concept across the app (don't mix "project", "workspace" and "board" for the same thing).
- **Numbers and dates are humane.** "Yesterday at 9:41", "2 min ago", "1.2k"; locale-aware formatting; relative dates switch to absolute after 7 days.
- **Permission prompts** are preceded by a screen that explains the benefit in one sentence, shown at the moment the feature is needed, never on first launch.

## 10. Accessibility

Accessibility is part of the premium bar: Apple's own apps are fully accessible, and the same discipline produces cleaner layouts.

- Contrast meets WCAG AA for all text and essential icons in both themes.
- Every interactive element has an accessibility label, role and, where relevant, value and hint. Icon-only buttons always have labels.
- Dynamic Type / font scaling works up to the largest accessibility size without truncation of essential content.
- Reading order and focus order follow visual order. Grouped content (a row with title, subtitle, value) reads as one element.
- Custom gestures have accessible actions (VoiceOver custom actions / rotor actions) and visible alternatives.
- Reduce Motion (5.6), Reduce Transparency (materials become solid), Increase Contrast (stronger separators and labels) and Bold Text are honored.
- Never convey meaning by color alone; pair with icon, text or shape.
- Web: semantic HTML, visible focus rings, full keyboard navigation, `aria-live` for async status changes.

## 11. Performance: what "smooth" means

A beautiful animation that drops frames looks worse than no animation. These budgets are pass/fail.

| Metric                                          | Target                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Frame rate during scroll, gestures, transitions | Locked 60 fps; 120 fps on ProMotion/high-refresh devices. Zero dropped frames on a mid-range device |
| Touch-to-visual-feedback                        | < 16 ms (same frame)                                                                                |
| Tap-to-navigation start                         | < 100 ms                                                                                            |
| Cold start to first meaningful content          | < 1 s on a recent device, with cached data shown first                                              |
| Layout shift after first paint                  | None. Images, async text and skeletons reserve their final size                                     |
| Web                                             | LCP < 2.0 s, INP < 100 ms, CLS < 0.05                                                               |

Rules:

- Animate only transform and opacity (and blur/filter sparingly). Never animate width, height, top/left or shadows on large lists.
- Run animations and gesture handling on the UI/compositor thread (Reanimated worklets, Core Animation, CSS transforms, Compose). Never drive per-frame animation from JS state or React re-renders.
- Virtualize long lists; recycle cells; precompute row heights where possible.
- Decode and size images off the main thread at display size; cache aggressively.
- Prefetch the next likely screen's data on press-down or when its entry point scrolls into view.
- Profile with Instruments / Android Studio profiler / Chrome Performance on a real mid-range device before calling any screen done.

## 12. Platform implementation notes

Use whichever row matches the app's stack. Use native components for behavior (scrolling, gestures, text input, accessibility) and style them to the identity; build custom only where native can't reach the bar or the look.

| Concern               | SwiftUI (iOS)                                                         | React Native / Expo                                                                       | Web (React)                                                                                               |
| --------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Springs               | `.spring(response:dampingFraction:)`, `.smooth`, `.snappy`, `.bouncy` | `react-native-reanimated` `withSpring({ stiffness, damping, mass: 1 })`                   | `motion` (Framer Motion) `type: "spring"` with stiffness/damping, or CSS `linear()` spring approximations |
| Gestures              | Native gestures, `DragGesture` with `predictedEndTranslation`         | `react-native-gesture-handler` + Reanimated, velocity passed into `withSpring`            | `motion` drag with `dragElastic`, or `@use-gesture/react`                                                 |
| Shared element / zoom | `.matchedGeometryEffect`, `.navigationTransition(.zoom)`              | Reanimated shared transitions or a custom overlay animation                               | `motion` `layoutId`, View Transitions API                                                                 |
| Layout animation      | `withAnimation` around state changes                                  | Reanimated `Layout` / `entering` / `exiting`                                              | `motion` `layout` prop, `AnimatePresence`                                                                 |
| Haptics               | `.sensoryFeedback(...)` / UIFeedbackGenerator                         | `expo-haptics` (selection, impact, notification)                                          | Vibration API on Android only; otherwise rely on visual feedback                                          |
| Materials             | `.regularMaterial`, `.ultraThinMaterial`                              | `expo-blur` `BlurView`                                                                    | `backdrop-filter: blur() saturate()`                                                                      |
| Numbers               | `.contentTransition(.numericText())`, `.monospacedDigit()`            | Per-digit animated text component, `fontVariant: ['tabular-nums']`                        | `tabular-nums` + per-digit slide (e.g. NumberFlow)                                                        |
| Lists                 | `List` / `LazyVStack`, `.swipeActions`, `.contextMenu`                | `FlashList`, swipeable rows via gesture handler, `react-native-ios-context-menu` or Zeego | Virtualized list, Radix/Base UI menus                                                                     |
| Sheets                | `.sheet` + `.presentationDetents`                                     | `@gorhom/bottom-sheet` or native form sheets (Expo Router)                                | Vaul drawer on touch, dialog on desktop                                                                   |
| Corners               | `.continuous` style                                                   | `borderCurve: 'continuous'` (iOS)                                                         | `corner-shape: squircle` progressive enhancement                                                          |

Cross-platform apps follow each platform's conventions for navigation, back behavior and controls (e.g. native date pickers, switches). Brand lives in color, type, motion character and content, not in reinventing standard controls.

## 13. Definition of done (per screen)

A screen ships only when every box is ticked on a real device.

**Visual**

- [ ] Only tokens used: no raw hex, font sizes, spacing or radii in the screen's code
- [ ] Aligns to the 4-pt grid; left edges of text line up down the screen
- [ ] Nested corner radii follow the inner = outer − padding rule
- [ ] One primary action, one accent color, max 3 text styles per row
- [ ] No AI tells from Section 1 remain (gradients, card soup, emoji, generic copy)
- [ ] Looks deliberate in both light and dark mode, and is recognizably this app with the logo hidden (not stock iOS, not a template)

**Motion and interaction**

- [ ] Every tappable element responds on touch-down
- [ ] All movement uses spring tokens; all animations interruptible mid-flight
- [ ] Entering/leaving elements have spatial continuity; nothing pops in
- [ ] Haptics fire only on the events in 6.3, on the same frame as the visual
- [ ] Gestures (back swipe, sheet drag, swipe actions) track 1:1 and respect velocity
- [ ] Reduce Motion replaces movement with crossfades

**States**

- [ ] Empty, loading (skeleton), error and offline states designed and reachable
- [ ] No layout shift when data, images or errors arrive
- [ ] Destructive actions are undoable or explicitly confirmed with a named consequence

**Responsiveness and access**

- [ ] Works on the smallest supported phone and on tablet/desktop with an adapted layout
- [ ] Largest Dynamic Type size: nothing clipped, layout reflows
- [ ] VoiceOver/TalkBack reads every element sensibly in order
- [ ] Contrast AA in both themes

**Performance**

- [ ] Profiled: zero dropped frames on scroll and transitions on a mid-range device
- [ ] Cached content shows instantly on revisit

**The final test:** put it next to the best app in its category on the same phone. If anything about yours feels slower, busier, or less certain, it is not done.

## 14. Prompt to hand to an agent

Paste this along with the spec (export it as Markdown and save it in the repo as `DESIGN.md`). Fill in the brackets.

```text
You are a senior product designer and design engineer. Your goal is to make this app feel hand-crafted and premium. The bar is the craft of first-party Apple apps and the best indie apps (Things 3, Flighty, Linear, Arc): their smoothness, physics, responsiveness, consistency, restraint and attention to detail. The bar is NOT their appearance. This app must have its own distinctive visual identity; do not make it look like a stock iOS app. The full standard is in DESIGN.md. Treat it as binding.

App: [one-line description]. Stack: [SwiftUI / React Native + Expo / Next.js]. Brand: [accent color if any, personality in 3–5 words, e.g. calm, precise, warm]. Visual references outside apps (optional): [e.g. Swiss editorial print, Japanese stationery, Braun products]. Primary users and their most frequent action: [...].

Work in this order and do not skip steps:
1. Audit: list every screen and state. For each, list violations of DESIGN.md Section 1 and Section 13, including anything that looks generic or like a copy of iOS. Show me the audit before changing code.
2. Art direction: write the one-page brief from DESIGN.md Section 2 (Identity): personality, outside references, 2–3 signature elements, 1–2 signature moments. Propose 2 distinct directions and wait for me to pick one.
3. Tokens: create a single tokens file implementing the chosen direction with the structure of Section 3 (type, color with light/dark, spacing, radius, elevation) and Section 5 (spring and timing tokens tuned to the motion personality). No raw values anywhere else.
4. Components: rebuild primitives per Section 7 with every state from Section 6.4, touch-down press feedback, and haptics per Section 6.3, styled to the identity.
5. Screens: recompose screens from components, highest-traffic first. Add empty/loading/error/offline states per Section 8. Rewrite copy per Section 9. Build the signature moments.
6. Motion pass: implement transitions from Section 5.4 app-wide so they feel like one system. All interruptible, all springs, Reduce Motion respected.
7. Verify: run the Section 13 checklist per screen, including the hide-the-logo distinctiveness test, profile performance per Section 11, and report what passes and what doesn't.

Rules: keep platform behavior familiar, make the look your own; remove before you add; every animation must communicate something; never ship a screen with a spinner on a blank page, a raw value, a missing state, or a look that could belong to any app. When unsure, ask: "Would a world-class designer with this brief, who cares about every pixel, ship this?"
```
