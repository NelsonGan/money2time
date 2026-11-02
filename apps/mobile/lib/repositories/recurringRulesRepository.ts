import { and, eq, isNull, lte } from 'drizzle-orm';

import {
  buildInstalmentProgress,
  INSTALMENT_PAYOFF_NUMBER,
  isInstalmentPlan,
  paymentRowsForPlan,
  scheduleOfPlan,
  splitInstalmentAmounts,
} from '~/features/instalments/lib/instalmentPlan';
import { getDb, getSQLite } from '~/lib/db/client';
import { getActiveLedgerId, inActiveLedger } from '~/lib/db/ledgerScope';
import { accountsTable, recurringRulesTable, transactionsTable } from '~/lib/db/schema';
import type {
  ProcessedRecurringRule,
  RecurrencePattern,
  RecurringTransactionRule,
  TransactionSentiment,
} from '~/types';
import { buildRateTable, convert } from '~/utils/currency';
import { newId, nowIso } from '~/utils/id';
// Shared with the screen's forecast so the dates it projects are the dates this
// runner will actually write.
import { isAfterRecurringEndDate, nextRunAfter } from '~/utils/recurringRules';

import { exchangeRatesRepository } from './exchangeRatesRepository';
import { ledgersRepository } from './ledgersRepository';
import { toRecurringRule } from './mappers';
import { type CreateTransactionInput, transactionsRepository } from './transactionsRepository';

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
  endDate?: string | null;
  isActive?: boolean;
  /**
   * Stamps every transfer this rule generates as spending. Loan auto-repayment
   * only; see `utils/spending.ts`.
   */
  countsAsExpense?: boolean;
  /** Instalment plans only (see `CreateInstalmentPlanInput`). */
  instalmentCount?: number | null;
  instalmentTotal?: number | null;
  instalmentStartDate?: string | null;
}

export interface CreateInstalmentPlanInput {
  name: string;
  total: number;
  count: number;
  currency: string;
  accountId: string;
  categoryId: string;
  note?: string | null;
  recurrencePattern: 'monthly' | 'weekly';
  recurrenceInterval: number;
  /** The first payment's date (ISO). Every later one is counted from it. */
  startDate: string;
  /**
   * What the add form held beyond the plan: kept on the first payment when it
   * is made right away (its date is today or earlier).
   */
  firstPayment?: {
    details?: string | null;
    receiptUri?: string | null;
    sentiment?: TransactionSentiment;
    reimbursable?: boolean;
  };
}

export interface CreatedInstalmentPlan {
  ruleId: string;
  /** The first payment, when it was due and made at once. */
  firstPaymentId: string | null;
}

/** The FX context a run is written with, shared by every rule in one pass. */
interface RunContext {
  reporting: string;
  rateTable: ReturnType<typeof buildRateTable>;
  accountCurrencyById: Map<string, string>;
}

function buildRunContext(): RunContext {
  // The open ledger's currency, which is the settings row's on the default one.
  const reporting = ledgersRepository.activeReportingCurrency().code;
  const rateTable = buildRateTable(reporting, exchangeRatesRepository.listByBase(reporting));
  const accountCurrencyById = new Map(
    getDb()
      .select({ id: accountsTable.id, currency: accountsTable.currency })
      .from(accountsTable)
      .all()
      .map((row) => [row.id, row.currency]),
  );
  return { reporting, rateTable, accountCurrencyById };
}

/**
 * The expense or income row a rule writes on `date` for `amount`, with the
 * same frozen reporting snapshot and account-currency value the editor would
 * produce, so foreign-currency rules are never counted at face value.
 */
