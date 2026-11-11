/**
 * Transfer fees. A transfer can carry a fee (a card top-up to an e-wallet, a
 * bank's charge for an instant transfer). The fee is stored as its own expense
 * row on the account that paid it, with `feeOfId` pointing at the transfer:
 *
 * - charged to the **from** account, more leaves it than the other side gets
 *   (RM200 to the e-wallet, RM202 off the card);
 * - charged to the **to** account, less arrives (RM200 off the card, RM198
 *   into the e-wallet).
 *
 * Because the fee is an ordinary expense, every balance, total, budget and
 * export already counts it, and older app versions, the Web Dashboard, Cloud
 * Sync and backups need nothing new to read it right. The editor shows and
 * edits it together with its transfer. Pure, so the editor, AppContext and
 * the tests share it.
 */

import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { Account, Category, Transaction } from '~/types';
import { normalizeMoneyAmount } from '~/utils/formatters';

/** Which of the transfer's two accounts paid the fee. */
export type TransferFeeSide = 'from' | 'to';

/** A fee as the editor holds it, before it is written. */
export interface TransferFeeDraft {
  /** In the paying account's currency. 0 or less means no fee. */
  amount: number;
  side: TransferFeeSide;
  categoryId: string | null;
}

type FeeRow = Pick<Transaction, 'id' | 'type' | 'feeOfId' | 'deletedAt'>;

/** Whether a row is the expense of a transfer's fee. */
export function isTransferFee(row: FeeRow): boolean {
  return row.type === 'expense' && !!row.feeOfId && !row.deletedAt;
}

/**
 * Each transfer's fee row by the transfer's id. A transfer has one fee; if two
 * phones each added one offline, Cloud Sync keeps both and the first listed
 * wins here (the other stays an ordinary expense, still counted).
 */
export function indexTransferFees<T extends FeeRow>(
  transactions: readonly T[],
): ReadonlyMap<string, T> {
  const index = new Map<string, T>();
  for (const row of transactions) {
    if (!isTransferFee(row)) continue;
    const transferId = row.feeOfId as string;
    if (!index.has(transferId)) index.set(transferId, row);
  }
  return index;
}

type TransferAccounts = Pick<Transaction, 'fromAccountId' | 'toAccountId'>;

/** The side a saved fee was charged to, read from the account it is on. */
export function transferFeeSideOf(
  transfer: TransferAccounts,
  fee: Pick<Transaction, 'accountId'>,
): TransferFeeSide {
  return fee.accountId != null &&
    fee.accountId === transfer.toAccountId &&
    fee.accountId !== transfer.fromAccountId
    ? 'to'
    : 'from';
}

/** The account a fee on `side` is charged to. */
export function transferFeeAccountId(
  side: TransferFeeSide,
  transfer: TransferAccounts,
): string | null {
  return (side === 'to' ? transfer.toAccountId : transfer.fromAccountId) ?? null;
}

/**
 * Whether a fee can be charged to `account`. Not to a loan: its balance is
 * walked from its repayments (`accrueReducingBalance`), so an expense on it
 * would not count; the bank charges the fee to the paying account anyway.
 */
export function canChargeTransferFee(account: Pick<Account, 'type'> | null | undefined): boolean {
  return !!account && account.type !== 'loan';
}

/** The side a new fee starts on: the from account, unless it cannot pay one. */
export function defaultTransferFeeSide(
  from: Pick<Account, 'type'> | null | undefined,
  to: Pick<Account, 'type'> | null | undefined,
): TransferFeeSide {
  return !canChargeTransferFee(from) && canChargeTransferFee(to) ? 'to' : 'from';
}

/**
 * A saved fee's amount in its account's currency. A fee is written in that
 * currency, but changing the account's currency later re-denominates it the
 * way it does every expense: the entered amount stays, and `accountAmount`
 * carries what the account is charged.
 */
export function transferFeeAccountAmount(
  fee: Pick<Transaction, 'amount' | 'accountAmount'>,
): number {
  return fee.accountAmount ?? fee.amount;
}

/** The editor's draft for a saved fee. */
export function transferFeeDraftOf(
  transfer: TransferAccounts,
  fee: Pick<Transaction, 'accountId' | 'amount' | 'accountAmount' | 'categoryId'>,
): TransferFeeDraft {
  return {
    amount: transferFeeAccountAmount(fee),
    side: transferFeeSideOf(transfer, fee),
    categoryId: fee.categoryId ?? null,
  };
}

