import type { SQLiteDatabase } from 'expo-sqlite';

import { backfillFirstAppOpen, FIRST_APP_OPEN_FLOOR_ISO } from '~/lib/db/backfillFirstAppOpen';

interface MockState {
  firstAppOpen: string | null | undefined;
  minDate: string | null;
  hasSettingsRow?: boolean;
}

function makeDb(state: MockState): { db: SQLiteDatabase; writes: string[] } {
  const writes: string[] = [];
  const db = {
    getFirstSync: (sql: string) => {
      if (/FROM settings/.test(sql)) {
        return state.hasSettingsRow === false
          ? undefined
          : { firstAppOpen: state.firstAppOpen ?? null };
      }
      // MIN(date) FROM transactions
      return { minDate: state.minDate };
    },
    runSync: (_sql: string, params: unknown[]) => {
      writes.push(params[0] as string);
    },
  } as unknown as SQLiteDatabase;
  return { db, writes };
}

describe('backfillFirstAppOpen', () => {
  const NOW = new Date('2026-07-05T10:00:00.000Z');

  it('does nothing when first_app_open is already set', () => {
    const { db, writes } = makeDb({ firstAppOpen: '2026-04-01T00:00:00.000Z', minDate: null });
    backfillFirstAppOpen(db, { now: NOW });
    expect(writes).toHaveLength(0);
  });

  it('does nothing when there is no settings row', () => {
    const { db, writes } = makeDb({
      firstAppOpen: null,
      minDate: '2026-05-01',
      hasSettingsRow: false,
    });
    backfillFirstAppOpen(db, { now: NOW });
    expect(writes).toHaveLength(0);
  });

  it('backfills to the earliest transaction date when it is after the floor', () => {
    const { db, writes } = makeDb({ firstAppOpen: null, minDate: '2026-05-10' });
    backfillFirstAppOpen(db, { now: NOW });
    expect(writes).toEqual([new Date('2026-05-10').toISOString()]);
  });

  it('clamps to the floor when the earliest transaction predates 2026-03-01', () => {
    const { db, writes } = makeDb({ firstAppOpen: null, minDate: '2025-11-20' });
    backfillFirstAppOpen(db, { now: NOW });
    expect(writes).toEqual([FIRST_APP_OPEN_FLOOR_ISO]);
  });

  it('clamps an unparseable earliest date to the floor', () => {
    const { db, writes } = makeDb({ firstAppOpen: null, minDate: 'not-a-date' });
    backfillFirstAppOpen(db, { now: NOW });
    expect(writes).toEqual([FIRST_APP_OPEN_FLOOR_ISO]);
  });

  it('uses now when the user has no transactions', () => {
    const { db, writes } = makeDb({ firstAppOpen: null, minDate: null });
    backfillFirstAppOpen(db, { now: NOW });
    expect(writes).toEqual([NOW.toISOString()]);
  });
});
