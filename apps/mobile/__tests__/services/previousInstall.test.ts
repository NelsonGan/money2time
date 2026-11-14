/**
 * iOS keeps an app's keychain when the app is deleted, so a reinstall finds
 * the old install's Cloud Sync session. A new install forgets it before the
 * session is read: the reinstall starts signed out, and the old session is
 * ended on the server.
 */

const store = new Map<string, string>();
const signOutSession = jest.fn((_token: string) => Promise.resolve());

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'afterFirstUnlockThisDeviceOnly',
  getItemAsync: jest.fn(async (key: string) => store.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    store.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    store.delete(key);
  }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));
jest.mock('~/features/cloudSync/services/cloudSyncApi', () => ({
  signOutSession: (token: string) => signOutSession(token),
}));
jest.mock('~/features/cloudSync/services/sessionUser', () => ({
  setCachedSessionUser: jest.fn(),
}));

const SESSION_KEY = 'm2t.cloudSync.session.v1';
const PENDING_SIGN_OUT_KEY = 'm2t.cloudSync.pendingSignOut.v1';
const oldSession = { token: 'old-token', user: { id: 'user-1' }, linked: true };

type Modules = {
  session: typeof import('~/features/cloudSync/services/cloudSyncSession');
  install: typeof import('~/services/previousInstall');
};

/** A fresh launch: the modules' in-memory state starts empty, the keychain stays. */
function launch(): Modules {
  let modules!: Modules;
  jest.isolateModules(() => {
    modules = {
      session: require('~/features/cloudSync/services/cloudSyncSession'),
      install: require('~/services/previousInstall'),
    };
  });
  return modules;
}

beforeEach(() => {
  store.clear();
  signOutSession.mockClear();
  store.set(SESSION_KEY, JSON.stringify(oldSession));
});

describe('a reinstall', () => {
  it('starts signed out and ends the old session on the server', async () => {
    const { session, install } = launch();
    void install.forgetPreviousInstall(() => session.forgetPreviousInstallSession());

    await expect(session.loadSession()).resolves.toBeNull();
    expect(store.has(SESSION_KEY)).toBe(false);
    expect(signOutSession).toHaveBeenCalledWith('old-token');
  });

  it('keeps an unfinished sign-out, which still has to reach the Worker', async () => {
    store.set(PENDING_SIGN_OUT_KEY, JSON.stringify({ token: 't', appUserId: 'm2t_old' }));
    const { session, install } = launch();
    await install.forgetPreviousInstall(() => session.forgetPreviousInstallSession());

    await expect(session.loadPendingSignOut()).resolves.toEqual({
      token: 't',
      appUserId: 'm2t_old',
    });
  });

  it('is not held up by a keychain that cannot be cleared', async () => {
    const { session, install } = launch();
    await install.forgetPreviousInstall(() => Promise.reject(new Error('keychain locked')));

    await expect(session.loadSession()).resolves.toEqual(oldSession);
  });

  it('asks nothing of the server when no session was left', async () => {
    store.clear();
    const { session, install } = launch();
    await install.forgetPreviousInstall(() => session.forgetPreviousInstallSession());

    await expect(session.loadSession()).resolves.toBeNull();
    expect(signOutSession).not.toHaveBeenCalled();
  });
});

describe('an existing install', () => {
  it('stays signed in across launches', async () => {
    const { session } = launch();
    await expect(session.loadSession()).resolves.toEqual(oldSession);
    expect(signOutSession).not.toHaveBeenCalled();
  });
});