function categorizedRunInput(
  rule: RecurringTransactionRule,
  context: RunContext,
  date: string,
  amount: number,
): CreateTransactionInput {
  const { reporting, rateTable, accountCurrencyById } = context;
  const accountCurrency = (rule.accountId && accountCurrencyById.get(rule.accountId)) || reporting;
  const { value: reportingAmount, rateUsed } = convert(amount, rule.currency, reporting, rateTable);
  return {
    type: rule.type === 'income' ? 'income' : 'expense',
    amount,
    currency: rule.currency,
    reportingCurrency: reporting,
    reportingAmount,
    fxRate: rateUsed ?? (rule.currency === reporting ? 1 : null),
    // Freeze the account-currency value when the rule's currency differs.
    accountAmount:
      rule.currency !== accountCurrency
        ? convert(amount, rule.currency, accountCurrency, rateTable).value
        : null,
    date,
    accountId: rule.accountId,
    categoryId: rule.categoryId,
    note: rule.note,
  };
}

/** Writes a run once: an id that exists (even deleted) is never written again. */
function writeRunOnce(id: string, input: CreateTransactionInput): boolean {
  const exists = getDb()
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(eq(transactionsTable.id, id))
    .get();
  if (exists) return false;
  transactionsRepository.createWithId(id, input);
  return true;
}

/**
 * The id for a payment a plan makes outside its schedule (early, or the
 * payoff). Prefers the scheduled run's own id so the runner skips that date,
 * and falls back to a fresh one if that id was used before and deleted.
 */
function freshRunId(preferred: string): string {
  const taken = getDb()
    .select({ id: transactionsTable.id })
    .from(transactionsTable)
    .where(eq(transactionsTable.id, preferred))
    .get();
  return taken ? `${preferred}:${newId()}` : preferred;
}