/**
 * A category whose name says it is for fees or charges, in common languages.
 * `\b` only knows ASCII letters, so a word ending in another letter ("phí")
 * ends at the next non-letter instead.
 */
const FEE_CATEGORY_NAME =
  /(\bfees?\b|\bcharges?\b|\bbank\b|\bcaj\b|\byuran\b|\bbiaya\b|\bgebühr|\bfrais\b|\bcomisi|\btarifa|\bkosten\b|\bavgift|\bgebyr|\bopłat|\bphí(?!\p{L})|ค่าธรรมเนียม|手数料|手续费|手續費|수수료|комисси|комісі|शुल्क)/iu;

/**
 * The category a new fee is filed under: the one the last fee used
 * (`TransferFeeIndex.latestCategoryId`), else a category named for fees or
 * charges, else `fallbackCategoryId` (the caller's Bills category), else the
 * first expense category. The user can change it.
 */
export function defaultTransferFeeCategoryId(input: {
  categories: readonly Pick<Category, 'id' | 'name' | 'type' | 'parentId' | 'deletedAt'>[];
  latestCategoryId?: string | null;
  fallbackCategoryId?: string | null;
}): string | null {
  const expense = input.categories.filter(
    (category) => category.type === 'expense' && !category.deletedAt,
  );
  const ids = new Set(expense.map((category) => category.id));
  if (input.latestCategoryId && ids.has(input.latestCategoryId)) return input.latestCategoryId;
  const named = expense.find((category) => FEE_CATEGORY_NAME.test(category.name));
  if (named) return named.id;
  if (input.fallbackCategoryId && ids.has(input.fallbackCategoryId)) {
    return input.fallbackCategoryId;
  }
  return expense.find((category) => !category.parentId)?.id ?? expense[0]?.id ?? null;
}

/** The transfer a fee is written for, as it stands after the save. */
export interface TransferForFee {
  id: string;
  /** The transfer's stored date (an ISO instant), which the fee shares. */
  date: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  memberId?: string | null;
}

export type TransferFeeWrite =
  | { kind: 'none' }
  | { kind: 'delete'; feeId: string }
  | { kind: 'create'; input: CreateTransactionInput }
  | { kind: 'update'; feeId: string; input: Partial<CreateTransactionInput> };

/**
 * What saving `draft` on `transfer` writes, given the fee it already has:
 * nothing, a new fee row, an update to the existing one, or its removal. A
 * draft of 0 (or no draft) removes the fee, and so does one whose account the
 * transfer no longer has. `note` is the new row's title ("Transfer fee").
 */
export function planTransferFeeWrite(input: {
  transfer: TransferForFee;
  draft: TransferFeeDraft | null;
  existing: Pick<
    Transaction,
    'id' | 'amount' | 'currency' | 'accountId' | 'categoryId' | 'date'
  > | null;
  currencyOf: (accountId: string) => string;
  note: string;
}): TransferFeeWrite {
  const { transfer, draft, existing } = input;
  const amount = draft ? normalizeMoneyAmount(draft.amount) : 0;
  const accountId = draft ? transferFeeAccountId(draft.side, transfer) : null;
  if (!draft || !(amount > 0) || !accountId) {
    return existing ? { kind: 'delete', feeId: existing.id } : { kind: 'none' };
  }
  const currency = input.currencyOf(accountId);
  if (!existing) {
    return {
      kind: 'create',
      input: {
        type: 'expense',
        amount,
        currency,
        date: transfer.date,
        accountId,
        fromAccountId: null,
        toAccountId: null,
        categoryId: draft.categoryId,
        note: input.note,
        sentiment: 'neutral',
        reimbursable: false,
        feeOfId: transfer.id,
        ...(transfer.memberId !== undefined ? { memberId: transfer.memberId } : {}),
      },
    };
  }
  const changes: Partial<CreateTransactionInput> = {};
  if (existing.amount !== amount) changes.amount = amount;
  if (existing.currency !== currency) changes.currency = currency;
  if (existing.accountId !== accountId) changes.accountId = accountId;
  if ((existing.categoryId ?? null) !== draft.categoryId) changes.categoryId = draft.categoryId;
  if (existing.date !== transfer.date) changes.date = transfer.date;
  // A changed currency needs the amount again, so the snapshot is re-frozen.
  if (changes.currency !== undefined) changes.amount = amount;
  if (Object.keys(changes).length === 0) return { kind: 'none' };
  return { kind: 'update', feeId: existing.id, input: changes };
}

