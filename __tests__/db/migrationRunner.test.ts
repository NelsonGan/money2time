import type { SQLiteDatabase } from 'expo-sqlite';

import { applyMigrations, assertMigrationOrder } from '~/lib/db/migrations/runner';
import type { DbMigration } from '~/lib/db/migrations/types';

/**
 * Minimal stand-in for the SQLite handle the runner touches: it tracks
 * `user_version` and models `withTransactionSync` faithfully enough to prove the
 * property that matters — a migration that throws must leave *no* trace, and one
 * that commits must leave its version recorded.
 */
function makeDb(initialVersion = 0) {
  let userVersion = initialVersion;
  // Statements durably committed, in order.
  const committed: string[] = [];
  let pending: string[] | null = null;

  const exec = (sql: string) => {
    const versionMatch = /^PRAGMA user_version = (\d+)$/.exec(sql.trim());
    const target = pending ?? committed;
    target.push(sql.trim());
    if (versionMatch) {
      // Mirrors SQLite: the header write participates in the transaction, so a
      // rollback restores the previous value.
      userVersion = Number(versionMatch[1]);
    }
  };

  const db = {
    getFirstSync: (sql: string) => {
      if (sql.trim() === 'PRAGMA user_version') return { user_version: userVersion };
      throw new Error(`unexpected getFirstSync: ${sql}`);
    },
    execSync: exec,
    withTransactionSync: (task: () => void) => {
      const versionBefore = userVersion;
      pending = [];
      try {
        task();
        committed.push(...pending);
        pending = null;
      } catch (error) {
        pending = null;
        userVersion = versionBefore;
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;

  return {
    db,
    committed,
    get userVersion() {
      return userVersion;
    },
  };
}

function migration(version: number, up: (db: SQLiteDatabase) => void = () => {}): DbMigration {
  return { version, name: `${String(version).padStart(3, '0')}_test`, up };
}

describe('applyMigrations', () => {
  it('applies every pending migration in order on a fresh database', () => {
    const harness = makeDb(0);

    const result = applyMigrations(harness.db, [migration(1), migration(2), migration(3)]);

    expect(result.appliedVersions).toEqual([1, 2, 3]);
    expect(result.isFreshDatabase).toBe(true);
    expect(result.isDowngrade).toBe(false);
    expect(harness.userVersion).toBe(3);
  });

  it('skips migrations at or below the recorded version', () => {
    const harness = makeDb(2);
    const ran: number[] = [];

    const result = applyMigrations(harness.db, [
      migration(1, () => ran.push(1)),
      migration(2, () => ran.push(2)),
      migration(3, () => ran.push(3)),
    ]);

    expect(ran).toEqual([3]);
    expect(result.appliedVersions).toEqual([3]);
    expect(result.isFreshDatabase).toBe(false);
  });

  it('commits each migration separately so a failure keeps earlier progress', () => {
    const harness = makeDb(0);

    expect(() =>
      applyMigrations(harness.db, [
        migration(1, (db) => db.execSync('ALTER TABLE a ADD COLUMN x TEXT')),
        migration(2, (db) => db.execSync('ALTER TABLE b ADD COLUMN y TEXT')),
        migration(3, () => {
          throw new Error('killed part-way');
        }),
        migration(4),
      ]),
    ).toThrow(/Migration 003_test \(3\) failed: killed part-way/);

    // The regression this guards: the old runner bumped user_version once at the
    // very end, so this failure left 1 and 2 applied but the version at 0 — and
    // the next launch replayed them into "duplicate column name" forever.
    expect(harness.userVersion).toBe(2);
  });

  it('resumes from where a failed run stopped, without replaying applied migrations', () => {
    const harness = makeDb(0);
    let shouldFail = true;
    const ran: number[] = [];

    const migrations = [
      migration(1, () => ran.push(1)),
      migration(2, () => {
        ran.push(2);
        if (shouldFail) throw new Error('transient');
      }),
      migration(3, () => ran.push(3)),
    ];

    expect(() => applyMigrations(harness.db, migrations)).toThrow(/transient/);
    expect(ran).toEqual([1, 2]);

    shouldFail = false;
    ran.length = 0;
    const result = applyMigrations(harness.db, migrations);

    expect(ran).toEqual([2, 3]);
    expect(result.appliedVersions).toEqual([2, 3]);
    expect(harness.userVersion).toBe(3);
  });

  it('rolls a failed migration back rather than leaving its version recorded', () => {
    const harness = makeDb(0);

    expect(() =>
      applyMigrations(harness.db, [
        migration(1, (db) => {
          db.execSync('ALTER TABLE a ADD COLUMN x TEXT');
          throw new Error('boom');
        }),
      ]),
    ).toThrow(/boom/);

    expect(harness.userVersion).toBe(0);
    expect(harness.committed).toEqual([]);
  });

  it('leaves a database written by a newer build untouched', () => {
    const harness = makeDb(99);
    const ran: number[] = [];

    const result = applyMigrations(harness.db, [
      migration(1, () => ran.push(1)),
      migration(2, () => ran.push(2)),
    ]);

    // The old behaviour here dropped every table and re-migrated from baseline,
    // wiping all of the user's data on a store rollback or an older sideload.
    expect(ran).toEqual([]);
    expect(harness.committed).toEqual([]);
    expect(harness.userVersion).toBe(99);
    expect(result).toEqual({ isFreshDatabase: false, appliedVersions: [], isDowngrade: true });
  });

  it('is a no-op when the database is already current', () => {
    const harness = makeDb(2);

    const result = applyMigrations(harness.db, [migration(1), migration(2)]);

    expect(result.appliedVersions).toEqual([]);
    expect(result.isDowngrade).toBe(false);
    expect(harness.committed).toEqual([]);
  });

  it('retries the initial user_version read past a transient disk I/O error', () => {
    const harness = makeDb(1);
    let readAttempts = 0;
    const realGetFirstSync = harness.db.getFirstSync.bind(harness.db);
    harness.db.getFirstSync = ((sql: string) => {
      readAttempts += 1;
      if (readAttempts < 3) throw new Error('disk I/O error');
      return realGetFirstSync(sql);
    }) as typeof harness.db.getFirstSync;

    const result = applyMigrations(harness.db, [migration(1), migration(2)], { sleep: () => {} });

    expect(readAttempts).toBe(3);
    expect(result.appliedVersions).toEqual([2]);
  });

  it('throws the underlying error once retries on the user_version read are exhausted', () => {
    const harness = makeDb(1);
    harness.db.getFirstSync = (() => {
      throw new Error('disk I/O error');
    }) as typeof harness.db.getFirstSync;

    expect(() =>
      applyMigrations(harness.db, [migration(1), migration(2)], { sleep: () => {} }),
    ).toThrow(/disk I\/O error/);
  });

  it('pauses between user_version read retries instead of spinning through them instantly', () => {
    // Regression: the first fix (MONEY2TIME-1X) retried 3 times with no gap
    // between attempts, so all 3 happened within microseconds and the same
    // disk I/O error kept recurring (MONEY2TIME-2S) because a lock-holding
    // process never got a real chance to release it.
    const harness = makeDb(1);
    harness.db.getFirstSync = (() => {
      throw new Error('disk I/O error');
    }) as typeof harness.db.getFirstSync;
    const delays: number[] = [];

    expect(() =>
      applyMigrations(harness.db, [migration(1)], { sleep: (ms) => delays.push(ms) }),
    ).toThrow(/disk I\/O error/);

    expect(delays).toEqual([20, 60, 150, 400]);
  });
});

describe('assertMigrationOrder', () => {
  it('accepts strictly ascending versions', () => {
    expect(() => assertMigrationOrder([migration(1), migration(2), migration(5)])).not.toThrow();
  });

  it('rejects duplicate or out-of-order versions', () => {
    expect(() => assertMigrationOrder([migration(2), migration(2)])).toThrow(/strictly ascending/);
    expect(() => assertMigrationOrder([migration(3), migration(1)])).toThrow(/strictly ascending/);
  });
});
