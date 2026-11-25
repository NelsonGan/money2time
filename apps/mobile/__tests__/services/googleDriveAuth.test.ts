/**
 * Regression coverage for the Google Drive session restore.
 *
 * The native SDK remembers the account across launches (`hasPreviousSignIn()`
 * stays true) but drops the in-memory session, so `getTokens()` rejects with
 * "getTokens requires a user to be signed in" until `signInSilently()` rebuilds
 * it. Skipping that restore made every backup after an app restart look signed
 * out, and the backup silently landed on the device instead of Drive.
 */

interface MockUser {
  user: { email: string };
  scopes?: string[];
}

interface GoogleSigninMock {
  configure: jest.Mock;
  hasPreviousSignIn: jest.Mock<boolean, []>;
  getCurrentUser: jest.Mock<MockUser | null, []>;
  signInSilently: jest.Mock;
  signIn: jest.Mock;
  addScopes: jest.Mock;
  signOut: jest.Mock;
  getTokens: jest.Mock;
  clearCachedAccessToken: jest.Mock;
  hasPlayServices: jest.Mock;
}

const googleSignin: GoogleSigninMock = {
  configure: jest.fn(),
  hasPreviousSignIn: jest.fn(() => false),
  getCurrentUser: jest.fn(() => null),
  signInSilently: jest.fn(),
  signIn: jest.fn(),
  addScopes: jest.fn(),
  signOut: jest.fn(),
  getTokens: jest.fn(),
  clearCachedAccessToken: jest.fn(),
  hasPlayServices: jest.fn(),
};

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: googleSignin,
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  },
}));

type AuthModule = typeof import('~/services/autoBackupProviders/googleDriveAuth');

// The module caches the in-flight restore, so each test gets a fresh copy.
function loadAuth(): AuthModule {
  let mod!: AuthModule;
  jest.isolateModules(() => {
    mod = require('~/services/autoBackupProviders/googleDriveAuth') as AuthModule;
  });
  return mod;
}

const ACCOUNT: MockUser = { user: { email: 'someone@example.com' } };

/** Mimics the native side: the account is remembered, the session is not. */
function coldLaunchWithRememberedAccount() {
  googleSignin.hasPreviousSignIn.mockReturnValue(true);
  googleSignin.getCurrentUser.mockReturnValue(null);
  googleSignin.signInSilently.mockImplementation(async () => {
    // restorePreviousSignIn populates currentUser as a side effect
    googleSignin.getCurrentUser.mockReturnValue(ACCOUNT);
    return { type: 'success', data: ACCOUNT };
  });
  googleSignin.getTokens.mockImplementation(async () => {
    if (!googleSignin.getCurrentUser()) {
      throw new Error('getTokens requires a user to be signed in');
    }
    return { idToken: 'id', accessToken: 'access-token' };
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  googleSignin.hasPreviousSignIn.mockReturnValue(false);
  googleSignin.getCurrentUser.mockReturnValue(null);
});

describe('ensureGoogleSession', () => {
  it('restores the session after an app restart', async () => {
    coldLaunchWithRememberedAccount();
    const auth = loadAuth();

    await expect(auth.ensureGoogleSession()).resolves.toBe(true);
    expect(googleSignin.signInSilently).toHaveBeenCalledTimes(1);
  });

  it('does not call signInSilently when a live session already exists', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.getCurrentUser.mockReturnValue(ACCOUNT);
    const auth = loadAuth();

    await expect(auth.ensureGoogleSession()).resolves.toBe(true);
    expect(googleSignin.signInSilently).not.toHaveBeenCalled();
  });

  it('reports no session when the user never signed in', async () => {
    const auth = loadAuth();

    await expect(auth.ensureGoogleSession()).resolves.toBe(false);
    expect(googleSignin.signInSilently).not.toHaveBeenCalled();
  });

  it('reports no session when the saved credential is gone', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.signInSilently.mockResolvedValue({ type: 'noSavedCredentialFound', data: null });
    const auth = loadAuth();

    await expect(auth.ensureGoogleSession()).resolves.toBe(false);
  });

  it('reports no session when the silent restore throws', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.signInSilently.mockRejectedValue(new Error('network error'));
    const auth = loadAuth();

    await expect(auth.ensureGoogleSession()).resolves.toBe(false);
  });

  it('dedupes concurrent restores into one native call', async () => {
    coldLaunchWithRememberedAccount();
    const auth = loadAuth();

    const results = await Promise.all([
      auth.ensureGoogleSession(),
      auth.ensureGoogleSession(),
      auth.ensureGoogleSession(),
    ]);

    expect(results).toEqual([true, true, true]);
    expect(googleSignin.signInSilently).toHaveBeenCalledTimes(1);
  });

  it('restores again on a later call after a failed attempt', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.signInSilently.mockRejectedValueOnce(new Error('offline'));
    const auth = loadAuth();

    await expect(auth.ensureGoogleSession()).resolves.toBe(false);

    googleSignin.signInSilently.mockResolvedValueOnce({ type: 'success', data: ACCOUNT });
    await expect(auth.ensureGoogleSession()).resolves.toBe(true);
    expect(googleSignin.signInSilently).toHaveBeenCalledTimes(2);
  });
});

