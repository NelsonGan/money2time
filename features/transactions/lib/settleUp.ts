import type {
  PersonDebt,
  PersonDebtBill,
  SettleUpByTransactionSummary,
  SettleUpSummary,
  TransactionDebt,
  TransactionDebtSplit,
  TransactionWithRelations,
} from '~/types';

/** Grouping key for unpaid splits that were never given a person name. */
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

interface MutablePerson {
  key: string;
  name: string | null;
  /** Date of the bill the display name came from; most recent wins on casing drift. */
  nameDate: string;
  totalReporting: number;
  byCurrency: Map<string, number>;
  bills: PersonDebtBill[];
  oldestDate: string;
}

/**
 * Rolls every unpaid, non-self split across all transactions up by person.
 * People are grouped by trimmed, case-folded name; splits with no name collapse
 * into a single {@link UNNAMED_PERSON_KEY} bucket. Totals are in the reporting
 * currency; `byCurrency` preserves the native subtotals for cross-currency tabs.
 */
export function aggregateUnpaidSplitsByPerson(
  transactions: TransactionWithRelations[],
  options: AggregateSettleUpOptions,
): SettleUpSummary {
  const { reportingCurrency, rateToReporting } = options;
  const people = new Map<string, MutablePerson>();

  for (const tx of transactions) {
    const splits = tx.splits;
    if (!splits || splits.length === 0) continue;
    for (const split of splits) {
      if (split.isSelf) continue;
      if (split.paidAt) continue;
      if (!(split.amount > 0)) continue;

      const trimmed = split.personName?.trim() ?? '';
      const name = trimmed.length > 0 ? trimmed : null;
      const key = name ? name.toLowerCase() : UNNAMED_PERSON_KEY;

      const reportingAmount = roundCents(
        splitReportingAmount(split.amount, tx, reportingCurrency, rateToReporting),
      );
      const bill: PersonDebtBill = {
        splitId: split.id,
        transactionId: tx.id,
        date: tx.date,
        amount: split.amount,
        currency: tx.currency,
        reportingAmount,
        note: tx.note ?? null,
        itemNote: split.note ?? null,
        categoryName: tx.categoryName ?? null,
        categoryIcon: tx.categoryIcon ?? null,
        paybackAccountId: split.paybackAccountId ?? tx.accountId ?? null,
      };

      let person = people.get(key);
      if (!person) {
        person = {
          key,
          name,
          nameDate: tx.date,
          totalReporting: 0,
          byCurrency: new Map(),
          bills: [],
          oldestDate: tx.date,
        };
        people.set(key, person);
      }
      person.bills.push(bill);
      person.totalReporting = roundCents(person.totalReporting + reportingAmount);
      person.byCurrency.set(
        tx.currency,
        roundCents((person.byCurrency.get(tx.currency) ?? 0) + split.amount),
      );
      if (tx.date < person.oldestDate) person.oldestDate = tx.date;
      if (name && tx.date >= person.nameDate) {
        person.name = name;
        person.nameDate = tx.date;
      }
    }
  }

  const result: PersonDebt[] = [];
  let grandTotal = 0;
  let billCount = 0;
  for (const person of people.values()) {
    // Newest bill first within a person's tab.
    person.bills.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const byCurrency = Array.from(person.byCurrency.entries())
      .map(([currency, amount]) => ({ currency, amount }))
      .sort((a, b) => b.amount - a.amount);
    result.push({
      key: person.key,
      name: person.name,
      totalReporting: person.totalReporting,
      byCurrency,
      bills: person.bills,
      oldestDate: person.oldestDate,
      billCount: person.bills.length,
    });
    grandTotal = roundCents(grandTotal + person.totalReporting);
    billCount += person.bills.length;
  }

  // Most owed first; the unnamed bucket always sinks to the bottom on ties.
  result.sort((a, b) => {
    if (b.totalReporting !== a.totalReporting) return b.totalReporting - a.totalReporting;
    if (a.key === UNNAMED_PERSON_KEY) return 1;
    if (b.key === UNNAMED_PERSON_KEY) return -1;
    return 0;
  });

  return {
    people: result,
    totalReporting: grandTotal,
    personCount: result.length,
    billCount,
    reportingCurrency,
  };
}

/**
 * Cheap count of distinct people who still owe on at least one unpaid, non-self
 * split. Mirrors {@link aggregateUnpaidSplitsByPerson}'s filtering and person-key
 * derivation, but skips all the bill/byCurrency/sorting work — used by the
 * always-mounted Settings badge so a transaction write anywhere in the app
 * doesn't run the full per-person roll-up just to show a number.
 */
