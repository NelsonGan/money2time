// The transaction an alert becomes, once the account and category are known.
// Pure; covered by __tests__/features/autoLog/pipeline.test.ts.

import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { Account, PaymentAlertParse } from '~/types';

export interface DraftInput {
  parse: PaymentAlertParse;
  /** When the alert was posted; the transaction is dated here. */
  capturedAt: string;
  accountId: string | null;
  categoryId: string | null;
  accounts: readonly Account[];
  reportingCurrency: string;
}

export function buildAlertDraft(input: DraftInput): CreateTransactionInput | null {
  const { parse } = input;
  if (
    parse.kind !== 'spend' ||
    parse.amount === null ||
    !Number.isFinite(parse.amount) ||
    !(parse.amount > 0)
  )
    return null;

  const account = input.accounts.find((item) => item.id === input.accountId) ?? null;
  const currency = parse.currency ?? account?.currency ?? input.reportingCurrency;
  const accountAmount =
    parse.secondary &&
    account &&
    currency !== account.currency &&
    parse.secondary.currency === account.currency
      ? parse.secondary.amount
      : undefined;
  // What the bank says the purchase cost in the reporting currency (its rate
  // and fees included) is a truer snapshot than today's market rate.
  const reporting =
    parse.secondary &&
    parse.secondary.amount > 0 &&
    currency !== input.reportingCurrency &&
    parse.secondary.currency === input.reportingCurrency
      ? {
          reportingCurrency: input.reportingCurrency,
          reportingAmount: parse.secondary.amount,
          fxRate: Math.round((parse.secondary.amount / parse.amount) * 1e6) / 1e6,
        }
      : {};
  const date = Number.isNaN(new Date(input.capturedAt).getTime())
    ? new Date().toISOString()
    : new Date(input.capturedAt).toISOString();
  const note = parse.counterparty?.trim() || null;

  return {
    type: 'expense',
    amount: parse.amount,
    currency,
    ...(accountAmount !== undefined ? { accountAmount } : {}),
    ...reporting,
    date,
    accountId: input.accountId,
    categoryId: input.categoryId,
    note,
    sentiment: 'neutral',
  };
}
