import { and, eq, isNull } from 'drizzle-orm';

import { getDb } from '~/lib/db/client';
import { goalContributionsTable } from '~/lib/db/schema';
import type { GoalContribution } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { toGoalContribution } from './mappers';

export interface CreateGoalContributionInput {
  goalId: string;
  amount: number;
  currency: string;
  reportingCurrency?: string | null;
  reportingAmount?: number | null;
  fxRate?: number | null;
  date: string;
  note?: string | null;
  linkedTransactionId?: string | null;
  deletedAt?: string | null;
}

class GoalContributionsRepository {
  /** All live contributions (used to aggregate saved amounts + pace across goals). */
  list(): GoalContribution[] {
    const db = getDb();
    return db
      .select()
      .from(goalContributionsTable)
      .where(isNull(goalContributionsTable.deletedAt))
      .orderBy(goalContributionsTable.date)
      .all()
      .map(toGoalContribution);
  }

  listByGoal(goalId: string): GoalContribution[] {
    const db = getDb();
    return db
      .select()
      .from(goalContributionsTable)
      .where(
        and(eq(goalContributionsTable.goalId, goalId), isNull(goalContributionsTable.deletedAt)),
      )
      .orderBy(goalContributionsTable.date)
      .all()
      .map(toGoalContribution);
  }

  create(input: CreateGoalContributionInput): string {
    const db = getDb();
    const id = newId();
    const now = nowIso();

    db.insert(goalContributionsTable)
      .values({
        id,
        goalId: input.goalId,
        amount: input.amount,
        currency: input.currency,
        reportingCurrency: input.reportingCurrency ?? null,
        reportingAmount: input.reportingAmount ?? null,
        fxRate: input.fxRate ?? null,
        date: input.date,
        note: input.note ?? null,
        linkedTransactionId: input.linkedTransactionId ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: input.deletedAt ?? null,
      })
      .run();

    return id;
  }

  update(id: string, input: Partial<CreateGoalContributionInput>) {
    const db = getDb();
    db.update(goalContributionsTable)
      .set({ ...input, updatedAt: nowIso() })
      .where(and(eq(goalContributionsTable.id, id), isNull(goalContributionsTable.deletedAt)))
      .run();
  }

  softDelete(id: string) {
    const db = getDb();
    const now = nowIso();
    db.update(goalContributionsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(goalContributionsTable.id, id), isNull(goalContributionsTable.deletedAt)))
      .run();
  }

  /** Soft-deletes every contribution belonging to a goal (delete cascade). */
  softDeleteByGoal(goalId: string) {
    const db = getDb();
    const now = nowIso();
    db.update(goalContributionsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(eq(goalContributionsTable.goalId, goalId), isNull(goalContributionsTable.deletedAt)),
      )
      .run();
  }
}

export const goalContributionsRepository = new GoalContributionsRepository();