describe('getGoogleAccessToken', () => {
  it('returns a token after an app restart instead of null', async () => {
    coldLaunchWithRememberedAccount();
    const auth = loadAuth();

    await expect(auth.getGoogleAccessToken()).resolves.toBe('access-token');
  });

  it('returns null when nothing was ever signed in', async () => {
    const auth = loadAuth();

    await expect(auth.getGoogleAccessToken()).resolves.toBeNull();
    expect(googleSignin.getTokens).not.toHaveBeenCalled();
  });

  it('forces a fresh restore when the refresh is rejected once', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.getCurrentUser.mockReturnValue(ACCOUNT);
    googleSignin.getTokens
      .mockRejectedValueOnce(new Error('token revoked'))
      .mockResolvedValueOnce({ idToken: 'id', accessToken: 'fresh-token' });
    googleSignin.signInSilently.mockResolvedValue({ type: 'success', data: ACCOUNT });
    const auth = loadAuth();

    await expect(auth.getGoogleAccessToken()).resolves.toBe('fresh-token');
    // Forced: the restore runs even though getCurrentUser() is non-null.
    expect(googleSignin.signInSilently).toHaveBeenCalledTimes(1);
  });

  it('gives up when the forced restore also fails', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.getCurrentUser.mockReturnValue(ACCOUNT);
    googleSignin.getTokens.mockRejectedValue(new Error('token revoked'));
    googleSignin.signInSilently.mockResolvedValue({ type: 'noSavedCredentialFound', data: null });
    const auth = loadAuth();

    await expect(auth.getGoogleAccessToken()).resolves.toBeNull();
  });
});

describe('getGoogleAccountEmail', () => {
  it('reports the remembered account after an app restart', async () => {
    coldLaunchWithRememberedAccount();
    const auth = loadAuth();

    await expect(auth.getGoogleAccountEmail()).resolves.toBe('someone@example.com');
  });

  it('reports no account when the session cannot be restored', async () => {
    const auth = loadAuth();

    await expect(auth.getGoogleAccountEmail()).resolves.toBeNull();
  });
});

describe('signOutFromGoogle', () => {
  it('clears the cached restore so a later sign-in is re-evaluated', async () => {
    coldLaunchWithRememberedAccount();
    const auth = loadAuth();
    await auth.ensureGoogleSession();

    googleSignin.signOut.mockResolvedValue(null);
    await auth.signOutFromGoogle();

    googleSignin.hasPreviousSignIn.mockReturnValue(false);
    googleSignin.getCurrentUser.mockReturnValue(null);
    await expect(auth.ensureGoogleSession()).resolves.toBe(false);
  });
});

