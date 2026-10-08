import { and, eq, gte, inArray, isNull, lt } from 'drizzle-orm';

import { getDb } from '~/lib/db/client';
import { autoLogCapturesTable } from '~/lib/db/schema';
import type {
  PaymentAlertCapture,
  PaymentAlertChannel,
  PaymentAlertReason,
  PaymentAlertResolution,
  PaymentAlertStatus,
} from '~/types';
import { nowIso } from '~/utils/id';

import { toPaymentAlertCapture } from './mappers';

export interface NewPaymentAlertCapture {
  id: string;
  channel: PaymentAlertChannel;
  sourceKey: string;
  sourceLabel: string | null;
  capturedAt: string;
  nativeKey: string | null;
  title: string | null;
  body: string | null;
  status: PaymentAlertStatus;
  reason: PaymentAlertReason | null;
  resolution: PaymentAlertResolution | null;
  parserVersion: number;
  transactionId: string | null;
  duplicateOf: string | null;
  dedupeKey: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Ignored alerts retain raw text briefly for diagnostics. */
const IGNORED_TEXT_DAYS = 7;
/** Other alerts retain raw text briefly for diagnostics. */
const SETTLED_TEXT_DAYS = 30;
/** Legacy pending records expire after this; current review records do not expire. */
const PENDING_DAYS = 30;
/** Rows are deleted after this. */
const ROW_DAYS = 180;

class PaymentAlertCapturesRepository {
  /** Insert, unless a capture with this id is already stored (a queue read twice). */
  insert(input: NewPaymentAlertCapture): boolean {
    const db = getDb();
    if (this.exists(input.id)) return false;
    const now = nowIso();
    db.insert(autoLogCapturesTable)
      .values({
        id: input.id,
        channel: input.channel,
        sourceKey: input.sourceKey,
        sourceLabel: input.sourceLabel,
        capturedAt: input.capturedAt,
        nativeKey: input.nativeKey,
        title: input.title,
        body: input.body,
        status: input.status,
        reason: input.reason,
        resolutionJson: input.resolution ? JSON.stringify(input.resolution) : null,
        parserVersion: input.parserVersion,
        transactionId: input.transactionId,
        duplicateOf: input.duplicateOf,
        dedupeKey: input.dedupeKey,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
    return true;
  }

  exists(id: string): boolean {
    const db = getDb();
    const row = db
      .select({ id: autoLogCapturesTable.id })
      .from(autoLogCapturesTable)
      .where(eq(autoLogCapturesTable.id, id))
      .get();
    return !!row;
  }

  getById(id: string): PaymentAlertCapture | null {
    const db = getDb();
    const row = db
      .select()
      .from(autoLogCapturesTable)
      .where(and(eq(autoLogCapturesTable.id, id), isNull(autoLogCapturesTable.deletedAt)))
      .get();
    return row ? toPaymentAlertCapture(row) : null;
  }

  /** Every capture since `sinceIso`, for de-duplication. */
  listSince(sinceIso: string): PaymentAlertCapture[] {
    const db = getDb();
    return db
      .select()
      .from(autoLogCapturesTable)
      .where(
        and(gte(autoLogCapturesTable.capturedAt, sinceIso), isNull(autoLogCapturesTable.deletedAt)),
      )
      .all()
      .map(toPaymentAlertCapture);
  }

  /** Ids of transactions an alert created, so dedupe never matches an alert against itself. */
  listLoggedTransactionIds(sinceIso: string): string[] {
    const db = getDb();
    return db
      .select({ transactionId: autoLogCapturesTable.transactionId })
      .from(autoLogCapturesTable)
      .where(
        and(
          eq(autoLogCapturesTable.status, 'logged'),
          gte(autoLogCapturesTable.capturedAt, sinceIso),
          isNull(autoLogCapturesTable.deletedAt),
        ),
      )
      .all()
      .map((row) => row.transactionId)
      .filter((id): id is string => !!id);
  }

  update(
    id: string,
    input: Partial<{
      status: PaymentAlertStatus;
      title: null;
      body: null;
      reason: PaymentAlertReason | null;
      transactionId: string | null;
      duplicateOf: string | null;
      resolution: PaymentAlertResolution | null;
      parserVersion: number;
    }>,
  ) {
    const db = getDb();
    const { resolution, ...columns } = input;
    db.update(autoLogCapturesTable)
      .set({
        ...columns,
        // A retry can become irrelevant after a settings change. Discard its
        // original text just as we do when inserting a newly ignored alert.
        ...(input.status === 'ignored' ? { title: null, body: null } : {}),
        ...(resolution !== undefined
          ? { resolutionJson: resolution ? JSON.stringify(resolution) : null }
          : {}),
        updatedAt: nowIso(),
      })
      .where(and(eq(autoLogCapturesTable.id, id), isNull(autoLogCapturesTable.deletedAt)))
      .run();
  }

  /** Detach captures from deleted transactions so de-duplication uses live records. */
  markTransactionsDeleted(transactionIds: readonly string[]): number {
    if (transactionIds.length === 0) return 0;
    const db = getDb();
    let changed = 0;
    // SQLite caps bound parameters; a bulk delete can name thousands of rows.
    for (let start = 0; start < transactionIds.length; start += 500) {
      const chunk = transactionIds.slice(start, start + 500);
      const result = db
        .update(autoLogCapturesTable)
        .set({ status: 'dismissed', reason: 'user', transactionId: null, updatedAt: nowIso() })
        .where(
          and(
            inArray(autoLogCapturesTable.transactionId, [...chunk]),
            isNull(autoLogCapturesTable.deletedAt),
          ),
        )
        .run();
      changed += result.changes ?? 0;
    }
    return changed;
  }

  /**
   * Retention: expire legacy pending records, remove raw text, and delete old rows.
   */
  sweep(now: Date = new Date()) {
    const db = getDb();
    const before = (days: number) => new Date(now.getTime() - days * DAY_MS).toISOString();
    const stamp = now.toISOString();

    db.update(autoLogCapturesTable)
      .set({ status: 'dismissed', reason: 'user', updatedAt: stamp })
      .where(
        and(
          eq(autoLogCapturesTable.status, 'pending'),
          lt(autoLogCapturesTable.parserVersion, 5),
          lt(autoLogCapturesTable.capturedAt, before(PENDING_DAYS)),
          isNull(autoLogCapturesTable.deletedAt),
        ),
      )
      .run();
    db.update(autoLogCapturesTable)
      .set({ title: null, body: null, updatedAt: stamp })
      .where(
        and(
          eq(autoLogCapturesTable.status, 'ignored'),
          lt(autoLogCapturesTable.capturedAt, before(IGNORED_TEXT_DAYS)),
          isNull(autoLogCapturesTable.deletedAt),
        ),
      )
      .run();
    db.update(autoLogCapturesTable)
      .set({ title: null, body: null, updatedAt: stamp })
      .where(
        and(
          inArray(autoLogCapturesTable.status, ['logged', 'dismissed', 'duplicate', 'failed']),
          lt(autoLogCapturesTable.capturedAt, before(SETTLED_TEXT_DAYS)),
          isNull(autoLogCapturesTable.deletedAt),
        ),
      )
      .run();
    db.delete(autoLogCapturesTable)
      .where(
        and(
          lt(autoLogCapturesTable.capturedAt, before(ROW_DAYS)),
          inArray(autoLogCapturesTable.status, [
            'logged',
            'dismissed',
            'ignored',
            'duplicate',
            'failed',
          ]),
        ),
      )
      .run();
  }
}

export const paymentAlertCapturesRepository = new PaymentAlertCapturesRepository();
