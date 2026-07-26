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
}

interface GoogleSigninMock {
  configure: jest.Mock;
  hasPreviousSignIn: jest.Mock<boolean, []>;
  getCurrentUser: jest.Mock<MockUser | null, []>;
  signInSilently: jest.Mock;
  signIn: jest.Mock;
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
