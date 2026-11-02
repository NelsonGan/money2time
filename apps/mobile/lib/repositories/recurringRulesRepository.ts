import { and, eq, gte, isNull, lt, lte } from 'drizzle-orm';

import { getDb } from '~/lib/db/client';
import { getActiveLedgerId, inActiveLedger } from '~/lib/db/ledgerScope';
import { accountsTable, recurringRulesTable, transactionsTable } from '~/lib/db/schema';
import type { ProcessedRecurringRule, RecurrencePattern, RecurringTransactionRule } from '~/types';
import { buildRateTable, convert } from '~/utils/currency';
import { newId, nowIso } from '~/utils/id';
// Shared with the screen's forecast so the dates it projects are the dates this
// runner will actually write.
import {
  effectiveAnchorDay,
  isAfterRecurringEndDate,
  isAnchorDay,
  isSameRunDay,
  nextRunAfter,
  runDayKeyOf,
  runDayOf,
} from '~/utils/recurringRules';
import { repairRecurringSchedule } from '~/utils/recurringScheduleRepair';

import { exchangeRatesRepository } from './exchangeRatesRepository';
import { ledgersRepository } from './ledgersRepository';
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
  logoId?: string | null;
  recurrencePattern: Exclude<RecurrencePattern, 'none'>;
  recurrenceInterval?: number;
  nextRunDate: string;
  /**
   * The day of the month a monthly or yearly rule is for, when `nextRunDate`
   * is not on it: a loan paid on the 31st whose first instalment falls on
   * November 30. Left out, it is `nextRunDate`'s own day.
   */
  anchorDay?: number | null;
  endDate?: string | null;
  isActive?: boolean;
  /**
   * Stamps every transfer this rule generates as spending. Loan auto-repayment
   * only; see `utils/spending.ts`.
   */
  countsAsExpense?: boolean;
}

function normalizeInterval(value: number | undefined) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
}

/** The anchor day a rule starting on `nextRunDate` gets, unless one is given. */
function anchorDayFor(nextRunDate: string, requested: number | null | undefined): number | null {
  if (isAnchorDay(requested)) return requested;
  return runDayOf(nextRunDate)?.day ?? null;
}

/** The day of the month `iso` falls on, in local time. */
function localDayOfMonth(iso: string): number | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.getDate();
}

