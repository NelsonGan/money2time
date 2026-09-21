/**
 * Regression guard for the connection cached by `getSQLite`.
 *
 * The pragmas in `applyPragmas` are per-connection and are applied exactly
 * once, right after the connection opens. `getSQLite` used to assign its
 * module-level cache BEFORE running them, so a launch where they failed still
 * memoized the connection: every later call — including the one behind the
 * user's Retry tap on the data-load error card — handed back a connection with
 * `foreign_keys` OFF and no WAL, for the rest of the session, silently.
 *
 * That mattered because those failures are real and recoverable: on iOS the
 * whole database can be briefly unreadable on a background launch, which is
 * what Sentry MONEY2TIME-2G / -2H / -2S are.
 */

declare const global: Record<string, unknown>;
global.__DEV__ = false;

const openDatabaseSync = jest.fn();

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: (...args: unknown[]) => openDatabaseSync(...args),
}));
jest.mock('../../lib/db/migrations', () => ({ runMigrations: jest.fn() }));
jest.mock('../../lib/db/backfillFirstAppOpen', () => ({ backfillFirstAppOpen: jest.fn() }));
// Real sleeps would make the 5 pragma retries take ~630ms per failing case.
jest.mock('../../lib/db/busyWaitSync', () => ({ busyWaitSync: jest.fn() }));

function makeConnection(execSync: jest.Mock) {
  return { execSync, closeSync: jest.fn() };
}

describe('getSQLite', () => {
  beforeEach(() => {
    jest.resetModules();
    openDatabaseSync.mockReset();
  });

  it('caches a connection whose pragmas applied', () => {
    const connection = makeConnection(jest.fn());
    openDatabaseSync.mockReturnValue(connection);

    const { getSQLite } = require('../../lib/db/client');

    expect(getSQLite()).toBe(connection);
    expect(getSQLite()).toBe(connection);
    expect(openDatabaseSync).toHaveBeenCalledTimes(1);
    // Applied once, on the open that created it.
    expect(connection.execSync).toHaveBeenCalledTimes(1);
  });

  it('does not cache a connection whose pragmas failed, and closes it', () => {
    const failed = makeConnection(
      jest.fn(() => {
        throw new Error('disk I/O error');
      }),
    );
    openDatabaseSync.mockReturnValue(failed);

    const { getSQLite } = require('../../lib/db/client');

    expect(() => getSQLite()).toThrow('disk I/O error');
    expect(failed.closeSync).toHaveBeenCalledTimes(1);

    // The retry opens a NEW connection and configures it, rather than handing
    // back the unconfigured one the failed attempt left behind.
    const healthy = makeConnection(jest.fn());
    openDatabaseSync.mockReturnValue(healthy);

    expect(getSQLite()).toBe(healthy);
    expect(healthy.execSync).toHaveBeenCalledTimes(1);
    expect(openDatabaseSync).toHaveBeenCalledTimes(2);
  });

  it('still surfaces the pragma failure when the connection cannot be closed', () => {
    const failed = {
      execSync: jest.fn(() => {
        throw new Error('disk I/O error');
      }),
      closeSync: jest.fn(() => {
        throw new Error('close failed');
      }),
    };
    openDatabaseSync.mockReturnValue(failed);

    const { getSQLite } = require('../../lib/db/client');

    // The pragma error is the actionable one; a failing close must not mask it.
    expect(() => getSQLite()).toThrow('disk I/O error');
  });
});
