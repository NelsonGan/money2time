# iPad design decisions

This log records the image-generated alternatives used before each responsive screen group is
implemented. Scores are 1 (weak) through 5 (strong). `Risk` is scored inversely: 5 means low
implementation/regression risk.

## Calendar — populated day view

Original references:

- `docs/ipad-design/baselines/iphone-calendar-portrait.png`
- `docs/ipad-design/baselines/ipad-calendar-portrait.png`
- `docs/ipad-design/baselines/ipad-calendar-landscape.png`

Generated with the built-in image-generation tool in `ui-mockup` edit/reference mode. Each prompt
required an edge-to-edge 4:3 iPad landscape screen, the existing Money2Time palette and information,
the five existing destinations, no invented features, and no desktop chrome.

| Variant                             | Familiarity | Density | Reachability | Rotation continuity | Risk | Phone isolation | Total |
| ----------------------------------- | ----------: | ------: | -----------: | ------------------: | ---: | --------------: | ----: |
| A — conservative activity workspace |           5 |       4 |            5 |                   5 |    4 |               5 |    28 |
| B — calendar-first split view       |           4 |       5 |            5 |                   4 |    3 |               5 |    26 |
| C — compact workbench/table         |           3 |       5 |            4 |                   3 |    3 |               5 |    23 |

Decision: **B — calendar-first split view**.

Although A has the highest raw score, it uses the extra space mostly for a second summary rail and
leaves the primary experience as a long activity feed. B creates the strongest iPad-specific gain:
the month is persistent context and the selected day's transactions are a first-class detail pane.
It matches the app's calendar-first product model, avoids duplicate information, and maps cleanly to
the existing month-grid and day-list renderers. C is scan-efficient but feels like desktop accounting
software and changes the app's emotional tone.

Implementation constraints derived from B:

- Expanded layout only; compact iPhone and regular tablet portrait retain the current hierarchy.
- Reuse the existing month grid and transaction list rather than fork data or formatting logic.
- A day selection updates the detail pane without pushing a new route.
- The month pager, search/filter controls, selection state, and money/time toggle remain the same
  feature surface.
- Sidebar selection and compact bottom-nav selection share one `activeTab` state.

Artifacts:

- `docs/ipad-design/concepts/calendar-a-conservative.png`
- `docs/ipad-design/concepts/calendar-b-calendar-split.png`
- `docs/ipad-design/concepts/calendar-c-workbench.png`

## Accounts — collection workspace

Original reference: `docs/ipad-design/baselines/ipad-accounts-landscape.png`.

| Variant                            | Familiarity | Density | Reachability | Rotation continuity | Risk | Phone isolation | Total |
| ---------------------------------- | ----------: | ------: | -----------: | ------------------: | ---: | --------------: | ----: |
| A — balanced card grid             |           5 |       4 |            5 |                   5 |    5 |               5 |    29 |
| B — list with persistent inspector |           3 |       5 |            4 |                   3 |    2 |               5 |    22 |

Decision: **A — balanced card grid**.

The account model already communicates balances and account types well through cards. A wider
two-column collection increases scan efficiency without introducing a second selection model or
changing the existing account-detail navigation. The same collection treatment is shared by goals
and items, while portrait and compact widths remain single-column.

Artifacts:

- `docs/ipad-design/concepts/accounts-a-grid.png`
- `docs/ipad-design/concepts/accounts-b-inspector.png`

## Insights — analytical report

Original reference: `docs/ipad-design/baselines/ipad-insights-landscape.png`.

| Variant                       | Familiarity | Density | Reachability | Rotation continuity | Risk | Phone isolation | Total |
| ----------------------------- | ----------: | ------: | -----------: | ------------------: | ---: | --------------: | ----: |
| A — chart and breakdown split |           5 |       5 |            5 |                   4 |    4 |               5 |    28 |
| B — multi-card dashboard      |           3 |       5 |            4 |                   3 |    2 |               5 |    22 |

Decision: **A — chart and breakdown split**.

The selected report remains the unit of navigation, but its visualization and actionable rows can be
read together in landscape. This preserves the existing filters, period pager, drilldown behavior,
and report-specific logic. Chart and pager widths now come from the responsive work area instead of
the physical display, preventing hidden sidebar width from leaking into layout calculations.

Artifacts:

- `docs/ipad-design/concepts/insights-a-split.png`
- `docs/ipad-design/concepts/insights-b-dashboard.png`

## Albums — visual collection

Original references:

- `docs/ipad-design/baselines/ipad-albums-landscape.png`
- `docs/ipad-design/baselines/ipad-albums-populated-landscape.png`

