# iPad responsive design plan

Status: implemented and verified on iPad Pro 13-inch portrait/landscape and iPhone 17 Pro Max.

The baseline captures, original-derived concept alternatives, implementation choices, and final
validation captures live under `docs/ipad-design/`. The responsive work is capability-based: shared
shell, content, grid, split, pager, and settings primitives adapt all consumers without maintaining a
second tablet-only navigation tree.

## Implemented result

| Surface                | Expanded iPad landscape                                                     | Regular iPad portrait / compact iPhone                                                |
| ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Main shell             | Persistent 224pt destination sidebar with Today and Add Transaction actions | Existing bottom navigation and floating actions                                       |
| Calendar               | Month grid and selected activity stay visible in a 56/44 split              | Existing calendar hierarchy in a centered readable canvas; phone remains edge-to-edge |
| Accounts, goals, items | Wider summary/header canvas and adaptive two-column collections             | Single-column collection flow; phone composition unchanged                            |
| Insights               | Pane-sized pagers/charts and chart-to-breakdown split                       | Existing stacked reports on a readable canvas                                         |
| Albums                 | Three-column 4:3 gallery and inline auto-add control                        | Two-column portrait gallery; one-column phone gallery                                 |
| Settings               | Profile summary, paired promos, and four-column preferences grid            | Three-column portrait/phone grid and stacked promos                                   |
| Editors                | 900pt centered form workspace; album creation uses a cover/form workbench   | Existing stacked editor composition                                                   |
| Detail pages           | Panoramic album hero with chart/list split                                  | Existing stacked detail composition                                                   |

The layout resolver also collapses an iPad window at 743pt or narrower to the compact behavior, so
Split View and Stage Manager widths do not receive a desktop-style sidebar they cannot support.

## Goal and invariants

Money2Time must feel native and intentional in full-screen iPad portrait and landscape, including
resized iPad windows, without changing the existing iPhone composition or behavior.

Non-negotiable invariants:

- The existing compact-width React tree remains the iPhone baseline. Tablet components are gated by
  available width and `isTablet`; no phone spacing, typography, navigation, or interaction changes.
- Every top-level destination, pushed route, editor, picker, sheet, empty state, loading state, and
  populated state remains reachable and functionally equivalent at every supported width.
- Rotation preserves the active tab, nested route, selection, editor values, pager position, and
  scroll state. It must not remount a screen solely because the window changed size.
- Existing semantic theme tokens, dark mode, formatters, localization, safe-area behavior, haptics,
  and accessibility labels remain authoritative.
- The UI must remain usable in iPad multitasking. No layout assumes one physical iPad model or only
  full-screen landscape.

## Source standard

The implementation follows Apple's current Human Interface Guidelines:

- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout): adapt to the space
  actually available, preserve functionality as size changes, and allow a tab bar to become a
  sidebar when more navigation can be visible.
- [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars): use a leading
  pane for top-level destinations only when there is enough horizontal and vertical space; keep it
  visible and familiar rather than hiding it by default.