/**
 * The fee's place among the day's rows: right under its transfer. Rows of a
 * day sort newest first by their order key (`dayOrder`, else `createdAt`), so
 * the fee takes the transfer's key less a millisecond.
 */
export function transferFeeCreatedAt(transferCreatedAt: string): string {
  const time = Date.parse(transferCreatedAt);
  return Number.isFinite(time) ? new Date(time - 1).toISOString() : transferCreatedAt;
}

export function transferFeeDayOrder(transferDayOrder: number | null): number | null {
  return transferDayOrder == null ? null : transferDayOrder - 1;
}

/** A transfer's fee as the lists and the editor read it. */
export interface TransferFeeLink {
  feeId: string;
  transferId: string;
  amount: number;
  currency: string;
  /** What the account is charged, when its currency changed after the fee was written. */
  accountAmount: number | null;
  accountId: string | null;
  categoryId: string | null;
}

export interface TransferFeeIndex {
  byTransferId: ReadonlyMap<string, TransferFeeLink>;
  /** A fee row's transfer, so opening the fee opens the transfer. */
  byFeeId: ReadonlyMap<string, TransferFeeLink>;
  /** The category the newest fee is filed under, for the next one. */
  latestCategoryId: string | null;
}

export const EMPTY_TRANSFER_FEE_INDEX: TransferFeeIndex = {
  byTransferId: new Map(),
  byFeeId: new Map(),
  latestCategoryId: null,
};

/** Every transfer fee, both ways (see `indexTransferFees`). Newest first in. */
export function buildTransferFeeIndex(
  transactions: readonly (FeeRow &
    Pick<Transaction, 'amount' | 'currency' | 'accountAmount' | 'accountId' | 'categoryId'>)[],
): TransferFeeIndex {
  const fees = indexTransferFees(transactions);
  if (fees.size === 0) return EMPTY_TRANSFER_FEE_INDEX;
  const byTransferId = new Map<string, TransferFeeLink>();
  const byFeeId = new Map<string, TransferFeeLink>();
  let latestCategoryId: string | null = null;
  fees.forEach((fee, transferId) => {
    latestCategoryId ??= fee.categoryId ?? null;
    const link: TransferFeeLink = {
      feeId: fee.id,
      transferId,
      amount: fee.amount,
      currency: fee.currency,
      accountAmount: fee.accountAmount ?? null,
      accountId: fee.accountId ?? null,
      categoryId: fee.categoryId ?? null,
    };
    byTransferId.set(transferId, link);
    byFeeId.set(fee.id, link);
  });
  return { byTransferId, byFeeId, latestCategoryId };
}

/** Whether two indexes hold the same fees, so a list need not redraw. */
export function sameTransferFeeIndex(a: TransferFeeIndex, b: TransferFeeIndex): boolean {
  if (a === b) return true;
  if (a.byTransferId.size !== b.byTransferId.size) return false;
  if (a.latestCategoryId !== b.latestCategoryId) return false;
  for (const [transferId, link] of a.byTransferId) {
    const other = b.byTransferId.get(transferId);
    if (
      !other ||
      other.feeId !== link.feeId ||
      other.amount !== link.amount ||
      other.currency !== link.currency ||
      other.accountAmount !== link.accountAmount ||
      other.accountId !== link.accountId ||
      other.categoryId !== link.categoryId
    ) {
      return false;
    }
  }
  return true;
}

/** The fee columns a recurring transfer rule stores (all null for none). */
export interface RecurringRuleFeeFields {
  feeAmount: number | null;
  feeCurrency: string | null;
  feeSide: TransferFeeSide | null;
  feeCategoryId: string | null;
}

export const NO_RECURRING_RULE_FEE: RecurringRuleFeeFields = {
  feeAmount: null,
  feeCurrency: null,
  feeSide: null,
  feeCategoryId: null,
};

/**
 * What a recurring transfer rule saves for the editor's fee draft: the amount
 * in the paying account's currency, which every run then writes beside its
 * transfer (`recurringRulesRepository.runDueTransactions`). No draft, 0, or a
 * side without an account saves no fee.
 */