export function countUnpaidDebtors(transactions: TransactionWithRelations[]): number {
  const keys = new Set<string>();
  for (const tx of transactions) {
    const splits = tx.splits;
    if (!splits || splits.length === 0) continue;
    for (const split of splits) {
      if (split.isSelf) continue;
      if (split.paidAt) continue;
      if (!(split.amount > 0)) continue;
      const trimmed = split.personName?.trim() ?? '';
      keys.add(trimmed.length > 0 ? trimmed.toLowerCase() : UNNAMED_PERSON_KEY);
    }
  }
  return keys.size;
}

/**
 * Cheap count of transactions that are still unsettled split bills — i.e. carry
 * at least one unpaid, non-self split with a positive amount. Mirrors
 * {@link aggregateUnpaidSplitsByTransaction}'s per-transaction filtering but skips
 * all the roll-up work. Used to gate free-plan split-bill creation.
 */
export function countUnpaidSplitBills(transactions: TransactionWithRelations[]): number {
  let count = 0;
  for (const tx of transactions) {
    const splits = tx.splits;
    if (!splits || splits.length === 0) continue;
    const hasUnpaid = splits.some((split) => !split.isSelf && !split.paidAt && split.amount > 0);
    if (hasUnpaid) count += 1;
  }
  return count;
}

/**
 * Rolls unpaid, non-self splits up by transaction: one entry per bill that still
 * has money owed on it, each carrying every person's outstanding share. Mirrors
 * {@link aggregateUnpaidSplitsByPerson}'s filtering and reporting-currency logic.
 */
export function aggregateUnpaidSplitsByTransaction(
  transactions: TransactionWithRelations[],
  options: AggregateSettleUpOptions,
): SettleUpByTransactionSummary {
  const { reportingCurrency, rateToReporting } = options;
  const result: TransactionDebt[] = [];
  let grandTotal = 0;
  let splitCount = 0;

  for (const tx of transactions) {
    const splits = tx.splits;
    if (!splits || splits.length === 0) continue;

    const owed: TransactionDebtSplit[] = [];
    let totalReporting = 0;
    let totalNative = 0;
    for (const split of splits) {
      if (split.isSelf) continue;
      if (split.paidAt) continue;
      if (!(split.amount > 0)) continue;

      const trimmed = split.personName?.trim() ?? '';
      const reportingAmount = roundCents(
        splitReportingAmount(split.amount, tx, reportingCurrency, rateToReporting),
      );
      owed.push({
        splitId: split.id,
        personName: trimmed.length > 0 ? trimmed : null,
        itemNote: split.note ?? null,
        amount: split.amount,
        currency: tx.currency,
        reportingAmount,
        paybackAccountId: split.paybackAccountId ?? tx.accountId ?? null,
      });
      totalReporting = roundCents(totalReporting + reportingAmount);
      totalNative = roundCents(totalNative + split.amount);
    }
    if (owed.length === 0) continue;

    // Largest share first within a bill.
    owed.sort((a, b) => b.reportingAmount - a.reportingAmount);
    result.push({
      transactionId: tx.id,
      date: tx.date,
      note: tx.note ?? null,
      categoryName: tx.categoryName ?? null,
      categoryIcon: tx.categoryIcon ?? null,
      currency: tx.currency,
      totalReporting,
      totalNative,
      splits: owed,
      splitCount: owed.length,
    });
    grandTotal = roundCents(grandTotal + totalReporting);
    splitCount += owed.length;
  }

  // Newest bill first; tie-break by amount then id so ordering is stable.
  result.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (b.totalReporting !== a.totalReporting) return b.totalReporting - a.totalReporting;
    return a.transactionId < b.transactionId ? -1 : a.transactionId > b.transactionId ? 1 : 0;
  });

  return {
    transactions: result,
    totalReporting: grandTotal,
    transactionCount: result.length,
    splitCount,
    reportingCurrency,
  };
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
 * Distinct person names previously entered on splits, most-recently-used first.
 * Powers the name autocomplete in the split editor. Self splits and blank names
 * are skipped; for a given name the casing from its most recent use wins.
 */
export function recentSplitPersonNames(transactions: TransactionWithRelations[]): string[] {
  const seen = new Map<string, { display: string; date: string }>();
  for (const tx of transactions) {
    const splits = tx.splits;
    if (!splits || splits.length === 0) continue;
    for (const split of splits) {
      if (split.isSelf) continue;
      const name = split.personName?.trim();
      if (!name) continue;
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
