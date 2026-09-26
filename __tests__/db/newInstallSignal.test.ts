/**
 * `initializeDatabase().isNewInstall` is what fires `First App Open`, which
 * stands in for Mixpanel's automatic `$ae_first_open` now that those events are
 * off. It has to be true exactly once per install: on the call that seeds the
 * settings row (and with it the install's appUserId), never on a later load, a
 * retry, or an existing install's launch.
 */

declare const global: Record<string, unknown>;
global.__DEV__ = false;

let mockSettingsRow: Record<string, unknown> | undefined;
const mockInsertedRows: Record<string, unknown>[] = [];

// Just enough of the Drizzle chain `ensureCoreData` walks.
const mockDb = {
  select: () => ({ from: () => ({ where: () => ({ get: () => mockSettingsRow }) }) }),
  insert: () => ({
    values: (row: Record<string, unknown>) => ({
      run: () => {
        mockInsertedRows.push(row);
        mockSettingsRow = row;
      },
    }),
  }),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: () => ({ execSync: jest.fn(), closeSync: jest.fn() }),
}));
jest.mock('drizzle-orm/expo-sqlite', () => ({ drizzle: () => mockDb }));
jest.mock('../../lib/db/migrations', () => ({
  runMigrations: jest.fn(() => ({
    isFreshDatabase: false,
    appliedVersions: [],
    isDowngrade: false,
  })),
}));
jest.mock('../../lib/db/backfillFirstAppOpen', () => ({ backfillFirstAppOpen: jest.fn() }));

describe('initializeDatabase().isNewInstall', () => {
  beforeEach(() => {
    jest.resetModules();
    mockSettingsRow = undefined;
    mockInsertedRows.length = 0;
  });

  it('is true on the call that seeds the settings row, and false on every later one', () => {
    const { initializeDatabase } = require('../../lib/db/client');

    const first = initializeDatabase();
    expect(first.isNewInstall).toBe(true);
    expect(mockInsertedRows).toHaveLength(1);
    expect(mockInsertedRows[0]).toMatchObject({ id: 'primary', onboardingCompleted: false });
    expect(String(mockInsertedRows[0]?.appUserId)).toMatch(/^m2t_/);

    // A retry or a later full reload in the same session re-runs the init.
    expect(initializeDatabase().isNewInstall).toBe(false);
    expect(mockInsertedRows).toHaveLength(1);
  });

  it('is false for an existing install, whatever its migrations did', () => {
    mockSettingsRow = { id: 'primary', appUserId: 'm2t_existing' };
    const { initializeDatabase } = require('../../lib/db/client');

    expect(initializeDatabase()).toEqual({
      isFreshDatabase: false,
      appliedVersions: [],
      isDowngrade: false,
      isNewInstall: false,
    });
    expect(mockInsertedRows).toHaveLength(0);
  });
});