function normalizeInterval(value: number | undefined) {
  const parsed = Number(value ?? 1);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : 1;
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
      .where(and(isNull(recurringRulesTable.deletedAt), inActiveLedger(recurringRulesTable)))
      .orderBy(recurringRulesTable.nextRunDate, recurringRulesTable.createdAt)
      .all()
      .map(toRecurringRule);
  }

  create(input: CreateRecurringRuleInput): string | null {
    if (!validateRuleInput(input)) return null;
    const db = getDb();
    const now = nowIso();
    const id = newId();
    db.insert(recurringRulesTable)
      .values({
        id,
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
        endDate: input.endDate ?? null,
        isActive: input.isActive ?? true,
        countsAsExpense: input.countsAsExpense ?? false,
        instalmentCount: input.instalmentCount ?? null,
        instalmentTotal: input.instalmentTotal ?? null,
        instalmentStartDate: input.instalmentStartDate ?? null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .run();
    return id;
  }

  get(id: string): RecurringTransactionRule | null {
    const row = getDb()
      .select()
      .from(recurringRulesTable)
      .where(and(eq(recurringRulesTable.id, id), isNull(recurringRulesTable.deletedAt)))
      .get();
    return row ? toRecurringRule(row) : null;
  }

  /**
   * Saves an instalment plan as a recurring rule and, when the first payment
   * is due today or earlier, makes it straight away so it keeps what the add
   * form held (a receipt, the longer note, the mood). The runner makes every
   * other due payment on the next load.
   */
  createInstalmentPlan(
    input: CreateInstalmentPlanInput,
    todayIso: string = nowIso(),
  ): CreatedInstalmentPlan | null {
    const count = Math.trunc(input.count);
    if (!input.accountId || !input.categoryId || count < 2) return null;
    if (!Number.isFinite(input.total) || input.total <= 0) return null;
    const amounts = splitInstalmentAmounts(input.total, count);
    const schedule = {
      instalmentCount: count,
      instalmentStartDate: input.startDate,
      nextRunDate: input.startDate,
      recurrencePattern: input.recurrencePattern,
      recurrenceInterval: normalizeInterval(input.recurrenceInterval),
    };
    const dates = scheduleOfPlan(schedule);
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    if (!firstDate || !lastDate || dates.length !== count) return null;

    const ruleId = this.create({
      name: input.name,
      type: 'expense',
      amount: amounts[0] ?? 0,
      currency: input.currency,
      accountId: input.accountId,
      categoryId: input.categoryId,
      note: input.note ?? null,
      recurrencePattern: input.recurrencePattern,
      recurrenceInterval: schedule.recurrenceInterval,
      nextRunDate: firstDate,
      endDate: lastDate,
      instalmentCount: count,
      instalmentTotal: input.total,
      instalmentStartDate: firstDate,
    });
    if (!ruleId) return null;

    let firstPaymentId: string | null = null;
    if (firstDate <= todayIso) {
      const rule = this.get(ruleId);
      if (rule) {
        const id = recurringRunTransactionId(ruleId, firstDate);
        const wrote = writeRunOnce(id, {
          ...categorizedRunInput(rule, buildRunContext(), firstDate, amounts[0] ?? 0),
          details: input.firstPayment?.details ?? null,
          receiptUri: input.firstPayment?.receiptUri ?? null,
          sentiment: input.firstPayment?.sentiment,
          reimbursable: input.firstPayment?.reimbursable ?? false,
          instalmentRuleId: ruleId,
          instalmentNumber: 1,
        });
        if (wrote) firstPaymentId = id;
        this.advanceInstalmentPlan(ruleId, dates[1] ?? null);
      }
    }
    return { ruleId, firstPaymentId };
  }

  /**
   * Makes the plan's next upcoming payment now, dated `todayIso`. Returns the
   * payment's id, or null when nothing is left to pay.
   */
  payNextInstalment(ruleId: string, todayIso: string = nowIso()): string | null {
    const rule = this.get(ruleId);
    if (!rule || !isInstalmentPlan(rule)) return null;
    const progress = buildInstalmentProgress(rule, this.instalmentPayments(rule));
    const next = progress.next;
    if (!next) return null;
    const id = freshRunId(recurringRunTransactionId(rule.id, next.dateIso));
    transactionsRepository.createWithId(id, {
      ...categorizedRunInput(rule, buildRunContext(), todayIso, next.amount),
      instalmentRuleId: rule.id,
      instalmentNumber: next.number,
    });
    const after = progress.entries.find(
      (entry) => entry.status === 'upcoming' && entry.number > next.number,
    );
    this.advanceInstalmentPlan(rule.id, after?.dateIso ?? null);
    return id;
  }

  /**
   * Pays everything still to come in one payment dated `todayIso` and ends the
   * plan. Returns the payment's id, or null when nothing is left to pay.
   */
  payOffInstalmentPlan(ruleId: string, todayIso: string = nowIso()): string | null {
    const rule = this.get(ruleId);
    if (!rule || !isInstalmentPlan(rule)) return null;
    const progress = buildInstalmentProgress(rule, this.instalmentPayments(rule));
    if (progress.leftAmount <= 0) return null;
    const id = freshRunId(`rr:${rule.id}:payoff`);
    transactionsRepository.createWithId(id, {
      ...categorizedRunInput(rule, buildRunContext(), todayIso, progress.leftAmount),
      instalmentRuleId: rule.id,
      instalmentNumber: INSTALMENT_PAYOFF_NUMBER,
    });
    this.advanceInstalmentPlan(rule.id, null);
    return id;
  }

  /**
   * Deletes a plan: its upcoming payments go with it (they only exist as the
   * rule). Returns the ids of the payments already made, so a caller that
   * removes those too can do it through the normal transaction delete, which
   * also cleans up what hangs off a row (album joins, receipts, splits).
   */
  deleteInstalmentPlan(ruleId: string): string[] {
    const rule = this.get(ruleId);
    if (!rule) return [];
    const paymentIds = isInstalmentPlan(rule)
      ? this.instalmentPayments(rule)
          .filter((payment) => !payment.deletedAt)
          .map((payment) => payment.id)
      : [];
    this.softDelete(ruleId);
    return paymentIds;
  }

  /** Every row that is a payment of the plan, live or deleted. */
  instalmentPayments(rule: RecurringTransactionRule) {
    const rows = getSQLite().getAllSync<{
      id: string;
      amount: number;
      date: string;
      instalment_rule_id: string | null;
      instalment_number: number | null;
      deleted_at: string | null;
    }>(
      // The run ids `rr:<plan>:…` as a primary-key range (';' sorts right
      // after ':'), so both halves of the OR are served from an index.
      `SELECT id, amount, date, instalment_rule_id, instalment_number, deleted_at
         FROM transactions
        WHERE instalment_rule_id = ? OR (id >= ? AND id < ?)`,
      [rule.id, `rr:${rule.id}:`, `rr:${rule.id};`],
    );
    return paymentRowsForPlan(
      rule,
      rows.map((row) => ({
        id: row.id,
        amount: row.amount,
        date: row.date,
        instalmentRuleId: row.instalment_rule_id,
        instalmentNumber: row.instalment_number,
        deletedAt: row.deleted_at,
      })),
    );
  }

  /** Moves the plan on to its next payment, or ends it when there is none. */
  private advanceInstalmentPlan(ruleId: string, nextDate: string | null) {
    getDb()
      .update(recurringRulesTable)
      .set(
        nextDate
          ? { nextRunDate: nextDate, updatedAt: nowIso() }
          : { isActive: false, updatedAt: nowIso() },
      )
      .where(and(eq(recurringRulesTable.id, ruleId), isNull(recurringRulesTable.deletedAt)))
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
    const context = buildRunContext();
    const { reporting, rateTable, accountCurrencyById } = context;

    const processed: ProcessedRecurringRule[] = [];

    dueRules.forEach((rule) => {
      if (isInstalmentPlan(rule)) {
        const made = this.runInstalmentPlan(rule, todayIso, context);
        if (made > 0) {
          processed.push({
            name: rule.name,
            type: rule.type,
            amount: rule.amount,
            currency: rule.currency,
          });
        }
        return;
      }
      // One id per rule and run date: two phones that both run a due rule
      // (Cloud Sync) make the same row instead of two, and a run that already
      // happened (even if since deleted) is never made again.
      const createRun = (input: CreateTransactionInput) => {
        writeRunOnce(recurringRunTransactionId(rule.id, input.date), input);
      };
      let cursor = rule.nextRunDate;
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
            createRun(categorizedRunInput(rule, context, cursor, rule.amount));
          }
        }
        const next = nextRunAfter(cursor, rule.recurrencePattern, rule.recurrenceInterval);
        if (!next) break;
        cursor = next;
        guard += 1;
      }

      const shouldDeactivate = isAfterRecurringEndDate(cursor, rule.endDate);
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

  /**
   * Makes every payment of a plan that has fallen due since it last ran, on
   * the plan's own dates (counted from the first payment, so they never drift
   * after a short month), each with its own amount (the last one takes the
   * leftover cents) and numbered. Returns how many it made.
   */
  private runInstalmentPlan(
    rule: RecurringTransactionRule & { instalmentCount: number },
    todayIso: string,
    context: RunContext,
  ): number {
    // Nowhere to post (its account or category is gone): move past what is
    // due without writing, as an ordinary rule does, so the plan is not
    // picked up again on every load.
    const canPost = !!rule.accountId && !!rule.categoryId;
    const dates = scheduleOfPlan(rule);
    const amounts = splitInstalmentAmounts(
      rule.instalmentTotal ?? rule.amount * rule.instalmentCount,
      rule.instalmentCount,
    );
    let made = 0;
    let next: string | null = null;
    dates.forEach((date, index) => {
      if (next || date < rule.nextRunDate) return;
      if (date > todayIso) {
        next = date;
        return;
      }
      if (!canPost) return;
      const wrote = writeRunOnce(recurringRunTransactionId(rule.id, date), {
        ...categorizedRunInput(rule, context, date, amounts[index] ?? rule.amount),
        instalmentRuleId: rule.id,
        instalmentNumber: index + 1,
      });
      if (wrote) made += 1;
    });
    this.advanceInstalmentPlan(rule.id, next);
    return made;
  }
}

/** The transaction a recurring rule makes on one run date. */
export function recurringRunTransactionId(ruleId: string, date: string): string {
  return `rr:${ruleId}:${date.slice(0, 10)}`;
}

export const recurringRulesRepository = new RecurringRulesRepository();
