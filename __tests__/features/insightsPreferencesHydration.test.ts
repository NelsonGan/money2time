import { shouldRestoreSavedAnchorForPreset } from '~/features/insights/insightsPreferencesHydration';

describe('shouldRestoreSavedAnchorForPreset', () => {
  it('restores the saved anchor for custom ranges', () => {
    expect(shouldRestoreSavedAnchorForPreset('custom')).toBe(true);
  });

  it('restores the saved anchor for the short-lived week preset', () => {
    expect(shouldRestoreSavedAnchorForPreset('week')).toBe(true);
  });

  it('re-anchors month presets to the current period instead of a stale one', () => {
    // Regression: the breakdown circle stayed pinned to the previously viewed
    // month (e.g. June once July began) because the persisted month anchor was
    // restored on launch.
    expect(shouldRestoreSavedAnchorForPreset('month')).toBe(false);
  });

  it('re-anchors year presets to the current period', () => {
    expect(shouldRestoreSavedAnchorForPreset('year')).toBe(false);
  });
});
