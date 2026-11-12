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
