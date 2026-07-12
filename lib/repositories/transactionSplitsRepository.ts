import { and, eq, inArray, isNull } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { transactionSplitsTable } from '~/lib/db/schema';
import type { TransactionSplit } from '~/types';
import { normalizeMoneyAmount } from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';

import { toTransactionSplit } from './mappers';

export interface CreateTransactionSplitInput {
  transactionId: string;
  personName?: string | null;
  amount: number;
  isSelf?: boolean;
  note?: string | null;
  paybackAccountId?: string | null;
  sortOrder?: number;
  paidAt?: string | null;
  paidTransactionId?: string | null;
}

export interface UpdateTransactionSplitInput {
  personName?: string | null;
  amount?: number;
  note?: string | null;
  paybackAccountId?: string | null;
  sortOrder?: number;
  paidAt?: string | null;
  paidTransactionId?: string | null;
}

class TransactionSplitsRepository {
  findById(id: string): TransactionSplit | null {
    const db = getDb();
    const row = db
      .select()
      .from(transactionSplitsTable)
      .where(and(eq(transactionSplitsTable.id, id), isNull(transactionSplitsTable.deletedAt)))
      .get();
    return row ? toTransactionSplit(row) : null;
  }

  listByTransactionId(transactionId: string): TransactionSplit[] {
    const db = getDb();
    return db
      .select()
      .from(transactionSplitsTable)
      .where(
        and(
          eq(transactionSplitsTable.transactionId, transactionId),
          isNull(transactionSplitsTable.deletedAt),
        ),
      )
      .all()
      .map(toTransactionSplit)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  listByTransactionIds(transactionIds: string[]): Map<string, TransactionSplit[]> {
    const grouped = new Map<string, TransactionSplit[]>();
    if (transactionIds.length === 0) return grouped;
    const db = getDb();
    const rows = db
      .select()
      .from(transactionSplitsTable)
      .where(
        and(
          inArray(transactionSplitsTable.transactionId, transactionIds),
          isNull(transactionSplitsTable.deletedAt),
        ),
      )
      .all()
      .map(toTransactionSplit);
    for (const split of rows) {
      const existing = grouped.get(split.transactionId);
      if (existing) {
        existing.push(split);
      } else {
        grouped.set(split.transactionId, [split]);
      }
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return grouped;
  }

  listAllActive(): TransactionSplit[] {
    const db = getDb();
    return db
      .select()
      .from(transactionSplitsTable)
      .where(isNull(transactionSplitsTable.deletedAt))
      .all()
      .map(toTransactionSplit);
  }

  // All active splits grouped by transaction id. Used when attaching splits to a
  // large transaction set (e.g. the full-table load at startup) where a
  // WHERE transaction_id IN (…thousands of ids…) clause is far slower to prepare
  // than scanning the sparse splits table once.
  listAllActiveGrouped(): Map<string, TransactionSplit[]> {
    const grouped = new Map<string, TransactionSplit[]>();
    for (const split of this.listAllActive()) {
      const existing = grouped.get(split.transactionId);
      if (existing) {
        existing.push(split);
      } else {
        grouped.set(split.transactionId, [split]);
      }
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return grouped;
  }

  findByPaidTransactionId(paidTransactionId: string): TransactionSplit | null {
    const db = getDb();
    const row = db
      .select()
      .from(transactionSplitsTable)
      .where(
        and(
          eq(transactionSplitsTable.paidTransactionId, paidTransactionId),
          isNull(transactionSplitsTable.deletedAt),
        ),
      )
      .get();
    return row ? toTransactionSplit(row) : null;
  }

  create(input: CreateTransactionSplitInput): TransactionSplit {
    const id = newId();
    return this.createWithId(id, input);
  }

  createWithId(id: string, input: CreateTransactionSplitInput): TransactionSplit {
    const db = getDb();
    const now = nowIso();
    const row = {
      id,
      transactionId: input.transactionId,
      personName: input.personName ?? null,
      amount: normalizeMoneyAmount(input.amount),
      isSelf: !!input.isSelf,
      note: input.note ?? null,
      paybackAccountId: input.paybackAccountId ?? null,
      paidAt: input.paidAt ?? null,
      paidTransactionId: input.paidTransactionId ?? null,
      sortOrder: input.sortOrder ?? 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    db.insert(transactionSplitsTable).values(row).run();
    return toTransactionSplit(row);
  }

  createMany(inputs: CreateTransactionSplitInput[]): TransactionSplit[] {
    if (inputs.length === 0) return [];
    const sqlite = getSQLite();
    sqlite.execSync('BEGIN');
    try {
      const created = inputs.map((input) => this.create(input));
      sqlite.execSync('COMMIT');
      return created;
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  update(id: string, updates: UpdateTransactionSplitInput): void {
    const db = getDb();
    const set: Partial<typeof transactionSplitsTable.$inferInsert> = { updatedAt: nowIso() };
    if (updates.personName !== undefined) set.personName = updates.personName;
    if (updates.amount !== undefined) set.amount = normalizeMoneyAmount(updates.amount);
    if (updates.note !== undefined) set.note = updates.note;
    if (updates.paybackAccountId !== undefined) set.paybackAccountId = updates.paybackAccountId;
    if (updates.sortOrder !== undefined) set.sortOrder = updates.sortOrder;
    if (updates.paidAt !== undefined) set.paidAt = updates.paidAt;
    if (updates.paidTransactionId !== undefined) set.paidTransactionId = updates.paidTransactionId;
    db.update(transactionSplitsTable)
      .set(set)
      .where(and(eq(transactionSplitsTable.id, id), isNull(transactionSplitsTable.deletedAt)))
      .run();
  }

  markPaid(id: string, paidTransactionId: string, paidAt: string): void {
    this.update(id, { paidAt, paidTransactionId });
  }

  markUnpaid(id: string): void {
    this.update(id, { paidAt: null, paidTransactionId: null });
  }

  softDelete(id: string): void {
    const db = getDb();
    const now = nowIso();
    db.update(transactionSplitsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(transactionSplitsTable.id, id), isNull(transactionSplitsTable.deletedAt)))
      .run();
  }

  softDeleteByTransactionId(transactionId: string): void {
    const db = getDb();
    const now = nowIso();
    db.update(transactionSplitsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(transactionSplitsTable.transactionId, transactionId),
          isNull(transactionSplitsTable.deletedAt),
        ),
      )
      .run();
  }

  softDeleteByTransactionIds(transactionIds: string[]): void {
    if (transactionIds.length === 0) return;
    const db = getDb();
    const now = nowIso();
    db.update(transactionSplitsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          inArray(transactionSplitsTable.transactionId, transactionIds),
          isNull(transactionSplitsTable.deletedAt),
        ),
      )
      .run();
  }
}

export const transactionSplitsRepository = new TransactionSplitsRepository();
