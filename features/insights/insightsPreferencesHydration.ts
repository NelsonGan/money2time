// Period presets fall into two groups when restoring persisted Insights
// preferences on launch:
//
//   * `custom` pins an explicit historical window the user deliberately chose,
//     so its saved anchor is restored verbatim.
//   * `week` is short-lived; keeping its saved anchor across a relaunch is
//     harmless and preserves the exact week the user was viewing.
//   * `month` / `year` are relative "current period" views. Restoring their
//     persisted anchor left the breakdown pinned to a stale period across
//     sessions — e.g. still showing June's spending after July began. These
//     always re-anchor to the current period instead.
type InsightPeriodPreset = 'week' | 'month' | 'year' | 'custom';

export function shouldRestoreSavedAnchorForPreset(preset: InsightPeriodPreset): boolean {
  return preset === 'week' || preset === 'custom';
}
