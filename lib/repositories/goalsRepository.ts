import { and, eq, isNull, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { goalsTable } from '~/lib/db/schema';
import type { Goal, GoalStatus, GoalTrackingMode } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { toGoal } from './mappers';

export interface CreateGoalInput {
  name: string;
  targetAmount: number;
  currency: string;
  fxRate?: number;
  targetReportingAmount: number;
  startingAmount?: number;
  deadline?: string | null;
  coverPhotoUri?: string | null;
  emoji?: string | null;
  note?: string | null;
  trackingMode?: GoalTrackingMode;
  linkedAccountId?: string | null;
  countExistingBalance?: boolean;
  baselineAmount?: number | null;
  status?: GoalStatus;
  completedAt?: string | null;
  sortOrder?: number;
  deletedAt?: string | null;
}

class GoalsRepository {
  list(): Goal[] {
    const db = getDb();
    return db
      .select()
      .from(goalsTable)
      .where(isNull(goalsTable.deletedAt))
      .orderBy(goalsTable.sortOrder, goalsTable.name)
      .all()
      .map(toGoal);
  }

  /** Number of live goals still in the `active` status (drives the free-tier gate). */
  countActive(): number {
    const db = getDb();
    const row = db
      .select({ count: sql<number>`count(*)` })
      .from(goalsTable)
      .where(and(isNull(goalsTable.deletedAt), eq(goalsTable.status, 'active')))
      .get();
    return row?.count ?? 0;
  }

  create(input: CreateGoalInput): string {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    // New goals sort to the top of the list (one below the current minimum).
    const minSort = db
      .select({ minSort: sql<number>`coalesce(min(${goalsTable.sortOrder}), 0)` })
      .from(goalsTable)
      .where(isNull(goalsTable.deletedAt))
      .get();
    const nextSortOrder = input.sortOrder ?? (minSort?.minSort ?? 0) - 1;

    db.insert(goalsTable)
      .values({
        id,
        name: input.name,
        targetAmount: input.targetAmount,
        currency: input.currency,
        fxRate: input.fxRate ?? 1,
        targetReportingAmount: input.targetReportingAmount,
        startingAmount: input.startingAmount ?? 0,
        deadline: input.deadline ?? null,
        coverPhotoUri: input.coverPhotoUri ?? null,
        emoji: input.emoji ?? null,
        note: input.note ?? null,
        trackingMode: input.trackingMode ?? 'manual',
        linkedAccountId: input.linkedAccountId ?? null,
        countExistingBalance: input.countExistingBalance ?? false,
        baselineAmount: input.baselineAmount ?? null,
        status: input.status ?? 'active',
        completedAt: input.completedAt ?? null,
        sortOrder: nextSortOrder,
        createdAt: now,
        updatedAt: now,
        deletedAt: input.deletedAt ?? null,
      })
      .run();

    return id;
  }

  update(id: string, input: Partial<CreateGoalInput>) {
    const db = getDb();
    db.update(goalsTable)
      .set({ ...input, updatedAt: nowIso() })
      .where(and(eq(goalsTable.id, id), isNull(goalsTable.deletedAt)))
      .run();
  }

  /** Persists the given goal ids as the new ascending sort order. */
  reorder(ids: string[]) {
    if (ids.length === 0) return;

    const sqlite = getSQLite();
    const db = getDb();
    const now = nowIso();

    sqlite.execSync('BEGIN');
    try {
      ids.forEach((id, index) => {
        db.update(goalsTable)
          .set({ sortOrder: index, updatedAt: now })
          .where(and(eq(goalsTable.id, id), isNull(goalsTable.deletedAt)))
          .run();
      });
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  softDelete(id: string) {
    const db = getDb();
    const now = nowIso();
    db.update(goalsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(goalsTable.id, id), isNull(goalsTable.deletedAt)))
      .run();
  }
}

export const goalsRepository = new GoalsRepository();
