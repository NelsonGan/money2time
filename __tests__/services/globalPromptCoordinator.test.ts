import {
  isAnyPromptVisible,
  markPromptHidden,
  markPromptVisible,
  resetGlobalPromptCoordinator,
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
    markPromptVisible('tutorialPrompt');
    markPromptHidden('tutorialPrompt');
    expect(isAnyPromptVisible()).toBe(false);
  });
});