| Variant                        | Familiarity | Density | Reachability | Rotation continuity | Risk | Phone isolation | Total |
| ------------------------------ | ----------: | ------: | -----------: | ------------------: | ---: | --------------: | ----: |
| A — responsive gallery         |           5 |       5 |            5 |                   5 |    4 |               5 |    29 |
| B — gallery with master detail |           3 |       5 |            4 |                   3 |    2 |               5 |    22 |

Decision: **A — responsive gallery**.

Albums are visual objects, so a 4:3 three-column gallery makes better use of landscape without
requiring a persistent selection. The active-album control moves into the scrollable canvas on
tablet, portrait uses two columns, and the compact layout retains the original single-column cards
and bottom control.

Artifacts:

- `docs/ipad-design/concepts/albums-a-gallery.png`
- `docs/ipad-design/concepts/albums-b-master-detail.png`

## Settings — destination dashboard

Original reference: `docs/ipad-design/baselines/ipad-settings-landscape.png`.

| Variant                         | Familiarity | Density | Reachability | Rotation continuity | Risk | Phone isolation | Total |
| ------------------------------- | ----------: | ------: | -----------: | ------------------: | ---: | --------------: | ----: |
| A — four-column preference grid |           5 |       5 |            5 |                   5 |    5 |               5 |    30 |
| B — two-column grouped lists    |           3 |       4 |            4 |                   4 |    3 |               4 |    22 |

Decision: **A — four-column preference grid**.

The current settings tiles already provide strong recognition through icon, label, and grouping.
Landscape expands that system to four columns and pairs the two promotional cards; portrait and
phone keep three columns and stacked promotions. Nested settings pages inherit a 900pt form canvas
through `SettingsPageLayout`, so linear pages gain breathing room without bespoke forks.

Artifacts:

- `docs/ipad-design/concepts/settings-a-four-column.png`
- `docs/ipad-design/concepts/settings-b-two-column-lists.png`

## Editors — album workbench and general forms

Original reference: `docs/ipad-design/baselines/ipad-album-editor-landscape.png`.

| Variant                  | Familiarity | Density | Reachability | Rotation continuity | Risk | Phone isolation | Total |
| ------------------------ | ----------: | ------: | -----------: | ------------------: | ---: | --------------: | ----: |
| A — cover and form split |           4 |       5 |            5 |                   4 |    4 |               5 |    27 |
| B — centered form card   |           5 |       4 |            5 |                   5 |    5 |               5 |    29 |

Decision: **A for album creation; B as the general editor policy**.

Album creation uniquely benefits from a large persistent cover preview, so it uses A in expanded
landscape and collapses to its original stack in portrait/compact widths. Transaction and other
linear editors use B: a centered 900pt workspace that prevents controls from stretching while
preserving their field order and behavior. This combines the strongest domain-specific preview with
the lowest-risk shared form treatment.

Artifacts:

- `docs/ipad-design/concepts/editor-a-split.png`
- `docs/ipad-design/concepts/editor-b-centered.png`

## Album detail — visual detail page

Original reference: `docs/ipad-design/baselines/ipad-album-detail-landscape.png`.

| Variant                              | Familiarity | Density | Reachability | Rotation continuity | Risk | Phone isolation | Total |
| ------------------------------------ | ----------: | ------: | -----------: | ------------------: | ---: | --------------: | ----: |
| A — compact master-detail workspace  |           3 |       5 |            4 |                   3 |    2 |               5 |    22 |
| B — panoramic hero with report split |           5 |       5 |            5 |                   5 |    4 |               5 |    29 |

Decision: **B — panoramic hero with report split**.

B retains the album's photographic identity and familiar tab structure, then uses the lower
landscape canvas for a chart/list split. Portrait and phone continue to stack the breakdown. The
detail pager now measures its actual container, which keeps tab paging correct when the content rail
is narrower than the physical window.

Artifacts:

- `docs/ipad-design/concepts/detail-a-master-detail.png`
- `docs/ipad-design/concepts/detail-b-panoramic-split.png`

## Validation summary

- iPad Pro 13-inch: all five destinations in landscape and portrait, plus album creation, album
  detail, transaction entry, goals/items empty states, and dark mode.
- iPhone 17 Pro Max: calendar, album editor, and transaction editor compact regression captures.
- Automated: responsive resolver unit tests, TypeScript, lint, formatting, and the complete Jest
  suite.
- Development-only caveat: RevenueCat displays its existing invalid-key warning in simulator builds;
  it is unrelated to responsive layout and accounts for the localized iPhone screenshot diff.