/**
 * Google's consent screen lets people untick "See, edit, create and delete
 * the Google Drive files you use with this app". Sign-in still succeeds, but
 * the token cannot reach Drive: every backup then failed with 403
 * `insufficientPermissions` (19 users in the first days of 1.7.4, all of that
 * build's Drive failures) and nothing was written anywhere.
 */
describe('Drive access left out at sign-in', () => {
  const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const BASIC = ['openid', 'https://www.googleapis.com/auth/userinfo.email'];
  const WITHOUT_DRIVE: MockUser = { user: { email: 'someone@example.com' }, scopes: BASIC };
  const WITH_DRIVE: MockUser = {
    user: { email: 'someone@example.com' },
    scopes: [...BASIC, DRIVE_SCOPE],
  };

  it('does not count a session without Drive access as connected', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.getCurrentUser.mockReturnValue(WITHOUT_DRIVE);
    const auth = loadAuth();

    await expect(auth.ensureGoogleSession()).resolves.toBe(false);
    await expect(auth.getGoogleAccountEmail()).resolves.toBeNull();
  });

  it('does not count a restored session without Drive access as connected', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.signInSilently.mockImplementation(async () => {
      googleSignin.getCurrentUser.mockReturnValue(WITHOUT_DRIVE);
      return { type: 'success', data: WITHOUT_DRIVE };
    });
    const auth = loadAuth();

    await expect(auth.ensureGoogleSession()).resolves.toBe(false);
  });

  it('hands out no token Drive would refuse', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.getCurrentUser.mockReturnValue(WITHOUT_DRIVE);
    googleSignin.signInSilently.mockResolvedValue({ type: 'success', data: WITHOUT_DRIVE });
    googleSignin.getTokens.mockResolvedValue({ idToken: 'id', accessToken: 'no-drive-token' });
    const auth = loadAuth();

    await expect(auth.getGoogleAccessToken()).resolves.toBeNull();
  });

  it('counts a session with Drive access as connected', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.getCurrentUser.mockReturnValue(WITH_DRIVE);
    const auth = loadAuth();

    await expect(auth.ensureGoogleSession()).resolves.toBe(true);
  });

  it('asks for Drive access again when the consent screen left it out', async () => {
    googleSignin.signIn.mockImplementation(async () => {
      googleSignin.getCurrentUser.mockReturnValue(WITHOUT_DRIVE);
      return { type: 'success', data: WITHOUT_DRIVE };
    });
    googleSignin.addScopes.mockImplementation(async () => {
      googleSignin.getCurrentUser.mockReturnValue(WITH_DRIVE);
      return { type: 'success', data: WITH_DRIVE };
    });
    const auth = loadAuth();

    await expect(auth.signInWithGoogle()).resolves.toEqual({
      ok: true,
      email: 'someone@example.com',
    });
    expect(googleSignin.addScopes).toHaveBeenCalledWith({ scopes: [DRIVE_SCOPE] });
  });

  it('does not connect when Drive access is refused again', async () => {
    googleSignin.signIn.mockImplementation(async () => {
      googleSignin.getCurrentUser.mockReturnValue(WITHOUT_DRIVE);
      return { type: 'success', data: WITHOUT_DRIVE };
    });
    googleSignin.addScopes.mockResolvedValue({ type: 'cancelled', data: null });
    const auth = loadAuth();

    await expect(auth.signInWithGoogle()).resolves.toEqual({ ok: false, reason: 'cancelled' });
  });

  it('treats a refusal Android reports as an error like a cancel', async () => {
    googleSignin.signIn.mockImplementation(async () => {
      googleSignin.getCurrentUser.mockReturnValue(WITHOUT_DRIVE);
      return { type: 'success', data: WITHOUT_DRIVE };
    });
    googleSignin.addScopes.mockRejectedValue(
      Object.assign(new Error('Failed to add scopes.'), { code: 'addScopes' }),
    );
    const auth = loadAuth();

    await expect(auth.signInWithGoogle()).resolves.toEqual({ ok: false, reason: 'cancelled' });
  });

  it("still gives Cloud Sync's Google sign-in the ID token", async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.getCurrentUser.mockReturnValue(WITHOUT_DRIVE);
    googleSignin.signInSilently.mockResolvedValue({ type: 'success', data: WITHOUT_DRIVE });
    googleSignin.getTokens.mockResolvedValue({ idToken: 'id-token', accessToken: 'no-drive' });
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID = 'web-client';
    const auth = loadAuth();
    delete process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID;

    await expect(auth.getGoogleIdToken()).resolves.toEqual({ ok: true, idToken: 'id-token' });
  });

  it('reports any other addScopes failure as an error, not a cancel', async () => {
    googleSignin.signIn.mockResolvedValue({ type: 'success', data: WITHOUT_DRIVE });
    googleSignin.addScopes.mockRejectedValue(
      Object.assign(new Error('Current activity is null.'), { code: 'NULL_PRESENTER' }),
    );
    const auth = loadAuth();

    await expect(auth.signInWithGoogle()).resolves.toEqual({
      ok: false,
      reason: 'error',
      message: 'Current activity is null.',
    });
  });

  it('connects when the grant succeeded but Android read the account back empty', async () => {
    googleSignin.signIn.mockImplementation(async () => {
      googleSignin.getCurrentUser.mockReturnValue(WITHOUT_DRIVE);
      return { type: 'success', data: WITHOUT_DRIVE };
    });
    googleSignin.addScopes.mockImplementation(async () => {
      googleSignin.getCurrentUser.mockReturnValue(WITH_DRIVE);
      return { type: 'noSavedCredentialFound', data: null };
    });
    const auth = loadAuth();

    await expect(auth.signInWithGoogle()).resolves.toEqual({
      ok: true,
      email: 'someone@example.com',
    });
  });

  it('counts full Drive access as covering backups', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.getCurrentUser.mockReturnValue({
      user: { email: 'someone@example.com' },
      scopes: [...BASIC, 'https://www.googleapis.com/auth/drive'],
    });
    const auth = loadAuth();

    await expect(auth.ensureGoogleSession()).resolves.toBe(true);
  });

  it("restores Cloud Sync's sign-in without asking for Drive on Android", async () => {
    // Android: the remembered account is readable before the restore, and a
    // silent sign-in that asks for a scope it never granted fails.
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.getCurrentUser.mockReturnValue(WITHOUT_DRIVE);
    googleSignin.signInSilently.mockImplementation(async () => {
      const config = googleSignin.configure.mock.lastCall?.[0] as { scopes?: string[] };
      if (config.scopes?.includes(DRIVE_SCOPE)) return { type: 'noSavedCredentialFound' };
      return { type: 'success', data: WITHOUT_DRIVE };
    });
    googleSignin.getTokens.mockResolvedValue({ idToken: 'id-token', accessToken: 'no-drive' });
    process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID = 'web-client';
    const auth = loadAuth();
    delete process.env.EXPO_PUBLIC_GOOGLE_OAUTH_WEB_CLIENT_ID;

    await expect(auth.getGoogleIdToken()).resolves.toEqual({ ok: true, idToken: 'id-token' });
    expect(googleSignin.signIn).not.toHaveBeenCalled();
    expect(googleSignin.signOut).not.toHaveBeenCalled();
  });

  it('does not ask again when Drive access was granted the first time', async () => {
    googleSignin.signIn.mockResolvedValue({ type: 'success', data: WITH_DRIVE });
    const auth = loadAuth();

    await expect(auth.signInWithGoogle()).resolves.toEqual({
      ok: true,
      email: 'someone@example.com',
    });
    expect(googleSignin.addScopes).not.toHaveBeenCalled();
  });
});

