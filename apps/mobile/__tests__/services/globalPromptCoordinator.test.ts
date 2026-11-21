import {
  isAnyPromptVisible,
  markPromptHidden,
  markPromptVisible,
  resetGlobalPromptCoordinator,
  subscribePromptChanges,
} from '~/services/globalPromptCoordinator';

describe('globalPromptCoordinator', () => {
  beforeEach(() => {
    resetGlobalPromptCoordinator();
  });

  it('reports nothing visible initially', () => {
    expect(isAnyPromptVisible()).toBe(false);
    expect(isAnyPromptVisible('cloudBackupPrompt')).toBe(false);
  });

  it('tracks a visible prompt', () => {
    markPromptVisible('reviewPrePrompt');
    expect(isAnyPromptVisible()).toBe(true);
  });

  it('excludes the caller via excludeId', () => {
    markPromptVisible('cloudBackupPrompt');
    // Only itself is visible, so from its own perspective nothing else is up.
    expect(isAnyPromptVisible('cloudBackupPrompt')).toBe(false);
    expect(isAnyPromptVisible('reviewPrePrompt')).toBe(true);
  });

  it('sees a different prompt even when excluding itself', () => {
    markPromptVisible('reviewPrePrompt');
    markPromptVisible('cloudBackupPrompt');
    expect(isAnyPromptVisible('cloudBackupPrompt')).toBe(true);
  });

  it('clears a prompt on hide', () => {
    markPromptVisible('featureAnnouncement');
    markPromptHidden('featureAnnouncement');
    expect(isAnyPromptVisible()).toBe(false);
  });
});

describe('prompt change subscriptions', () => {
  beforeEach(() => {
    resetGlobalPromptCoordinator();
  });

  it('tells a waiting prompt when another shows or hides, once per real change', () => {
    const listener = jest.fn();
    const unsubscribe = subscribePromptChanges(listener);
    markPromptVisible('goalCelebration');
    markPromptVisible('goalCelebration');
    expect(listener).toHaveBeenCalledTimes(1);
    markPromptHidden('goalCelebration');
    markPromptHidden('goalCelebration');
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    markPromptVisible('reviewPrePrompt');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('counts the celebrations and the Locations offer like any prompt', () => {
    markPromptVisible('loanCelebration');
    expect(isAnyPromptVisible('locationsOffer')).toBe(true);
    markPromptHidden('loanCelebration');
    markPromptVisible('locationsOffer');
    expect(isAnyPromptVisible('reviewPrePrompt')).toBe(true);
    expect(isAnyPromptVisible('locationsOffer')).toBe(false);
  });
});
