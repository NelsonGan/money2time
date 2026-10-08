import { getDb } from '~/lib/db/client';
import { paymentAlertCapturesRepository } from '~/lib/repositories/paymentAlertCapturesRepository';

jest.mock('~/lib/db/client', () => ({ getDb: jest.fn() }));
jest.mock('~/lib/db/schema', () => ({
  autoLogCapturesTable: Object.fromEntries(
    ['id', 'status', 'parserVersion', 'capturedAt', 'updatedAt', 'deletedAt'].map((name) => [
      name,
      name,
    ]),
  ),
}));
jest.mock('drizzle-orm', () => ({
  and:
    (...conditions: ((row: Record<string, unknown>) => boolean)[]) =>
    (row: Record<string, unknown>) =>
      conditions.every((condition) => condition(row)),
  eq: (column: string, value: unknown) => (row: Record<string, unknown>) => row[column] === value,
  lt: (column: string, value: string | number) => (row: Record<string, string | number>) =>
    row[column] < value,
  inArray: (column: string, values: unknown[]) => (row: Record<string, unknown>) =>
    values.includes(row[column]),
  isNull: (column: string) => (row: Record<string, unknown>) => row[column] == null,
}));
const now = new Date('2026-10-08T12:00:00.000Z');
const old = '2025-01-01T12:00:00.000Z';
const row = (id: string, status: string, updatedAt = old, parserVersion = 5) => ({
  id,
  status,
  updatedAt,
  parserVersion,
  capturedAt: old,
  deletedAt: null,
});
function sweep(input: ReturnType<typeof row>[]) {
  let rows = input.map((entry) => ({ ...entry }));
  const builder = (remove: boolean) => {
    let values = {};
    let matches: (entry: ReturnType<typeof row>) => boolean;
    const query = {
      set: (patch: unknown) => {
        values = patch as object;
        return query;
      },
      where: (predicate: typeof matches) => {
        matches = predicate;
        return query;
      },
      run: () => {
        if (remove) rows = rows.filter((entry) => !matches(entry));
        else
          rows.forEach((entry) => {
            if (matches(entry)) Object.assign(entry, values);
          });
      },
    };
    return query;
  };
  jest
    .mocked(getDb)
    .mockReturnValue({ update: () => builder(false), delete: () => builder(true) } as never);
  paymentAlertCapturesRepository.sweep(now);
  return rows;
}
it('keeps an old notification newly reviewed so a failed history write can recover its link', () => {
  const rows = sweep([row('just-saved', 'logged', now.toISOString())]);
  expect(rows.map((entry) => entry.id)).toEqual(['just-saved']);
});
it('keeps current unfinished reviews, while pruning genuinely old completed captures', () => {
  const rows = sweep([
    row('pending', 'pending'),
    row('old-saved', 'logged'),
    row('old-ignored', 'ignored'),
  ]);
  expect(rows.map((entry) => entry.id)).toEqual(['pending']);
});
it('expires legacy pending captures without applying that expiry to manual review drafts', () => {
  const rows = sweep([row('legacy', 'pending', old, 4), row('current', 'pending')]);
  expect(rows.find((entry) => entry.id === 'legacy')?.status).toBe('dismissed');
  expect(rows.find((entry) => entry.id === 'current')?.status).toBe('pending');
});
