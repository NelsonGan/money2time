import { and, eq, gte, isNull, lt, lte } from 'drizzle-orm';

import {
  buildInstalmentProgress,
  canSplitInstalments,
  INSTALMENT_PAYOFF_NUMBER,
  instalmentAmounts,
  isInstalmentPlan,
  isRegularAmountValid,
  nextPaymentIndex,
  paymentRowsForPlan,
  scheduleOfPlan,
} from '~/features/instalments/lib/instalmentPlan';
import { selfMemberIdFor } from '~/features/sharedLedgers/lib/ledgerPeople';
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
  /**
   * Shared ledgers: the account the rule's entries belong to (null = the
   * ledger's owner). Left out, a new rule is this phone's account when it is
   * a member of the open ledger.
   */
  memberId?: string | null;
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
   * Each payment as the bank set it, when it differs from the even split;
   * the last payment takes what is left so the plan adds up to `total`.
   */
  regularAmount?: number | null;
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
    // The rule's person, the same on every phone that runs it.
    createdBy: rule.memberId,
    memberId: rule.memberId,
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

  create(input: CreateRecurringRuleInput): string | null {
    if (!validateRuleInput(input)) return null;
    const db = getDb();
    const now = nowIso();
    const id = newId();
    const ledgerId = getActiveLedgerId();
    db.insert(recurringRulesTable)
      .values({
        id,
        ledgerId,
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
        instalmentCount: input.instalmentCount ?? null,
        instalmentTotal: input.instalmentTotal ?? null,
        instalmentStartDate: input.instalmentStartDate ?? null,
        memberId: input.memberId !== undefined ? input.memberId : selfMemberIdFor(ledgerId),
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
    if (!canSplitInstalments(input.total, count)) return null;
    if (
      input.regularAmount != null &&
      !isRegularAmountValid(input.total, count, input.regularAmount)
    ) {
      return null;
    }
    const amounts = instalmentAmounts(input.total, count, input.regularAmount);
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

    // The rule, its first payment and the move to the next one land
    // together: a plan whose first payment failed would have the runner make
    // it later without the receipt, which the asset sweep would then delete.
    let created: CreatedInstalmentPlan | null = null;
    getSQLite().withTransactionSync(() => {
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
      if (!ruleId) return;

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
      created = { ruleId, firstPaymentId };
    });
    return created;
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
      .where(
        and(
          isNull(recurringRulesTable.deletedAt),
          isNull(recurringRulesTable.anchorDay),
          // An instalment plan keeps its own schedule, counted from its first
          // payment (`instalmentScheduleDates`): nothing here to repair.
          isNull(recurringRulesTable.instalmentCount),
        ),
      )
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
    const context = buildRunContext();
    const { reporting, rateTable, accountCurrencyById } = context;

    const processed: ProcessedRecurringRule[] = [];

    dueRules.forEach((rule) => {
      if (isInstalmentPlan(rule)) {
        // One notice per plan, like an ordinary rule's catch-up, at the
        // amount of the latest payment made (the last carries the leftover
        // cents, so it can differ from the rule's).
        const made = this.runInstalmentPlan(rule, todayIso, context);
        const latest = made[made.length - 1];
        if (latest !== undefined) {
          processed.push({
            name: rule.name,
            type: rule.type,
            amount: latest,
            currency: rule.currency,
          });
        }
        return;
      }
      // One id per rule and run date: two phones that both run a due rule
      // (Cloud Sync) make the same row instead of two, and a run that already
      // happened (even if since deleted) is never made again.
      const createRun = (input: CreateTransactionInput) => {
        // The rule's person, the same on every phone that runs it.
        writeRunOnce(recurringRunTransactionId(rule.id, input.date), {
          ...input,
          createdBy: rule.memberId,
          memberId: rule.memberId,
        });
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
            createRun(categorizedRunInput(rule, context, cursor, rule.amount));
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

  /**
   * Makes every payment of a plan that has fallen due since it last ran, on
   * the plan's own dates (counted from the first payment, so they never drift
   * after a short month), each with its own amount (the last one takes the
   * leftover cents) and numbered. Returns the amount of each payment it made.
   */
  private runInstalmentPlan(
    rule: RecurringTransactionRule & { instalmentCount: number },
    todayIso: string,
    context: RunContext,
  ): number[] {
    // Nowhere to post (its account or category is gone): move past what is
    // due without writing, as an ordinary rule does, so the plan is not
    // picked up again on every load.
    const canPost = !!rule.accountId && !!rule.categoryId;
    const dates = scheduleOfPlan(rule);
    const payments = this.instalmentPayments(rule);
    // Paid off (on another phone, whose ending of the plan a later sync of
    // the rule undid): nothing more to make.
    if (
      payments.some(
        (payment) => !payment.deletedAt && payment.instalmentNumber === INSTALMENT_PAYOFF_NUMBER,
      )
    ) {
      this.advanceInstalmentPlan(rule.id, null);
      return [];
    }
    // A number with a row, live or deleted, was made already: by this phone,
    // or by one in another time zone or on an older version whose run id for
    // it differs, so the run id alone would not stop a second charge.
    const madeNumbers = new Set(payments.map((payment) => payment.instalmentNumber));
    const progress = buildInstalmentProgress(rule, payments);
    // Which payment the plan is on, found the same way as its progress.
    const nextIndex = nextPaymentIndex(rule.nextRunDate, dates);
    const made: number[] = [];
    let next: string | null = null;
    dates.forEach((date, index) => {
      if (next || index < nextIndex) return;
      if (date > todayIso) {
        next = date;
        return;
      }
      if (!canPost || madeNumbers.has(index + 1)) return;
      // As the plan's progress has it: the regular amount, the last one
      // balancing the total against what was actually paid.
      const amount = progress.entries[index]?.amount ?? rule.amount;
      const wrote = writeRunOnce(recurringRunTransactionId(rule.id, date), {
        ...categorizedRunInput(rule, context, date, amount),
        instalmentRuleId: rule.id,
        instalmentNumber: index + 1,
      });
      if (wrote) made.push(amount);
    });
    this.advanceInstalmentPlan(rule.id, next);
    return made;
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