/**
 * Since Drive access is checked, a Drive that cannot be reached is reported as
 * `unavailable` once a day, and analytics could not tell a person who never
 * granted Drive (they must reconnect) from a session that failed to restore.
 */
describe('getGoogleDriveSessionState', () => {
  it('reports a phone that never signed in to Google as signed out', async () => {
    const auth = loadAuth();

    await expect(auth.getGoogleDriveSessionState()).resolves.toBe('signed_out');
  });

  it('reports a remembered account whose session cannot be restored', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.signInSilently.mockRejectedValue(new Error('network error'));
    const auth = loadAuth();

    await expect(auth.getGoogleDriveSessionState()).resolves.toBe('session_unavailable');
  });

  it('reports an account that never granted Drive access', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.getCurrentUser.mockReturnValue({
      user: { email: 'someone@example.com' },
      scopes: ['openid', 'https://www.googleapis.com/auth/userinfo.email'],
    });
    const auth = loadAuth();

    await expect(auth.getGoogleDriveSessionState()).resolves.toBe('no_drive_access');
  });

  it('reports a restored session with Drive access as connected', async () => {
    coldLaunchWithRememberedAccount();
    const auth = loadAuth();

    await expect(auth.getGoogleDriveSessionState()).resolves.toBe('connected');
  });
});

