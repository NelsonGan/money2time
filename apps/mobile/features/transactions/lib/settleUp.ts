import type {
  PersonDebt,
  PersonDebtBill,
  SettleUpByTransactionSummary,
  SettleUpSummary,
  TransactionDebt,
  TransactionDebtSplit,
  TransactionWithRelations,
} from '~/types';

import {
  billPayer,
  friendPaidBillTotal,
  isFriendPaidBill,
  owedToPayer,
  owesPayer,
} from './splitPayer';
import { splitShareKey, summarizeSplitShares } from './splitPayments';

/** Grouping key for splits that were never given a person name. */
export const UNNAMED_PERSON_KEY = '__unnamed__';

export interface AggregateSettleUpOptions {
  /** The user's reporting currency; the roll-up total is expressed in it. */
  reportingCurrency: string;
  /**
   * Live fallback conversion: 1 unit of `currency` → the reporting currency, or
   * null when unknown. Only consulted when a transaction carries no usable frozen
   * fxRate snapshot; same-currency bills never call it.
   */
  rateToReporting?: (currency: string) => number | null;
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Reporting-currency value of one split, preferring the parent transaction's
 * frozen fxRate (captured at write time, so it never drifts when live rates move)
 * and only falling back to a live rate when no snapshot is available.
 */
function splitReportingAmount(
  amount: number,
  tx: TransactionWithRelations,
  reportingCurrency: string,
  rateToReporting?: (currency: string) => number | null,
): number {
  if (tx.currency === reportingCurrency) return amount;
  if (tx.reportingCurrency === reportingCurrency && tx.fxRate != null) {
    return amount * tx.fxRate;
  }
  const rate = rateToReporting?.(tx.currency);
  if (rate != null && Number.isFinite(rate)) return amount * rate;
  // Give up gracefully: count the native amount rather than dropping the bill.
  return amount;
}

/** The key a person's shares are grouped under: their trimmed, case-folded name. */
export function personKeyOf(personName: string | null | undefined): string {
  const trimmed = personName?.trim() ?? '';
  return trimmed.length > 0 ? trimmed.toLowerCase() : UNNAMED_PERSON_KEY;
}

function displayNameOf(personName: string | null | undefined): string | null {
  const trimmed = personName?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

interface MutablePerson {
  key: string;
  name: string | null;
  /** Date of the bill the display name came from; most recent wins on casing drift. */
  nameDate: string;
  totalReporting: number;
  paidReporting: number;
  owedReporting: number;
  owedPaidReporting: number;
  unpaidBillCount: number;
  youOweCount: number;
  byCurrency: Map<string, number>;
  owedByCurrency: Map<string, number>;
  bills: PersonDebtBill[];
  oldestDate: string;
  oldestUnpaidDate: string | null;
}

function currencyTotals(map: Map<string, number>): { currency: string; amount: number }[] {
  return Array.from(map.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** What they owe less what the user owes, per currency; currencies that cancel out are dropped. */
function netCurrencyTotals(
  owesYou: Map<string, number>,
  youOwe: Map<string, number>,
): { currency: string; amount: number }[] {
  const net = new Map(owesYou);
  for (const [currency, amount] of youOwe) {
    net.set(currency, roundCents((net.get(currency) ?? 0) - amount));
  }
  return Array.from(net.entries())
    .filter(([, amount]) => Math.abs(amount) >= 0.005)
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/**
 * Rolls every share across all transactions up by person, in both directions:
 * the positive, non-self splits of the bills the user paid (the person owes
 * the user), and the user's own share of the bills that person paid (the user
 * owes them, see `splitPayer.ts`). People are grouped by trimmed, case-folded
 * name; splits with no name collapse into a single {@link UNNAMED_PERSON_KEY}
 * bucket. Totals are in the reporting currency and only include unpaid shares;
 * the `byCurrency` lists preserve the unpaid native subtotals.
 *
 * It takes any list of transactions, so the balances of one album (or later a
 * shared group) are this roll-up over that album's transactions.
 */
export function aggregateSettleUpByPerson(
  transactions: TransactionWithRelations[],
  options: AggregateSettleUpOptions,
): SettleUpSummary {
  const { reportingCurrency, rateToReporting } = options;
  const people = new Map<string, MutablePerson>();

  const addBill = (
    tx: TransactionWithRelations,
    personName: string | null | undefined,
    bill: PersonDebtBill,
  ) => {
    const key = personKeyOf(personName);
    const name = displayNameOf(personName);
    let person = people.get(key);
    if (!person) {
      person = {
        key,
        name,
        nameDate: tx.date,
        totalReporting: 0,
        paidReporting: 0,
        owedReporting: 0,
        owedPaidReporting: 0,
        unpaidBillCount: 0,
        youOweCount: 0,
        byCurrency: new Map(),
        owedByCurrency: new Map(),
        bills: [],
        oldestDate: tx.date,
        oldestUnpaidDate: null,
      };
      people.set(key, person);
    }
    person.bills.push(bill);
    const youOwe = bill.direction === 'you_owe';
    if (bill.paidAt) {
      if (youOwe) {
        person.owedPaidReporting = roundCents(person.owedPaidReporting + bill.reportingAmount);
      } else {
        person.paidReporting = roundCents(person.paidReporting + bill.reportingAmount);
      }
    } else {
      const byCurrency = youOwe ? person.owedByCurrency : person.byCurrency;
      byCurrency.set(tx.currency, roundCents((byCurrency.get(tx.currency) ?? 0) + bill.amount));
      if (youOwe) {
        person.owedReporting = roundCents(person.owedReporting + bill.reportingAmount);
        person.youOweCount += 1;
      } else {
        person.totalReporting = roundCents(person.totalReporting + bill.reportingAmount);
      }
      person.unpaidBillCount += 1;
      if (person.oldestUnpaidDate === null || tx.date < person.oldestUnpaidDate) {
        person.oldestUnpaidDate = tx.date;
      }
    }
    if (tx.date < person.oldestDate) person.oldestDate = tx.date;
    if (name && tx.date >= person.nameDate) {
      person.name = name;
      person.nameDate = tx.date;
    }
  };

  for (const tx of transactions) {
    const splits = tx.splits;
    if (!splits || splits.length === 0) continue;

    // A bill a friend paid: the user owes that friend their own share, and
    // nobody on it owes the user.
    const owed = owedToPayer(splits, tx.amount);
    if (owed) {
      if (!(owed.amount > 0)) continue;
      addBill(tx, owed.personName, {
        splitId: owed.splitId,
        direction: 'you_owe',
        transactionId: tx.id,
        date: tx.date,
        amount: owed.amount,
        currency: tx.currency,
        reportingAmount: roundCents(
          splitReportingAmount(owed.amount, tx, reportingCurrency, rateToReporting),
        ),
        note: tx.note ?? null,
        categoryName: tx.categoryName ?? null,
        categoryIcon: tx.categoryIcon ?? null,
        paybackAccountId: owed.paidFromAccountId,
        billHasAccount: true,
        paidAt: owed.paidAt,
        shareTotal: owed.amount,
        sharePaid: owed.paidAt ? owed.amount : 0,
        shareKey: owed.splitId,
      });
      continue;
    }

    const shares = summarizeSplitShares(splits);
    for (const split of splits) {
      if (split.isSelf) continue;
      if (!(split.amount > 0)) continue;

      const share = shares.get(splitShareKey(split));
      addBill(tx, split.personName, {
        splitId: split.id,
        direction: 'owes_you',
        transactionId: tx.id,
        date: tx.date,
        amount: split.amount,
        currency: tx.currency,
        reportingAmount: roundCents(
          splitReportingAmount(split.amount, tx, reportingCurrency, rateToReporting),
        ),
        note: tx.note ?? null,
        categoryName: tx.categoryName ?? null,
        categoryIcon: tx.categoryIcon ?? null,
        paybackAccountId: split.paybackAccountId ?? tx.accountId ?? null,
        billHasAccount: !!tx.accountId,
        paidAt: split.paidAt,
        shareTotal: share?.total ?? split.amount,
        sharePaid: share?.paid ?? 0,
        shareKey: splitShareKey(split),
      });
    }
  }

  const result: PersonDebt[] = [];
  let grandTotal = 0;
  let grandOwed = 0;
  let owedToYou = 0;
  let youOwe = 0;
  let billCount = 0;
  for (const person of people.values()) {
    // Outstanding shares first, then paid history; newest original bills first.
    person.bills.sort((a, b) => {
      if (Boolean(a.paidAt) !== Boolean(b.paidAt)) return a.paidAt ? 1 : -1;
      const aDate = a.paidAt ?? a.date;
      const bDate = b.paidAt ?? b.date;
      if (aDate !== bDate) return aDate < bDate ? 1 : -1;
      return a.splitId.localeCompare(b.splitId);
    });
    const netReporting = roundCents(person.totalReporting - person.owedReporting);
    result.push({
      key: person.key,
      name: person.name,
      totalReporting: person.totalReporting,
      paidReporting: person.paidReporting,
      owedReporting: person.owedReporting,
      owedPaidReporting: person.owedPaidReporting,
      netReporting,
      byCurrency: currencyTotals(person.byCurrency),
      owedByCurrency: currencyTotals(person.owedByCurrency),
      netByCurrency: netCurrencyTotals(person.byCurrency, person.owedByCurrency),
      bills: person.bills,
      oldestDate: person.oldestUnpaidDate ?? person.oldestDate,
      billCount: person.bills.length,
      unpaidBillCount: person.unpaidBillCount,
      youOweCount: person.youOweCount,
    });
    grandTotal = roundCents(grandTotal + person.totalReporting);
    grandOwed = roundCents(grandOwed + person.owedReporting);
    if (netReporting > 0) owedToYou = roundCents(owedToYou + netReporting);
    else youOwe = roundCents(youOwe - netReporting);
    billCount += person.unpaidBillCount;
  }

  // Open balances first, the biggest (either way) on top; the unnamed bucket
  // always sinks to the bottom on ties. Settled people follow, newest payment first.
  result.sort((a, b) => {
    const aOpen = a.unpaidBillCount > 0;
    const bOpen = b.unpaidBillCount > 0;
    if (aOpen !== bOpen) return aOpen ? -1 : 1;
    const aNet = Math.abs(a.netReporting);
    const bNet = Math.abs(b.netReporting);
    if (bNet !== aNet) return bNet - aNet;
    if (a.key === UNNAMED_PERSON_KEY) return 1;
    if (b.key === UNNAMED_PERSON_KEY) return -1;
    if (!aOpen && !bOpen) {
      const aPaidAt = a.bills[0]?.paidAt ?? '';
      const bPaidAt = b.bills[0]?.paidAt ?? '';
      if (aPaidAt !== bPaidAt) return aPaidAt < bPaidAt ? 1 : -1;
    }
    return 0;
  });

  return {
    people: result,
    totalReporting: grandTotal,
    owedReporting: grandOwed,
    netReporting: roundCents(grandTotal - grandOwed),
    owedToYouReporting: owedToYou,
    youOweReporting: youOwe,
    personCount: result.length,
    billCount,
    reportingCurrency,
  };
}

/**
 * Cheap count of distinct people with an open balance: someone who still owes
 * on an unpaid, non-self split, or a friend the user still owes for a bill
 * they paid. Uses the same person-key derivation as
 * {@link aggregateSettleUpByPerson}, but excludes paid history and skips the
 * bill/byCurrency/sorting work — used by the always-mounted Settings badge so
 * a transaction write anywhere in the app doesn't run the full per-person
 * roll-up just to show a number.
 */
export function countUnpaidDebtors(transactions: TransactionWithRelations[]): number {
  const keys = new Set<string>();
  for (const tx of transactions) {
    const splits = tx.splits;
    if (!splits || splits.length === 0) continue;
    const payer = billPayer(splits);
    if (payer) {
      if (owesPayer(splits, tx.amount)) keys.add(personKeyOf(payer.personName));
      continue;
    }
    for (const split of splits) {
      if (split.isSelf) continue;
      if (split.paidAt) continue;
      if (!(split.amount > 0)) continue;
      keys.add(personKeyOf(split.personName));
    }
  }
  return keys.size;
}

/**
 * Cheap count of transactions that are still unsettled split bills — i.e. carry
 * at least one unpaid, non-self split with a positive amount, or are a bill a
 * friend paid that the user has not paid back. Unlike
 * {@link aggregateSettleUpByTransaction}, excludes paid history and skips the
 * roll-up work. Used to gate free-plan split-bill creation.
 */
export function countUnpaidSplitBills(transactions: TransactionWithRelations[]): number {
  let count = 0;
  for (const tx of transactions) {
    const splits = tx.splits;
    if (!splits || splits.length === 0) continue;
    const hasUnpaid = isFriendPaidBill(splits)
      ? owesPayer(splits, tx.amount)
      : splits.some((split) => !split.isSelf && !split.paidAt && split.amount > 0);
    if (hasUnpaid) count += 1;
  }
  return count;
}

/**
 * Where the user stands with a person: they owe the user on balance, the user
 * owes them, the open shares cancel out (`even`), or nothing is open (`settled`).
 */
export type PersonBalanceState = 'owes_you' | 'you_owe' | 'even' | 'settled';

export function personBalanceState(
  person: Pick<PersonDebt, 'netReporting' | 'unpaidBillCount'>,
): PersonBalanceState {
  if (person.unpaidBillCount === 0) return 'settled';
  if (person.netReporting >= 0.005) return 'owes_you';
  if (person.netReporting <= -0.005) return 'you_owe';
  return 'even';
}

/** The rows a one-tap Settle up with a person acts on. */
export interface PersonSettlementRows {
  /** Their unpaid rows on bills the user paid: each is marked paid. */
  receive: string[];
  /** The payer rows of the bills they paid that the user still owes: each is paid back. */
  pay: string[];
}

/**
 * Everything still open between the user and the person `personKey`, in both
 * directions. Settling up marks all of it paid through one account, so the
 * account moves by the net.
 */
export function personSettlementRows(
  transactions: readonly TransactionWithRelations[],
  personKey: string,
): PersonSettlementRows {
  const rows: PersonSettlementRows = { receive: [], pay: [] };
  for (const tx of transactions) {
    const splits = tx.splits;
    if (!splits || splits.length === 0) continue;
    const payer = billPayer(splits);
    if (payer) {
      if (personKeyOf(payer.personName) === personKey && owesPayer(splits, tx.amount)) {
        rows.pay.push(payer.id);
      }
      continue;
    }
    for (const split of splits) {
      if (split.isSelf || split.paidAt || !(split.amount > 0)) continue;
      if (personKeyOf(split.personName) === personKey) rows.receive.push(split.id);
    }
  }
  return rows;
}

/**
 * Rolls shares up by transaction: one entry per split bill, including bills
 * that are fully paid. A bill the user paid lists each friend's positive
 * share; a bill a friend paid lists the one share the user owes that friend,
 * with everyone else's share under `participants`. Outstanding totals only
 * count unpaid shares. Mirrors {@link aggregateSettleUpByPerson}'s filtering
 * and reporting-currency logic.
 */
export function aggregateSettleUpByTransaction(
  transactions: TransactionWithRelations[],
  options: AggregateSettleUpOptions,
): SettleUpByTransactionSummary {
  const { reportingCurrency, rateToReporting } = options;
  const result: TransactionDebt[] = [];
  let grandTotal = 0;
  let grandOwed = 0;
  let splitCount = 0;

  for (const tx of transactions) {
    const splits = tx.splits;
    if (!splits || splits.length === 0) continue;

    const owed: TransactionDebtSplit[] = [];
    let totalReporting = 0;
    let totalNative = 0;
    let paidNative = 0;
    let latestPaidAt: string | null = null;
    let unpaidSplitCount = 0;
    const count = (entry: TransactionDebtSplit) => {
      owed.push(entry);
      if (entry.paidAt) {
        paidNative = roundCents(paidNative + entry.amount);
        if (latestPaidAt === null || entry.paidAt > latestPaidAt) latestPaidAt = entry.paidAt;
      } else {
        totalReporting = roundCents(totalReporting + entry.reportingAmount);
        totalNative = roundCents(totalNative + entry.amount);
        unpaidSplitCount += 1;
      }
    };

    const mine = owedToPayer(splits, tx.amount);
    if (mine) {
      if (mine.amount > 0) {
        count({
          splitId: mine.splitId,
          direction: 'you_owe',
          personName: mine.personName,
          amount: mine.amount,
          currency: tx.currency,
          reportingAmount: roundCents(
            splitReportingAmount(mine.amount, tx, reportingCurrency, rateToReporting),
          ),
          paybackAccountId: mine.paidFromAccountId,
          billHasAccount: true,
          paidAt: mine.paidAt,
          shareTotal: mine.amount,
          sharePaid: mine.paidAt ? mine.amount : 0,
          shareKey: mine.splitId,
        });
      }
    } else {
      const shares = summarizeSplitShares(splits);
      for (const split of splits) {
        if (split.isSelf) continue;
        if (!(split.amount > 0)) continue;

        const share = shares.get(splitShareKey(split));
        count({
          splitId: split.id,
          direction: 'owes_you',
          personName: displayNameOf(split.personName),
          amount: split.amount,
          currency: tx.currency,
          reportingAmount: roundCents(
            splitReportingAmount(split.amount, tx, reportingCurrency, rateToReporting),
          ),
          paybackAccountId: split.paybackAccountId ?? tx.accountId ?? null,
          billHasAccount: !!tx.accountId,
          paidAt: split.paidAt,
          shareTotal: share?.total ?? split.amount,
          sharePaid: share?.paid ?? 0,
          shareKey: splitShareKey(split),
        });
      }
    }
    if (owed.length === 0) continue;

    // Outstanding shares first, then paid history.
    owed.sort((a, b) => {
      if (Boolean(a.paidAt) !== Boolean(b.paidAt)) return a.paidAt ? 1 : -1;
      if (a.paidAt && b.paidAt && a.paidAt !== b.paidAt) {
        return a.paidAt < b.paidAt ? 1 : -1;
      }
      // Biggest share first, by the whole share, so a friend who paid part of
      // theirs keeps their place among equal shares.
      // (A single-row share's total is its amount, so other bills order as before;
      // equal shares keep the bill's own order.)
      return b.shareTotal - a.shareTotal;
    });
    result.push({
      transactionId: tx.id,
      paidBy: mine ? { name: mine.personName } : null,
      billTotalNative: mine ? friendPaidBillTotal(splits, tx.amount) : null,
      participants: mine
        ? splits
            .filter((split) => !split.isSelf && !split.partOfSplitId)
            .map((split) => ({
              splitId: split.id,
              personName: displayNameOf(split.personName),
              amount: split.shareAmount ?? 0,
              isPayer: split.id === mine.splitId,
            }))
        : [],
      date: tx.date,
      note: tx.note ?? null,
      categoryName: tx.categoryName ?? null,
      categoryIcon: tx.categoryIcon ?? null,
      currency: tx.currency,
      totalReporting,
      totalNative,
      paidNative,
      latestPaidAt,
      splits: owed,
      splitCount: owed.length,
      unpaidSplitCount,
    });
    if (mine) grandOwed = roundCents(grandOwed + totalReporting);
    else grandTotal = roundCents(grandTotal + totalReporting);
    splitCount += unpaidSplitCount;
  }

  // Outstanding bills first; within each group sort by bill or payback date.
  result.sort((a, b) => {
    if (Boolean(a.unpaidSplitCount) !== Boolean(b.unpaidSplitCount)) {
      return a.unpaidSplitCount ? -1 : 1;
    }
    const aDate = a.unpaidSplitCount ? a.date : (a.latestPaidAt ?? a.date);
    const bDate = b.unpaidSplitCount ? b.date : (b.latestPaidAt ?? b.date);
    if (aDate !== bDate) return aDate < bDate ? 1 : -1;
    if (b.totalReporting !== a.totalReporting) return b.totalReporting - a.totalReporting;
    return a.transactionId < b.transactionId ? -1 : a.transactionId > b.transactionId ? 1 : 0;
  });

  return {
    transactions: result,
    totalReporting: grandTotal,
    owedReporting: grandOwed,
    transactionCount: result.length,
    splitCount,
    reportingCurrency,
  };
}

// Longest person-name prefix kept verbatim on a payback-transfer note before
// the name is truncated with "..".
const PAYBACK_NOTE_NAME_MAX_CHARS = 8;

/**
 * Note written on the payback transfer that Mark Paid creates:
 * "{person}: {bill note}", truncating names longer than
 * {@link PAYBACK_NOTE_NAME_MAX_CHARS} characters ("Jonathan Chua" → "Jonatha..").
 * Falls back to whichever half exists; null when neither does.
 */
export function buildPaybackTransferNote(
  personName: string | null | undefined,
  billNote: string | null | undefined,
): string | null {
  const name = personName?.trim() ?? '';
  const shortName =
    name.length > PAYBACK_NOTE_NAME_MAX_CHARS
      ? `${name.slice(0, PAYBACK_NOTE_NAME_MAX_CHARS - 1)}..`
      : name;
  const note = billNote?.trim() ?? '';
  if (shortName && note) return `${shortName}: ${note}`;
  return shortName || note || null;
}

export interface ReceiptTextLine {
  label: string;
  /** Pre-formatted amount, e.g. "$32.00". */
  amount: string;
}

export interface ReceiptTextInput {
  /** Subject line, e.g. a person's name or a bill's description. */
  title: string;
  /** Optional secondary line under the title, e.g. a date; null to omit. */
  subtitle?: string | null;
  lines: ReceiptTextLine[];
  /** e.g. "You owe". Omit (with totalText) to drop the total line entirely. */
  totalLabel?: string | null;
  /** Pre-formatted total, e.g. "$112.00" or "SGD 80.00 + USD 32.00". */
  totalText?: string | null;
  /** Optional note shown when a QR image is attached; null to omit. */
  qrNote?: string | null;
}

/**
 * Renders a receipt as plain text for the share-sheet fallback (used when the
 * image capture is unavailable). Pure and i18n-free: every label is passed in,
 * so it is trivially testable and shared by the person and transaction screens.
 */
export function buildReceiptText(input: ReceiptTextInput): string {
  const out: string[] = [input.title];
  if (input.subtitle) out.push(input.subtitle);
  out.push('');

  for (const line of input.lines) {
    out.push(`• ${line.label}: ${line.amount}`);
  }

  if (input.totalLabel && input.totalText) {
    out.push('', `${input.totalLabel}: ${input.totalText}`);
  }
  if (input.qrNote) {
    out.push('', input.qrNote);
  }

  return out.join('\n');
}

/**
 * File name for one shared receipt image. Every share gets its own name: iOS
 * and the receiving apps cache a shared file by its URL, so reusing one fixed
 * path made them send the first person's receipt again for everyone after.
 * Accents are folded (José → jose) and only ASCII letters and digits are
 * kept, so the name stays safe on every file system; the timestamp alone keeps it unique.
 */
export function receiptShareFileName(title: string, now: number): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  return slug ? `settle-up-receipt-${slug}-${now}.png` : `settle-up-receipt-${now}.png`;
}

/**
 * Distinct person names previously entered on splits, most-recently-used first.
 * Powers the name autocomplete in the split editor. Self splits and blank names
 * are skipped; for a given name the casing from its most recent use wins.
 */
// Auto-generated placeholder names ("Person A", "Person B", … "Person AA")
// from Split by Item — never suggest these as real friend names.
const PLACEHOLDER_PERSON_NAME = /^person\s+[a-z]+$/i;

export function recentSplitPersonNames(transactions: TransactionWithRelations[]): string[] {
  const seen = new Map<string, { display: string; date: string }>();
  for (const tx of transactions) {
    const splits = tx.splits;
    if (!splits || splits.length === 0) continue;
    for (const split of splits) {
      if (split.isSelf) continue;
      const name = split.personName?.trim();
      if (!name || PLACEHOLDER_PERSON_NAME.test(name)) continue;
      const key = name.toLowerCase();
      const existing = seen.get(key);
      if (!existing || tx.date > existing.date) {
        seen.set(key, { display: name, date: tx.date });
      }
    }
  }
  return Array.from(seen.values())
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((entry) => entry.display);
}
