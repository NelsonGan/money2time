import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { getDb, getSQLite } from '~/lib/db/client';
import { DEFAULT_LEDGER_ID, getActiveLedgerId, LEDGER_TABLES } from '~/lib/db/ledgerScope';
import { ledgersTable, settingsTable } from '~/lib/db/schema';
import type { Ledger, LedgerPrefs } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { toLedger } from './mappers';

export interface LedgerInput {
  name: string;
  emoji: string | null;
  currencyCode: string;
  currencySymbol: string;
}

/**
 * Child rows of a ledger's root rows, which carry no `ledger_id` of their own:
 * [child table, its parent-id column, the parent table]. Deleting a ledger
 * retires them with their parents.
 */
const LEDGER_CHILD_TABLES = [
  ['transaction_splits', 'transaction_id', 'transactions'],
  ['album_transactions', 'album_id', 'albums'],
  ['receipt_splits', 'transaction_id', 'transactions'],
  ['budget_template_categories', 'template_id', 'budget_templates'],
  ['monthly_budget_categories', 'budget_id', 'monthly_budgets'],
] as const;

function parsePrefs(json: string | null | undefined): LedgerPrefs {
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as LedgerPrefs)
      : {};
  } catch {
    return {};
  }
}

class LedgersRepository {
  /**
   * Live ledgers, default first, then oldest first. The default ledger's
   * currency is filled in from the settings row, where it lives.
   */
  list(): Ledger[] {
    const db = getDb();
    const settings = db
      .select({ code: settingsTable.currencyCode, symbol: settingsTable.currencySymbol })
      .from(settingsTable)
      .get();
    return db
      .select()
      .from(ledgersTable)
      .where(isNull(ledgersTable.deletedAt))
      .orderBy(
        sql`CASE WHEN ${ledgersTable.id} = ${DEFAULT_LEDGER_ID} THEN 0 ELSE 1 END`,
        asc(ledgersTable.sortOrder),
        asc(ledgersTable.createdAt),
      )
      .all()
      .map((row) =>
        row.id === DEFAULT_LEDGER_ID && !row.currencyCode && settings
          ? toLedger({ ...row, currencyCode: settings.code, currencySymbol: settings.symbol })
          : toLedger(row),
      );
  }

  getById(id: string): Ledger | null {
    const row = getDb()
      .select()
      .from(ledgersTable)
      .where(and(eq(ledgersTable.id, id), isNull(ledgersTable.deletedAt)))
      .get();
    return row ? toLedger(row) : null;
  }

