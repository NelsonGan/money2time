import { and, eq, isNull, lte } from 'drizzle-orm';

import { getDb } from '~/lib/db/client';
import { recurringRulesTable } from '~/lib/db/schema';
import type { ProcessedRecurringRule, RecurrencePattern,RecurringTransactionRule } from '~/types';
import { newId, nowIso } from '~/utils/id';

import { toRecurringRule } from './mappers';
import { transactionsRepository } from './transactionsRepository';

export interface CreateRecurringRuleInput {
  name: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  currency: string;
  accountId?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  note?: string | null;
  recurrencePattern: Exclude<RecurrencePattern, 'none'>;
  recurrenceInterval?: number;
  nextRunDate: string;
  endDate?: string | null;
  isActive?: boolean;
}

function normalizeInterval(value: number | undefined) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, last));
  return next;
}

function addYears(date: Date, years: number) {
  return addMonths(date, years * 12);
}

function nextRunFrom(
  dateIso: string,
  pattern: CreateRecurringRuleInput['recurrencePattern'],
  interval: number,
) {
  const base = new Date(dateIso);
  if (Number.isNaN(base.getTime())) return null;
  switch (pattern) {
    case 'daily':
      return addDays(base, interval).toISOString();
    case 'weekly':
      return addDays(base, interval * 7).toISOString();
    case 'monthly':
      return addMonths(base, interval).toISOString();
    case 'yearly':
      return addYears(base, interval).toISOString();
    default:
      return null;
  }
}

function validateRuleInput(input: CreateRecurringRuleInput) {
  if (input.type === 'transfer') {
    return (
      !!input.fromAccountId && !!input.toAccountId && input.fromAccountId !== input.toAccountId
    );
  }
  return !!input.accountId && !!input.categoryId;
}

class RecurringRulesRepository {
  list(): RecurringTransactionRule[] {
    const db = getDb();
    return db
      .select()
      .from(recurringRulesTable)
      .where(isNull(recurringRulesTable.deletedAt))
      .orderBy(recurringRulesTable.nextRunDate, recurringRulesTable.createdAt)
      .all()
      .map(toRecurringRule);
  }

  create(input: CreateRecurringRuleInput) {
    if (!validateRuleInput(input)) return;
    const db = getDb();
    const now = nowIso();
    db.insert(recurringRulesTable)
      .values({
        id: newId(),
        name: input.name.trim(),
        type: input.type,
        amount: input.amount,
        currency: input.currency,
        accountId: input.accountId ?? null,
        fromAccountId: input.fromAccountId ?? null,
        toAccountId: input.toAccountId ?? null,
        categoryId: input.categoryId ?? null,
        note: input.note ?? null,
        recurrencePattern: input.recurrencePattern,
        recurrenceInterval: normalizeInterval(input.recurrenceInterval),
        nextRunDate: input.nextRunDate,
        endDate: input.endDate ?? null,
        isActive: input.isActive ?? true,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
  }

  update(id: string, updates: Partial<CreateRecurringRuleInput>) {
    const db = getDb();
    db.update(recurringRulesTable)
      .set({
        ...updates,
        recurrenceInterval: updates.recurrenceInterval
          ? normalizeInterval(updates.recurrenceInterval)
          : undefined,
        name: updates.name?.trim(),
        updatedAt: nowIso(),
      })
      .where(and(eq(recurringRulesTable.id, id), isNull(recurringRulesTable.deletedAt)))
      .run();
  }

  softDelete(id: string) {
    const db = getDb();
    const now = nowIso();
    db.update(recurringRulesTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(recurringRulesTable.id, id), isNull(recurringRulesTable.deletedAt)))
      .run();
  }

  runDueTransactions(
    todayIso: string = nowIso(),
    maxRules: number = 10,
  ): ProcessedRecurringRule[] {
    const db = getDb();
    const dueRules = db
      .select()
      .from(recurringRulesTable)
      .where(
        and(
          isNull(recurringRulesTable.deletedAt),
          eq(recurringRulesTable.isActive, true),
          lte(recurringRulesTable.nextRunDate, todayIso),
        ),
      )
      .orderBy(recurringRulesTable.nextRunDate)
      .limit(maxRules)
      .all()
      .map(toRecurringRule);

    if (dueRules.length === 0) return [];

    const processed: ProcessedRecurringRule[] = [];

    dueRules.forEach((rule) => {
      let cursor = rule.nextRunDate;
      let guard = 0;
      while (cursor <= todayIso && guard < 500) {
        if (!rule.endDate || cursor <= rule.endDate) {
          if (rule.type === 'transfer') {
            if (rule.fromAccountId && rule.toAccountId && rule.fromAccountId !== rule.toAccountId) {
              transactionsRepository.create({
                type: 'transfer',
                amount: rule.amount,
                currency: rule.currency,
                date: cursor,
                fromAccountId: rule.fromAccountId,
                toAccountId: rule.toAccountId,
                note: rule.note,
              });
            }
          } else if (rule.accountId && rule.categoryId) {
            transactionsRepository.create({
              type: rule.type,
              amount: rule.amount,
              currency: rule.currency,
              date: cursor,
              accountId: rule.accountId,
              categoryId: rule.categoryId,
              note: rule.note,
            });
          }
        }
        const next = nextRunFrom(cursor, rule.recurrencePattern, rule.recurrenceInterval);
        if (!next) break;
        cursor = next;
        guard += 1;
      }

      const shouldDeactivate = !!rule.endDate && cursor > rule.endDate;
      db.update(recurringRulesTable)
        .set({
          nextRunDate: cursor,
          isActive: shouldDeactivate ? false : rule.isActive,
          updatedAt: nowIso(),
        })
        .where(and(eq(recurringRulesTable.id, rule.id), isNull(recurringRulesTable.deletedAt)))
        .run();

      processed.push({
        name: rule.name,
        type: rule.type,
        amount: rule.amount,
        currency: rule.currency,
      });
    });

    return processed;
  }
}

export const recurringRulesRepository = new RecurringRulesRepository();