export function recurringRuleFeeFields(
  draft: TransferFeeDraft | null,
  transfer: TransferAccounts,
  currencyOf: (accountId: string) => string | null | undefined,
): RecurringRuleFeeFields {
  const amount = draft ? normalizeMoneyAmount(draft.amount) : 0;
  const accountId = draft ? transferFeeAccountId(draft.side, transfer) : null;
  const currency = accountId ? currencyOf(accountId) : null;
  if (!draft || !(amount > 0) || !accountId || !currency) return NO_RECURRING_RULE_FEE;
  return {
    feeAmount: amount,
    feeCurrency: currency,
    feeSide: draft.side,
    feeCategoryId: draft.categoryId,
  };
}

type RuleWithFee = Pick<Transaction, 'type'> &
  Partial<TransferAccounts> &
  Partial<RecurringRuleFeeFields>;

/**
 * The editor's draft for a recurring rule's fee, or null when it has none.
 * The sheet edits the fee in the paying account's currency, so a fee saved in
 * another one (the account was re-denominated, or the rule pointed at another
 * account from the loan, goal or Web Dashboard editor) is converted into it by
 * `inAccountCurrency`, the way a one-off fee reads its `accountAmount`.
 */
export function recurringRuleFeeDraft(
  rule: RuleWithFee,
  inAccountCurrency?: (amount: number, feeCurrency: string, accountId: string) => number,
): TransferFeeDraft | null {
  if (rule.type !== 'transfer' || rule.feeAmount == null || !(rule.feeAmount > 0)) return null;
  const side: TransferFeeSide = rule.feeSide === 'to' ? 'to' : 'from';
  const accountId = transferFeeAccountId(side, {
    fromAccountId: rule.fromAccountId ?? null,
    toAccountId: rule.toAccountId ?? null,
  });
  const amount =
    inAccountCurrency && accountId && rule.feeCurrency
      ? normalizeMoneyAmount(inAccountCurrency(rule.feeAmount, rule.feeCurrency, accountId))
      : rule.feeAmount;
  return { amount, side, categoryId: rule.feeCategoryId ?? null };
}

/**
 * Whether a recurring rule's runs will write its fee: a transfer with a fee
 * whose paying account is still there and can carry one (not a loan), the
 * same test the runner makes (`transferFeeRunInput`). A rule pointed at a
 * loan from another editor keeps its stored fee, but neither writes nor
 * counts it.
 */
export function recurringRuleChargesFee(
  rule: RuleWithFee,
  accountOf: (accountId: string) => Pick<Account, 'type'> | null | undefined,
): boolean {
  if (rule.type !== 'transfer' || !rule.feeCurrency || !rule.feeAmount || rule.feeAmount <= 0) {
    return false;
  }
  const accountId = transferFeeAccountId(rule.feeSide === 'to' ? 'to' : 'from', {
    fromAccountId: rule.fromAccountId ?? null,
    toAccountId: rule.toAccountId ?? null,
  });
  return !!accountId && canChargeTransferFee(accountOf(accountId));
}

/**
 * What saving the recurring editor stores for the fee. A fee left as it opened
 * (same amount, side and category, on the same paying account) keeps exactly
 * what the rule has, so opening and saving a rule never re-denominates its
 * fee: the draft may have been converted for the sheet
 * (`recurringRuleFeeDraft`), or shown at face value when no rate was known.
 */
export function recurringRuleFeeFieldsOnSave(input: {
  draft: TransferFeeDraft | null;
  /** The draft the editor opened with, null for a new rule or one without a fee. */
  opened: TransferFeeDraft | null;
  rule: (TransferAccounts & RecurringRuleFeeFields) | null;
  transfer: TransferAccounts;
  currencyOf: (accountId: string) => string | null | undefined;
}): RecurringRuleFeeFields {
  const { draft, opened, rule, transfer } = input;
  const unchanged =
    !!draft &&
    !!opened &&
    !!rule &&
    rule.feeAmount != null &&
    draft.amount === opened.amount &&
    draft.side === opened.side &&
    draft.categoryId === opened.categoryId &&
    transferFeeAccountId(draft.side, transfer) === transferFeeAccountId(opened.side, rule);
  if (unchanged && rule) {
    return {
      feeAmount: rule.feeAmount,
      feeCurrency: rule.feeCurrency,
      feeSide: rule.feeSide,
      feeCategoryId: rule.feeCategoryId,
    };
  }
  return recurringRuleFeeFields(draft, transfer, input.currencyOf);
}