/** `rr:<ruleId>:<YYYY-MM-DD>`: the run date the id was named after. */
const RUN_ID_DATE = /:(\d{4}-\d{2}-\d{2})$/;

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
      .where(and(isNull(recurringRulesTable.deletedAt), inActiveLedger(recurringRulesTable)))
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
        ledgerId: getActiveLedgerId(),
        name: input.name.trim(),
        type: input.type,
        amount: input.amount,
        currency: input.currency,
        accountId: input.accountId ?? null,
        fromAccountId: input.fromAccountId ?? null,
        toAccountId: input.toAccountId ?? null,
        categoryId: input.categoryId ?? null,
        note: input.note ?? null,
        logoId: input.logoId ?? null,
        recurrencePattern: input.recurrencePattern,
        recurrenceInterval: normalizeInterval(input.recurrenceInterval),
        nextRunDate: input.nextRunDate,
        anchorDay: anchorDayFor(input.nextRunDate, input.anchorDay),
        endDate: input.endDate ?? null,
        isActive: input.isActive ?? true,
        countsAsExpense: input.countsAsExpense ?? false,
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
        anchorDay: this.anchorDayForUpdate(id, updates),
        recurrenceInterval: updates.recurrenceInterval
          ? normalizeInterval(updates.recurrenceInterval)
          : undefined,
        name: updates.name?.trim(),
        updatedAt: nowIso(),
      })
      .where(and(eq(recurringRulesTable.id, id), isNull(recurringRulesTable.deletedAt)))
      .run();
  }

  /**
   * The anchor day an update writes, or undefined to keep the rule's. Every
   * edit sends the date the editor showed, which is the rule's own next run
   * date, so the anchor moves only when that date is changed to another day:
   * otherwise saving a rule on the 31st while it waits on November 30 would
   * re-anchor it to the 30th.
   */
  private anchorDayForUpdate(
    id: string,
    updates: Partial<CreateRecurringRuleInput>,
  ): number | null | undefined {
    if (isAnchorDay(updates.anchorDay)) return updates.anchorDay;
    if (updates.nextRunDate === undefined) return undefined;
    const current = getDb()
      .select({ nextRunDate: recurringRulesTable.nextRunDate })
      .from(recurringRulesTable)
      .where(eq(recurringRulesTable.id, id))
      .get();
    if (current && isSameRunDay(current.nextRunDate, updates.nextRunDate)) return undefined;
    return anchorDayFor(updates.nextRunDate, null);
  }

  /**
   * Give every rule saved before anchor days (migration 077) its anchor, and
   * move its next run date back onto it (see utils/recurringScheduleRepair.ts).
   * AppContext runs it before every `runDueTransactions`, so rules that arrive without one
   * later (a restored older backup, an older phone through Cloud Sync) are
   * repaired too; once a rule has its anchor it is never read here again.
   *
   * `updated_at` is left alone, as migration 076 does: every phone repairs its
   * own copy the same way, and a newer stamp would make Cloud Sync prefer this
   * phone's copy over a newer edit from another.
   */
  repairLegacySchedules() {
    const db = getDb();
    const rules = db
      .select({
        id: recurringRulesTable.id,
        type: recurringRulesTable.type,
        toAccountId: recurringRulesTable.toAccountId,
        recurrencePattern: recurringRulesTable.recurrencePattern,
        recurrenceInterval: recurringRulesTable.recurrenceInterval,
        nextRunDate: recurringRulesTable.nextRunDate,
        createdAt: recurringRulesTable.createdAt,
      })
      .from(recurringRulesTable)
      .where(and(isNull(recurringRulesTable.deletedAt), isNull(recurringRulesTable.anchorDay)))
      .all();

    rules.forEach((rule) => {
      // Every run the rule made, deleted ones included, by the id range its
      // runs are named in (the primary key, so no scan). A run whose date was
      // edited afterwards no longer says where the schedule was.
      const prefix = `rr:${rule.id}:`;
      const runDates = db
        .select({ id: transactionsTable.id, date: transactionsTable.date })
        .from(transactionsTable)
        .where(and(gte(transactionsTable.id, prefix), lt(transactionsTable.id, `rr:${rule.id};`)))
        .all()
        .filter((run) => {
          // Named after the UTC date before migration 077, the run day since.
          const named = RUN_ID_DATE.exec(run.id)?.[1];
          return named === run.date.slice(0, 10) || named === runDayKeyOf(run.date);
        })
        .map((run) => run.date);

      // What the rule's target records about the day it is for: a loan's
      // payment day, or for a goal's auto-save the day it was set up (the
      // goal editor starts it a month on, already shortened to that month).
      let intendedDay: number | null = null;
      if (rule.type === 'transfer' && rule.toAccountId) {
        const target = db
          .select({ type: accountsTable.type, loanPaymentDay: accountsTable.loanPaymentDay })
          .from(accountsTable)
          .where(eq(accountsTable.id, rule.toAccountId))
          .get();
        if (target?.type === 'loan') intendedDay = target.loanPaymentDay ?? null;
        if (target?.type === 'goal') intendedDay = localDayOfMonth(rule.createdAt);
      }

      const repaired = repairRecurringSchedule({
        nextRunDate: rule.nextRunDate,
        recurrencePattern: rule.recurrencePattern as RecurrencePattern,
        recurrenceInterval: rule.recurrenceInterval,
        runDates,
        intendedDay,
      });
      if (!repaired) return;
      db.update(recurringRulesTable)
        .set({ anchorDay: repaired.anchorDay, nextRunDate: repaired.nextRunDate })
        .where(eq(recurringRulesTable.id, rule.id))
        .run();
    });
  }

  softDelete(id: string) {
    const db = getDb();
    const now = nowIso();
    db.update(recurringRulesTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(recurringRulesTable.id, id), isNull(recurringRulesTable.deletedAt)))
      .run();
  }

  /**
   * Deactivate every live transfer rule paying into an account. Used when a
   * savings goal is archived so auto-saves stop instead of silently piling
   * into a hidden goal.
   */
  deactivateTransfersInto(accountId: string) {
    const db = getDb();
    db.update(recurringRulesTable)
      .set({ isActive: false, updatedAt: nowIso() })
      .where(
        and(
          isNull(recurringRulesTable.deletedAt),
          eq(recurringRulesTable.isActive, true),
          eq(recurringRulesTable.type, 'transfer'),
          eq(recurringRulesTable.toAccountId, accountId),
        ),
      )
      .run();
  }

  runDueTransactions(todayIso: string = nowIso(), maxRules: number = 10): ProcessedRecurringRule[] {
    const db = getDb();
    const dueRules = db
      .select()
      .from(recurringRulesTable)
      .where(
        and(
          isNull(recurringRulesTable.deletedAt),
          // Only the open ledger's rules: the transactions they write land in
          // it. Another ledger's rules catch up when that ledger is opened.
          inActiveLedger(recurringRulesTable),
          eq(recurringRulesTable.isActive, true),
          lte(recurringRulesTable.nextRunDate, todayIso),
        ),
      )
      .orderBy(recurringRulesTable.nextRunDate)
      .limit(maxRules)
      .all()
      .map(toRecurringRule);

    if (dueRules.length === 0) return [];

    // Build the FX context so generated transactions carry the same frozen
    // reporting snapshot / account-currency value / cross-currency to-amount
    // that the editor would produce — otherwise foreign-currency rules would
    // be counted at face value in main-currency totals.
    // The open ledger's currency, which is the settings row's on the default one.
    const reporting = ledgersRepository.activeReportingCurrency().code;
    const rateTable = buildRateTable(reporting, exchangeRatesRepository.listByBase(reporting));
    const accountCurrencyById = new Map(
      db
        .select({ id: accountsTable.id, currency: accountsTable.currency })
        .from(accountsTable)
        .all()
        .map((row) => [row.id, row.currency]),
    );

    const processed: ProcessedRecurringRule[] = [];

    dueRules.forEach((rule) => {
      // One id per rule and run date: two phones that both run a due rule
      // (Cloud Sync) make the same row instead of two, and a run that already
      // happened (even if since deleted) is never made again.
      const createRun = (input: Parameters<typeof transactionsRepository.create>[0]) => {
        const id = recurringRunTransactionId(rule.id, input.date);
        const exists = db
          .select({ id: transactionsTable.id })
          .from(transactionsTable)
          .where(eq(transactionsTable.id, id))
          .get();
        if (!exists) transactionsRepository.createWithId(id, input);
      };
      let cursor = rule.nextRunDate;
      // The day of the month this run keeps; a stored anchor the run date has
      // moved off (an older phone moved it) gives way to the run date's day.
      const start = runDayOf(cursor);
      const anchorDay = start ? effectiveAnchorDay(start, rule.anchorDay) : rule.anchorDay;
      let guard = 0;
      while (cursor <= todayIso && guard < 500) {
        if (!isAfterRecurringEndDate(cursor, rule.endDate)) {
          if (rule.type === 'transfer') {
            if (rule.fromAccountId && rule.toAccountId && rule.fromAccountId !== rule.toAccountId) {
              const toCurrency = accountCurrencyById.get(rule.toAccountId) ?? rule.currency;
              const crossCurrency = toCurrency !== rule.currency;
              // A counted transfer (loan auto-repayment) is read by the spending
              // totals, which all read the frozen reporting figure — so it gets
              // the same snapshot an expense would, and carries the rule's
              // category so it lands in the breakdown and depletes a budget line.
              // An ordinary transfer keeps the nulls it has always had.
              const counted = rule.countsAsExpense;
              const snapshot = counted
                ? convert(rule.amount, rule.currency, reporting, rateTable)
                : null;
              createRun({
                type: 'transfer',
                amount: rule.amount,
                currency: rule.currency,
                reportingCurrency: counted ? reporting : null,
                reportingAmount: snapshot ? snapshot.value : null,
                fxRate: snapshot
                  ? (snapshot.rateUsed ?? (rule.currency === reporting ? 1 : null))
                  : null,
                // Credit the destination in its own currency for cross-currency rules.
                toAmount: crossCurrency
                  ? convert(rule.amount, rule.currency, toCurrency, rateTable).value
                  : null,
                date: cursor,
                fromAccountId: rule.fromAccountId,
                toAccountId: rule.toAccountId,
                categoryId: counted ? rule.categoryId : null,
                note: rule.note,
                countsAsExpense: counted,
              });
            }
          } else if (rule.accountId && rule.categoryId) {
            const accountCurrency = accountCurrencyById.get(rule.accountId) ?? reporting;
            const { value: reportingAmount, rateUsed } = convert(
              rule.amount,
              rule.currency,
              reporting,
              rateTable,
            );
            createRun({
              type: rule.type,
              amount: rule.amount,
              currency: rule.currency,
              reportingCurrency: reporting,
              reportingAmount,
              fxRate: rateUsed ?? (rule.currency === reporting ? 1 : null),
              // Freeze the account-currency value when the rule's currency differs.
              accountAmount:
                rule.currency !== accountCurrency
                  ? convert(rule.amount, rule.currency, accountCurrency, rateTable).value
                  : null,
              date: cursor,
              accountId: rule.accountId,
              categoryId: rule.categoryId,
              note: rule.note,
            });
          }
        }
        const next = nextRunAfter(
          cursor,
          rule.recurrencePattern,
          rule.recurrenceInterval,
          anchorDay,
        );
        if (!next) break;
        cursor = next;
        guard += 1;
      }

      const shouldDeactivate = isAfterRecurringEndDate(cursor, rule.endDate);
      db.update(recurringRulesTable)
        .set({
          nextRunDate: cursor,
          // A rule still without one waits for `repairLegacySchedules`, which
          // can only read its history while the anchor is missing.
          ...(rule.anchorDay != null ? { anchorDay } : {}),
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

/**
 * The transaction a recurring rule makes on one run date, named after the
 * run's calendar day. Run dates are local midnight, a different instant in
 * each time zone, so the day (not the stored instant's UTC date) is what two
 * phones sharing a ledger in different zones agree on. Runs made before
 * migration 077 were named after the UTC date, which is the same day for a
 * bare day key and the day before for a local midnight east of UTC.
 */
export function recurringRunTransactionId(ruleId: string, date: string): string {
  return `rr:${ruleId}:${runDayKeyOf(date) ?? date.slice(0, 10)}`;
}

export const recurringRulesRepository = new RecurringRulesRepository();
