// What a deleted install left behind. iOS keeps an app's keychain entries
// when the app is deleted, while the database, AsyncStorage and files go, so a
// reinstall would find the old Cloud Sync session and Web Dashboard links and
// carry on with them on a phone that no longer has the data they were for.
// A new install (`initializeDatabase().isNewInstall`) forgets them before
// anything reads the keychain; see README.md > Cloud Sync.

let forgetting: Promise<void> = Promise.resolve();

/**
 * Runs `forget` for this launch's new install. Readers of the keychain wait
 * for it through {@link previousInstallForgotten}; a failure is swallowed, so
 * a keychain that cannot be read never blocks a launch.
 */
export function forgetPreviousInstall(forget: () => Promise<unknown>): Promise<void> {
  forgetting = forget().then(
    () => undefined,
    () => undefined,
  );
  return forgetting;
}

/** Resolves once a new install has forgotten the previous one (at once otherwise). */
export function previousInstallForgotten(): Promise<void> {
  return forgetting;
}
