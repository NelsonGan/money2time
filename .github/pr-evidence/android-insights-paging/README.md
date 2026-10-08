# Android expense breakdown paging verification

Tested on the visible `m2t_pixel` Android emulator (`sdk_gphone64_arm64`,
Android 16 / API 36), using the local development app and SQLite data with
7,099 transactions. Before screenshots used the original pager implementation
from `e073dd9a`; after screenshots used this branch. The data stayed identical.

## Reproduction and comparison

1. Open Insights and choose Expense Breakdown.
2. Select October 2024 in the month picker.
3. Swipe right six times to reach April 2024. Each swipe took 350 ms with
   900 ms between swipes, across the chart area.
4. Wait for scrolling to finish and inspect the chart, total, and category rows.

| Observation                                     | Before                                                   | After                               |
| ----------------------------------------------- | -------------------------------------------------------- | ----------------------------------- |
| Header                                          | April 2024                                               | April 2024                          |
| Chart, total, category rows                     | Completely blank; still blank more than 20 seconds later | Visible pie chart and category rows |
| April expenses in memory                        | 82 expenses, 10 categories, RM5,178.69                   | Same data; visible total RM5,178.69 |
| Native current-page width / horizontal position | 0 / -411.4 dp                                            | 411.4 / 0 dp                        |
| Horizontal pager clipping                       | Enabled by Android default                               | Explicitly disabled                 |

Screenshots: [before](before.png) and [after](after.png). These captures show only
the breakdown, with no account names or transaction notes.

## Additional verification

- Repeated six forward and six backward native swipes with shorter pauses;
  returned to April with the same correct total and visible chart.
- Delivered three consecutive momentum callbacks in one JavaScript task,
  before another React render. Starting from April, the pager reached January
  with RM11,885.62, matching its 59 stored expenses. This exercises the queued
  callback bug independently of gesture timing.
- Android calendar activity month swipes also displayed transaction rows.
- The strengthened clipping guard fails both source checks against the baseline.
  Five period-commit tests cover queued callbacks, reversal, duplicates, a new
  render snapshot, and skipped pages. Three fail with the old calculation.
- `npm run check`: type checking, linting, and formatting passed.
- `npm test -- --runInBand`: 174 suites and 2,460 tests passed.
- Screenshot comparison detected the restored chart, total, and category rows;
  both images have the same dimensions and month header.

## Remaining coverage

iOS manual testing was unavailable because this machine's configured Xcode
installation has no Simulator application. Accounts history and album month
selection were not manually retested. The shared configuration change only
disables Android's default clipping; existing pagination window limits remain.
Other insights share the corrected page layout and period commits, but their
individual chart interactions were not exhaustively retested.

Analytics events, payloads, routing, and event frequency are unchanged.
