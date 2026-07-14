import { and, eq, inArray, isNull } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import {
  receiptSplitItemSharesTable,
  receiptSplitItemsTable,
  receiptSplitsTable,
} from '~/lib/db/schema';
import type { ReceiptSplit, ReceiptSplitItem, ReceiptSplitSource } from '~/types';
import { normalizeMoneyAmount } from '~/utils/formatters';
import { newId, nowIso } from '~/utils/id';

import { toReceiptSplit, toReceiptSplitItem, toReceiptSplitItemShare } from './mappers';

export interface ReceiptSplitShareInput {
  personName: string;
  isSelf?: boolean;
  weight?: number;
}

export interface ReceiptSplitItemInput {
  name: string;
  quantity?: number;
  /** Tax-inclusive line total. */
  lineTotal: number;
  shares?: ReceiptSplitShareInput[];
}

export interface ReceiptSplitDraftInput {
  currency: string;
  merchant?: string | null;
  receiptDate?: string | null;
  source: ReceiptSplitSource;
  receiptImageUri?: string | null;
  items: ReceiptSplitItemInput[];
}

class ReceiptSplitsRepository {
  getByTransactionId(transactionId: string): ReceiptSplit | null {
    const db = getDb();
    const header = db
      .select()
      .from(receiptSplitsTable)
      .where(
        and(
          eq(receiptSplitsTable.transactionId, transactionId),
          isNull(receiptSplitsTable.deletedAt),
        ),
      )
      .get();
    if (!header) return null;

    const shareRows = db
      .select()
      .from(receiptSplitItemSharesTable)
      .where(
        and(
          eq(receiptSplitItemSharesTable.receiptSplitId, header.id),
          isNull(receiptSplitItemSharesTable.deletedAt),
        ),
      )
      .all()
      .map(toReceiptSplitItemShare);
    const sharesByItem = new Map<string, typeof shareRows>();
    for (const share of shareRows) {
      const existing = sharesByItem.get(share.itemId);
      if (existing) {
        existing.push(share);
      } else {
        sharesByItem.set(share.itemId, [share]);
      }
    }

    const items: ReceiptSplitItem[] = db
      .select()
      .from(receiptSplitItemsTable)
      .where(
        and(
          eq(receiptSplitItemsTable.receiptSplitId, header.id),
          isNull(receiptSplitItemsTable.deletedAt),
        ),
      )
      .all()
      .map((row) => toReceiptSplitItem(row, sharesByItem.get(row.id) ?? []))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return toReceiptSplit(header, items);
  }

  createForTransaction(transactionId: string, draft: ReceiptSplitDraftInput): ReceiptSplit {
    const sqlite = getSQLite();
    sqlite.execSync('BEGIN');
    try {
      const created = this.insertReceiptSplit(transactionId, draft);
      sqlite.execSync('COMMIT');
      return created;
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  // Soft-deletes any existing itemized detail for the transaction and inserts
  // the draft fresh. The itemized rows aren't referenced from anywhere else,
  // so replace-on-save is simpler and just as safe as a per-row reconcile.
  replaceForTransaction(transactionId: string, draft: ReceiptSplitDraftInput): ReceiptSplit {
    const sqlite = getSQLite();
    sqlite.execSync('BEGIN');
    try {
      this.softDeleteForTransactionIds([transactionId]);
      const created = this.insertReceiptSplit(transactionId, draft);
      sqlite.execSync('COMMIT');
      return created;
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  softDeleteByTransactionIds(transactionIds: string[]): void {
    if (transactionIds.length === 0) return;
    const sqlite = getSQLite();
    sqlite.execSync('BEGIN');
    try {
      this.softDeleteForTransactionIds(transactionIds);
      sqlite.execSync('COMMIT');
    } catch (error) {
      sqlite.execSync('ROLLBACK');
      throw error;
    }
  }

  private insertReceiptSplit(transactionId: string, draft: ReceiptSplitDraftInput): ReceiptSplit {
    const db = getDb();
    const now = nowIso();
    const headerRow = {
      id: newId(),
      transactionId,
      currency: draft.currency,
      merchant: draft.merchant?.trim() || null,
      receiptDate: draft.receiptDate ?? null,
      source: draft.source,
      receiptImageUri: draft.receiptImageUri ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    db.insert(receiptSplitsTable).values(headerRow).run();

    const items: ReceiptSplitItem[] = draft.items.map((item, index) => {
      const itemRow = {
        id: newId(),
        receiptSplitId: headerRow.id,
        name: item.name.trim(),
        quantity: Number.isFinite(item.quantity) ? (item.quantity as number) : 1,
        lineTotal: normalizeMoneyAmount(item.lineTotal),
        sortOrder: index,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      db.insert(receiptSplitItemsTable).values(itemRow).run();

      const shares = (item.shares ?? []).map((share) => {
        const shareRow = {
          id: newId(),
          receiptSplitId: headerRow.id,
          itemId: itemRow.id,
          personName: share.personName.trim(),
          isSelf: !!share.isSelf,
          weight: Math.max(1, Math.round(share.weight ?? 1)),
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        db.insert(receiptSplitItemSharesTable).values(shareRow).run();
        return toReceiptSplitItemShare(shareRow);
      });

      return toReceiptSplitItem(itemRow, shares);
    });

    return toReceiptSplit(headerRow, items);
  }

  private softDeleteForTransactionIds(transactionIds: string[]): void {
    const db = getDb();
    const now = nowIso();
    const headers = db
      .select({ id: receiptSplitsTable.id })
      .from(receiptSplitsTable)
      .where(
        and(
          inArray(receiptSplitsTable.transactionId, transactionIds),
          isNull(receiptSplitsTable.deletedAt),
        ),
      )
      .all();
    if (headers.length === 0) return;
    const headerIds = headers.map((row) => row.id);
    db.update(receiptSplitItemSharesTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          inArray(receiptSplitItemSharesTable.receiptSplitId, headerIds),
          isNull(receiptSplitItemSharesTable.deletedAt),
        ),
      )
      .run();
    db.update(receiptSplitItemsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          inArray(receiptSplitItemsTable.receiptSplitId, headerIds),
          isNull(receiptSplitItemsTable.deletedAt),
        ),
      )
      .run();
    db.update(receiptSplitsTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(inArray(receiptSplitsTable.id, headerIds), isNull(receiptSplitsTable.deletedAt)))
      .run();
  }
}

export const receiptSplitsRepository = new ReceiptSplitsRepository();
