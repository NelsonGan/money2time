import type {
  PersonDebt,
  PersonDebtBill,
  SettleUpSummary,
  TransactionWithRelations,
} from '~/types';

/** Grouping key for unpaid splits that were never given a person name. */
export const UNNAMED_PERSON_KEY = '__unnamed__';

export interface AggregateSettleUpOptions {
  /** The user's reporting currency — the roll-up total is expressed in it. */
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
  // Give up gracefully — count the native amount rather than dropping the bill.
  return amount;
}

interface MutablePerson {
  key: string;
  name: string | null;
  /** Date of the bill the display name came from — most recent wins on casing drift. */
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
        categoryName: tx.categoryName ?? null,
        categoryIcon: tx.categoryIcon ?? null,
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

export interface ReceiptTextStrings {
  /** e.g. "Split summary". */
  heading: string;
  /** Caller-composed subject line, e.g. "Alex → Sarah" or just "Sarah". */
  fromTo: string;
  /** e.g. "You owe". */
  totalLabel: string;
  /** Optional "Pay me back: PayNow · +65 ••4821"; null to omit. */
  payLine: string | null;
  /** Optional note shown when a QR image is attached; null to omit. */
  qrNote: string | null;
  /** e.g. "Sent from money2time". */
  footer: string;
}

export interface BuildReceiptTextOptions {
  strings: ReceiptTextStrings;
  /** Formats a native amount + currency, e.g. (32, 'USD') => "$32.00". */
  formatMoney: (amount: number, currency: string) => string;
}

function billLabel(bill: PersonDebtBill): string {
  const note = bill.note?.trim();
  if (note) return note;
  if (bill.categoryName) return bill.categoryName;
  return bill.date;
}

/**
 * Renders a person's unpaid tab as a plain-text receipt, ready to drop into a
 * share sheet / forwarded message. Pure: all labels come in via `strings` so it
 * carries no i18n dependency and is trivially testable.
 */
export function buildReceiptText(person: PersonDebt, options: BuildReceiptTextOptions): string {
  const { strings, formatMoney } = options;
  const lines: string[] = [strings.heading, strings.fromTo, ''];

  for (const bill of person.bills) {
    lines.push(`• ${billLabel(bill)} — ${formatMoney(bill.amount, bill.currency)}`);
  }

  lines.push('──────────');
  const totalText = person.byCurrency.map((c) => formatMoney(c.amount, c.currency)).join(' + ');
  lines.push(`${strings.totalLabel}: ${totalText}`);

  if (strings.payLine || strings.qrNote) {
    lines.push('');
    if (strings.payLine) lines.push(strings.payLine);
    if (strings.qrNote) lines.push(strings.qrNote);
  }

  lines.push('', strings.footer);
  return lines.join('\n');
}