  create(input: LedgerInput): string {
    const db = getDb();
    const id = newId();
    const now = nowIso();
    const maxSort = db
      .select({ maxSort: sql<number>`coalesce(max(${ledgersTable.sortOrder}), 0)` })
      .from(ledgersTable)
      .where(isNull(ledgersTable.deletedAt))
      .get();
    db.insert(ledgersTable)
      .values({
        id,
        name: input.name.trim(),
        emoji: input.emoji,
        currencyCode: input.currencyCode,
        currencySymbol: input.currencySymbol,
        prefsJson: null,
        sortOrder: (maxSort?.maxSort ?? 0) + 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
    return id;
  }

  /**
   * Rename or re-icon any ledger. Currency is the ledger's own only off the
   * default ledger; the default ledger's currency is the settings row's.
   */
  update(id: string, input: Partial<LedgerInput>) {
    const { currencyCode, currencySymbol, ...rest } = input;
    const set: Partial<typeof ledgersTable.$inferInsert> = { ...rest, updatedAt: nowIso() };
    if (rest.name !== undefined) set.name = rest.name.trim() || null;
    if (id !== DEFAULT_LEDGER_ID) {
      if (currencyCode !== undefined) set.currencyCode = currencyCode;
      if (currencySymbol !== undefined) set.currencySymbol = currencySymbol;
    }
    getDb()
      .update(ledgersTable)
      .set(set)
      .where(and(eq(ledgersTable.id, id), isNull(ledgersTable.deletedAt)))
      .run();
  }

  getPrefs(id: string): LedgerPrefs {
    const row = getDb()
      .select({ prefsJson: ledgersTable.prefsJson })
      .from(ledgersTable)
      .where(eq(ledgersTable.id, id))
      .get();
    return parsePrefs(row?.prefsJson);
  }

  /** Merge `patch` into a ledger's prefs. */
  updatePrefs(id: string, patch: LedgerPrefs) {
    const next = { ...this.getPrefs(id), ...patch };
    getDb()
      .update(ledgersTable)
      .set({ prefsJson: JSON.stringify(next), updatedAt: nowIso() })
      .where(eq(ledgersTable.id, id))
      .run();
  }

  /**
   * The open ledger's reporting currency: its own, or the settings row's on
   * the default ledger (and on a ledger row that somehow has none).
   */
  activeReportingCurrency(): { code: string; symbol: string } {
    const db = getDb();
    const ledgerId = getActiveLedgerId();
    if (ledgerId !== DEFAULT_LEDGER_ID) {
      const row = db
        .select({ code: ledgersTable.currencyCode, symbol: ledgersTable.currencySymbol })
        .from(ledgersTable)
        .where(and(eq(ledgersTable.id, ledgerId), isNull(ledgersTable.deletedAt)))
        .get();
      if (row?.code) return { code: row.code, symbol: row.symbol ?? row.code };
    }
    const settings = db
      .select({ code: settingsTable.currencyCode, symbol: settingsTable.currencySymbol })
      .from(settingsTable)
      .get();
    return { code: settings?.code ?? 'USD', symbol: settings?.symbol ?? '$' };
  }

  /** Live transactions per ledger id, in one pass; a ledger with none is absent. */
  entryCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const row of getSQLite().getAllSync<{ ledgerId: string; n: number }>(
      `SELECT ledger_id AS ledgerId, COUNT(*) AS n FROM transactions
       WHERE deleted_at IS NULL GROUP BY ledger_id`,
    )) {
      counts[row.ledgerId] = row.n;
    }
    return counts;
  }

  /**
   * Soft-delete a ledger and everything in it, in one transaction. Soft, like
   * every other delete here, so Cloud Sync carries it to the other phones. The
   * default ledger cannot be deleted.
   */
  softDelete(id: string) {
    if (id === DEFAULT_LEDGER_ID) throw new Error('The default ledger cannot be deleted');
    const sqlite = getSQLite();
    const now = nowIso();
    sqlite.withTransactionSync(() => {
      for (const [child, parentColumn, parent] of LEDGER_CHILD_TABLES) {
        sqlite.runSync(
          `UPDATE ${child} SET deleted_at = ?, updated_at = ?
           WHERE deleted_at IS NULL
             AND ${parentColumn} IN (SELECT id FROM ${parent} WHERE ledger_id = ?)`,
          [now, now, id],
        );
      }
      sqlite.runSync(
        `UPDATE receipt_split_items SET deleted_at = ?, updated_at = ?
         WHERE deleted_at IS NULL AND receipt_split_id IN (
           SELECT rs.id FROM receipt_splits rs JOIN transactions t ON t.id = rs.transaction_id
           WHERE t.ledger_id = ?)`,
        [now, now, id],
      );
      sqlite.runSync(
        `UPDATE receipt_split_item_shares SET deleted_at = ?, updated_at = ?
         WHERE deleted_at IS NULL AND receipt_split_id IN (
           SELECT rs.id FROM receipt_splits rs JOIN transactions t ON t.id = rs.transaction_id
           WHERE t.ledger_id = ?)`,
        [now, now, id],
      );
      for (const table of LEDGER_TABLES) {
        // Payment-alert captures are bookkeeping, not data: dropped below.
        if (table === 'auto_log_captures') continue;
        sqlite.runSync(
          `UPDATE ${table} SET deleted_at = ?, updated_at = ?
           WHERE ledger_id = ? AND deleted_at IS NULL`,
          [now, now, id],
        );
      }
      sqlite.runSync('DELETE FROM auto_log_captures WHERE ledger_id = ?', [id]);
      sqlite.runSync(
        'UPDATE ledgers SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [now, now, id],
      );
    });
  }
}

export const ledgersRepository = new LedgersRepository();