/**
 * Android's SDK keeps one pending promise per call (`PromiseWrapper` in
 * RNGoogleSigninModule): a call made while the last one is still running
 * rejects that one with ASYNC_OP_IN_PROGRESS, and the first native task to
 * finish settles whichever promise is pending then. `overlaps` counts the
 * calls that were rejected that way.
 */
function androidNativeCall<T>(run: () => T) {
  const state = { overlaps: 0 };
  let resolvePending: ((value: T) => void) | null = null;
  let rejectPending: ((error: Error) => void) | null = null;
  const mock = jest.fn(
    () =>
      new Promise<T>((resolve, reject) => {
        if (rejectPending) {
          state.overlaps += 1;
          rejectPending(
            Object.assign(
              new Error('Warning: previous promise did not settle and was overwritten.'),
              {
                code: 'ASYNC_OP_IN_PROGRESS',
              },
            ),
          );
        }
        const value = run();
        resolvePending = resolve;
        rejectPending = reject;
        setTimeout(() => {
          const settle = resolvePending;
          resolvePending = null;
          rejectPending = null;
          settle?.(value);
        }, 0);
      }),
  );
  return { mock, state };
}

describe('token calls on Android', () => {
  // Backups store up to three photos on Drive at once (#784), and each Drive
  // request asks for the access token. On Android the overlapping calls
  // rejected each other, so a request found no token and the run reported
  // "Google Drive: not signed in" (error_kind auth) and fell back to the phone.
  function liveSession() {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.getCurrentUser.mockReturnValue(ACCOUNT);
    googleSignin.signInSilently.mockResolvedValue({ type: 'success', data: ACCOUNT });
  }

  it('hands every concurrent Drive request a token', async () => {
    liveSession();
    const tokens = androidNativeCall(() => ({ idToken: 'id', accessToken: 'access-token' }));
    googleSignin.getTokens.mockImplementation(tokens.mock);
    const auth = loadAuth();

    const results = await Promise.all([
      auth.getGoogleAccessToken(),
      auth.getGoogleAccessToken(),
      auth.getGoogleAccessToken(),
    ]);

    expect(results).toEqual(['access-token', 'access-token', 'access-token']);
    expect(tokens.state.overlaps).toBe(0);
  });

  it('never runs a token clear beside a token read', async () => {
    liveSession();
    let cached = 'old-token';
    const tokens = androidNativeCall(() => ({ idToken: 'id', accessToken: cached }));
    const clears = androidNativeCall(() => {
      cached = 'new-token';
      return null;
    });
    // Reads and clears have separate native promises, so count the two together.
    let running = 0;
    let mostAtOnce = 0;
    const counted =
      <T>(call: () => Promise<T>) =>
      () => {
        running += 1;
        mostAtOnce = Math.max(mostAtOnce, running);
        return call().finally(() => {
          running -= 1;
        });
      };
    googleSignin.getTokens.mockImplementation(counted(tokens.mock));
    googleSignin.clearCachedAccessToken.mockImplementation(counted(clears.mock));
    const auth = loadAuth();

    await Promise.all([
      auth.clearGoogleTokenCache('old-token'),
      auth.getGoogleAccessToken(),
      auth.clearGoogleTokenCache('old-token'),
    ]);

    expect(mostAtOnce).toBe(1);
    expect(tokens.state.overlaps + clears.state.overlaps).toBe(0);
  });

  it('reads a fresh token after a clear instead of sharing the one read before it', async () => {
    liveSession();
    let cached = 'old-token';
    const reads: Array<() => void> = [];
    // Each read settles only when the test lets it, with the token cached when it started.
    googleSignin.getTokens.mockImplementation(() => {
      const token = cached;
      return new Promise((resolve) => {
        reads.push(() => resolve({ idToken: 'id', accessToken: token }));
      });
    });
    googleSignin.clearCachedAccessToken.mockImplementation(async () => {
      cached = 'new-token';
    });
    const auth = loadAuth();

    const before = auth.getGoogleAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(googleSignin.getTokens).toHaveBeenCalledTimes(1);
    const cleared = auth.clearGoogleTokenCache('old-token');
    const after = auth.getGoogleAccessToken();
    reads.shift()!();
    await expect(before).resolves.toBe('old-token');
    await cleared;
    await new Promise((resolve) => setTimeout(resolve, 0));
    reads.shift()!();

    await expect(after).resolves.toBe('new-token');
  });

  it('retries with its own read after a restore, not one started before it finished', async () => {
    googleSignin.hasPreviousSignIn.mockReturnValue(true);
    googleSignin.getCurrentUser.mockReturnValue(ACCOUNT);
    let finishRestore!: () => void;
    googleSignin.signInSilently
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRestore = () => resolve({ type: 'success', data: ACCOUNT });
          }),
      )
      .mockResolvedValue({ type: 'success', data: ACCOUNT });
    let failReadDuringRestore!: () => void;
    googleSignin.getTokens
      .mockRejectedValueOnce(new Error('token revoked'))
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            failReadDuringRestore = () => reject(new Error('token revoked'));
          }),
      )
      .mockResolvedValue({ idToken: 'id', accessToken: 'fresh-token' });
    const auth = loadAuth();

    const first = auth.getGoogleAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Another request reads while the first one's restore is still running.
    const second = auth.getGoogleAccessToken();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(googleSignin.getTokens).toHaveBeenCalledTimes(2);
    finishRestore();
    await new Promise((resolve) => setTimeout(resolve, 0));
    failReadDuringRestore();

    await expect(first).resolves.toBe('fresh-token');
    await expect(second).resolves.toBe('fresh-token');
  });

  it('does not let a token read that never settles hold up later requests', async () => {
    jest.useFakeTimers();
    try {
      liveSession();
      // Android can park a read behind a consent screen that is never answered.
      googleSignin.getTokens
        .mockReturnValueOnce(new Promise(() => undefined))
        .mockResolvedValue({ idToken: 'id', accessToken: 'fresh-token' });
      googleSignin.clearCachedAccessToken.mockResolvedValue(null);
      const auth = loadAuth();

      const first = auth.getGoogleAccessToken();
      await jest.advanceTimersByTimeAsync(0);
      expect(googleSignin.getTokens).toHaveBeenCalledTimes(1);
      const second = auth.getGoogleAccessToken();
      const cleared = auth.clearGoogleTokenCache('old-token');
      await jest.advanceTimersByTimeAsync(29_000);
      expect(googleSignin.clearCachedAccessToken).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1_000);
      await cleared;
      expect(googleSignin.clearCachedAccessToken).toHaveBeenCalledWith('old-token');
      await expect(first).resolves.toBe('fresh-token');
      await expect(second).resolves.toBe('fresh-token');
    } finally {
      jest.useRealTimers();
    }
  });
});