- [Split views](https://developer.apple.com/design/human-interface-guidelines/split-views): use a
  primary list and detail pane for hierarchical content and make the split respond to multiple
  widths.
- [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars): keep navigation,
  titles, and common actions in predictable leading, center, and trailing groups.

Money2Time's existing design system remains the visual source of truth: Work Sans for UI, Space Mono
for numeric emphasis, semantic palette variables, soft cards, restrained accent color, and the
existing motion and haptic tokens.

## Responsive tiers

The hook must expose capabilities, not screen-name guesses. Width thresholds describe the current
app window, so resizing and multitasking work naturally.

| Tier            | Available window                    | Navigation                 | Content behavior                                                     |
| --------------- | ----------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| Compact         | phone, or tablet window `< 744pt`   | Existing bottom navigation | Existing iPhone layout and measurements, unchanged                   |
| Regular tablet  | tablet window `744–1023pt`          | Bottom navigation          | 680–760pt readable canvas; adaptive 2–4 column grids; wider popovers |
| Expanded tablet | tablet landscape window `>= 1024pt` | 224pt leading sidebar      | 2- or 3-pane work area up to 1180pt; no centered phone column        |
| Extra wide      | expanded work area `>= 1100pt`      | Same sidebar               | Optional inspector/summary rail where it adds information            |

The tier can change while mounted. Components use `useWindowDimensions`; module-level constants may
only describe a safe initial fallback.

## Shared iPad layout primitives

1. `useDeviceLayout`
   - Preserve `isTablet` and `isLandscape` compatibility.
   - Add `isCompact`, `isRegularTablet`, `isExpandedTablet`, work-area width, responsive gutters,
     sidebar width, readable width, form width, grid column count, and pane gap.
   - Keep `contentWidth` compatible until every current consumer is migrated.

2. `AdaptiveMainShell`
   - Compact/regular tablet: render the existing bottom navigation path.
   - Expanded tablet: render a 224pt leading sidebar with the five existing destinations, the app
     identity at the top, and a prominent Add transaction action within easy reach.
   - The shell hosts the exact same mounted destination instances so switching tiers does not lose
     state. Floating calendar actions move into the content toolbar or sidebar action area only in
     expanded mode.

3. `TabletContentContainer`
   - Become variant-driven instead of a universal 600pt phone column.
   - `readable`: 760pt; `form`: 900pt; `content`: 1040pt; `wide`: 1180pt; `fullBleed`: unbounded.
   - Compact width still returns children unchanged.

4. `ResponsiveSplitView`
   - Collapses to a single existing pane below its threshold.
   - Supports `list-detail`, `dashboard-detail`, and `form-preview` compositions without remounting
     shared content.
   - Pane widths: primary 320–420pt, detail flexible, optional inspector 280–340pt.

5. `ResponsiveGrid`
   - Measures its container and derives columns from a minimum card width, never from a device name.
   - Used by settings tiles, accounts, goals, items, albums, templates, icon pickers, and tutorials.

6. iPad presentation policy
   - Small confirmations stay alerts.
   - Pickers and action choices use centered or source-anchored popovers on regular/expanded iPad and
     retain the existing bottom-sheet/full-screen phone presentation.
   - Full editors use a centered card or two-column workbench, not a stretched phone form.
   - Maps, receipt cameras, image previews, and visual tutorials may remain full bleed.

## Screen templates

### A. Destination dashboard

For Calendar, Assets, Insights, Albums, and Settings. Expanded mode uses the sidebar and a full work
area. The destination owns a local toolbar and uses dashboard cards, panes, or grids rather than
stretching one vertical feed.

### B. List–detail workspace

For accounts, goals, items, recurring payments, receipts, reimbursements, settle-up people,
tutorials, and statement-import review. The list remains visible at the leading edge while a selected
item or contextual summary occupies the detail pane. Below the threshold, retain the current push
flow.

### C. Two-column editor

For transaction, account, goal, item, album, category, recurring, budget, wage, receipt-split, and
split-bill editors. Identity/amount/primary fields occupy the main pane; options, summary, image,
allocation, or preview content occupies the secondary pane. The save bar spans the editor card, not
the whole display.

### D. Readable settings/detail page

For preference pages whose content is naturally linear. Use a 760–900pt readable card with an
optional 280–320pt explanation/preview rail only when meaningful. A deliberate canvas and grouped
surface is acceptable; a bare 600pt phone strip is not.

### E. Grid browser

For app icons, account/category/item/subscription icons, widget previews, album covers, tutorials,
and other visual choices. Cards use a minimum width with 3–6 columns depending on the current window.

### F. Immersive canvas

For album map, receipt camera/image, onboarding artwork, paywall artwork, and tutorial detail imagery.
Content extends edge-to-edge behind the appropriate control layer while controls retain readable
bounds.

## Destination designs

### Calendar

- Regular tablet portrait: month summary and calendar/list retain their vertical relationship but use
  the larger readable canvas.
- Expanded landscape: calendar/month context is the primary pane; the selected day/month activity is
  a persistent detail pane. Search and filters remain in the toolbar. The Today and Add actions no
  longer float over unused margins.

### Assets

- Accounts, Goals, and Items remain local tabs.
- Expanded landscape uses a summary rail plus an adaptive card/list region. Selecting an account,
  goal, or item opens in a detail pane when possible; the existing push route remains below the split
  threshold.

### Insights

- Expanded landscape uses a chart/report canvas with a stable insight selector rail and a contextual
  breakdown/detail column. Charts derive dimensions from their pane, never the full window.
- Budget and Review use the same destination frame and their own two-column content.

### Albums

- Album library becomes a responsive grid beside a persistent trip summary or map preview.
- The map remains full-bleed within its pane. Selecting a marker and an album card share one selection
  model.

### Settings

- The home page uses a profile/summary column and a 4–5 column settings grid in expanded mode.
- Nested settings routes use templates B, D, E, or F. The settings stack and back behavior remain
  intact; responsive layout does not replace navigation semantics.

## Route coverage matrix

The matrix below maps every route to a shared responsive template. Baseline and image-generated
alternatives are captured once per distinct visual archetype, then applied through shared containers
and layout primitives; duplicating the same mockup for every route that uses the same renderer would
not add a design decision. Representative populated and empty states were verified for each changed
archetype in portrait, landscape, and compact width.

| Area                     | Routes/screens                                                                                                                                                                                  | Template                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Main                     | Calendar; Assets/Accounts; Assets/Goals; Assets/Items; Insights; Insights/Budget; Insights/Review; Albums/List; Albums/Map; SettingsHome                                                        | A, with B/E/F submodes     |
| Transactions             | AddTransaction; AddTransactionDetailed; EditTransaction; SplitBill; ReceiptSplit; SettleUp; SettleUpSettings; SettleUpPerson; SettleUpTransaction                                               | B/C                        |
| Accounts and goals       | AccountDetail; AccountEditor; PayCreditCard; AccountGroupEditor; GoalDetail; GoalEditor; SettingsAccounts                                                                                       | B/C                        |
| Pickers                  | AccountLogoPicker; SubscriptionLogoPicker; ItemIconPicker; CategoryIconPicker; category/account/currency/date picker presentations                                                              | E plus iPad popover policy |
| Insights and budgets     | InsightsDrilldown; BudgetTemplateEditor; BudgetMonthEditor; BudgetCategoryAllocation; SettingsBudgetTemplates                                                                                   | B/C/D                      |
| Albums                   | CreateAlbum; AlbumDetail; EditAlbumTransactions; AddAlbumTransactions; EditAlbumDetails; AlbumLocations/map panel                                                                               | B/C/F                      |
| Items                    | ItemEditor; Items manager                                                                                                                                                                       | B/C                        |
| Settings display/value   | DisplaySettings; AppIcon; MonthCycle; HourlyValue; HourlyValueSettings; AddWageMonth; SettingsTimeDisplay; WageCalculatorFlow                                                                   | C/D/E                      |
| Settings data            | AccountSettings; Accounts; Items; ExchangeRates; Categories; Recurring; DataManagement; AutoBackup; StatementImport; StatementImportList                                                        | B/C/D                      |
| Settings automation      | QuickEntrySettings; AutoLogSettings; AutoLogTutorial; Notifications; NotificationDetail                                                                                                         | C/D/F                      |
| Settings privacy/records | AppLock; Receipts; ReceiptSettings; Reimbursements; ReimbursementSettings                                                                                                                       | B/D                        |
| Settings product         | News; ProManagement; ProPaywall; ShareAndEarn; Widgets; WidgetPreviews                                                                                                                          | D/E/F                      |
| Tutorials                | Tutorials; TutorialDetail                                                                                                                                                                       | B/E/F                      |
| Live earnings            | LiveEarnings                                                                                                                                                                                    | D/F                        |
| Onboarding               | ValueProp; Source; Features; Preferences; Wage; Backup; Notifications; completion/bootstrap                                                                                                     | C/F                        |
| Global overlays          | AddActionSheet; QuickAdd; voice capture/preview; receipt scan banner/review; review pre-prompt; feature announcement; cloud backup prompt; theme modal; all bulk edit/filter/period/date sheets | iPad presentation policy   |

## Image-generation decision process

The completed concept pass used the following process for each distinct destination or route
archetype:

1. Capture the current UI on the iPhone and iPad in a stable populated or representative state.
2. Load the original capture as the edit/reference target.
3. Generate at least two landscape alternatives from the original capture: a conservative expansion
   and a platform-native split/workbench alternative. Calendar received a third compact-workbench
   exploration because its information architecture had three credible directions.
4. Preserve exact Money2Time colors, typography character, content, icons, and information semantics;
   do not invent features or change copy.
5. Score each variant from 1–5 for familiarity, information density, reachability, rotation continuity,
   implementation risk, and compact-layout isolation.
6. Record the chosen variant and rationale in `docs/ipad-design-decisions.md`. The resulting 15
   concept images are design evidence, not shipped runtime assets.

## Completed implementation sequence

1. Baseline and concepts — complete
   - Capture the five destinations and representative route archetypes on iPhone and iPad.
   - Produce and select concept sheets, then finish the complete screen matrix as each group begins.
2. Foundation — complete
   - Verify the generated native declarations keep the iPhone portrait-only while the iPad supports
     portrait and both landscape orientations; no configuration change was required.
   - Expand the device-layout hook and add responsive container, grid, split, presentation, and
     sidebar primitives with unit tests.
3. Main shell — complete
   - Add the expanded sidebar without replacing or remounting the existing tab screens.
   - Move destination actions into the correct expanded toolbars while preserving compact FAB/nav.
4. Five destinations — complete
   - Calendar, Assets, Insights, Albums, Settings, including each destination's internal mode.
5. Editors and collection workspaces — complete
   - Transactions, accounts/goals/items, albums, budgets, settle-up, receipts, and pickers.
6. Settings, tutorials, onboarding, and global overlays — complete through shared page-width and
   presentation primitives
   - Apply the shared templates to every remaining route and presentation state.
7. Review and hardening — complete
   - Static audit for fixed screen widths, absolute phone assumptions, raw full-window chart widths,
     and tablet-unaware modals.
   - Run typecheck, lint, formatting, unit tests, and any added responsive-layout tests.
   - Test iPad 11-inch and 13-inch portrait/landscape, resize where supported, and test iPhone Pro Max
     plus the compact iPhone SE QA device.
   - Verify light and dark; sample contrasting theme palettes; test representative long German text.
   - Check rotation/state continuity, keyboard avoidance, safe areas, pointer-sized hit targets,
     clipping, scroll reachability, selection toolbars, and modal dismissal.
8. PR
   - Self-review the complete diff, fix findings, capture final reviewer-accessible screenshots, and
     create a PR with the coverage matrix, verification commands, and visual evidence.

## Acceptance evidence

- iPhone regression captures cover the calendar, transaction editor, and album editor. The calendar
  pixel diff is limited to the existing RevenueCat development warning at the bottom edge.
- iPad validation captures cover all five destinations, album creation, album detail, transaction
  entry, populated and empty collections, portrait/landscape adaptation, and dark mode.
- The pure resolver test covers iPhone compact, iPad portrait, iPad landscape/sidebar, scoped child
  viewport, and narrow iPad multitasking behavior.
- `npm run check` and the full Jest suite are required to pass before the PR is opened.
- The final PR embeds reviewer-accessible portrait, landscape, dark-mode, editor, and iPhone
  screenshots from `docs/ipad-design/validation/`.
