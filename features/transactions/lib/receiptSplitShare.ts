// Pure helpers for surfacing a persisted itemized receipt split (the
// receipt_splits record) in Settle Up share cards. No RN imports.

import type { ReceiptSplit } from '~/types';

import { computeReceiptSplit, type PersonReceiptShare, receiptPersonKey } from './receiptSplitMath';

/** Re-run the split math over a persisted itemized record. */
export function computePersonSharesFromRecord(record: ReceiptSplit): PersonReceiptShare[] {
  return computeReceiptSplit({
    items: record.items.map((item) => ({
      id: item.id,
      lineTotal: item.lineTotal,
      shares: item.shares.map((share) => ({
        personName: share.personName,
        isSelf: share.isSelf,
        weight: share.weight,
      })),
    })),
    tax: record.taxAmount,
    service: record.serviceAmount,
    discount: record.discountAmount,
    adjustment: record.adjustmentAmount,
    total: record.totalAmount,
  }).perPerson;
}

export interface PersonItemBreakdownLine {
  key: string;
  label: string;
  amount: number;
  /** True for the prorated tax/service/discount line. */
  isProration?: boolean;
}

/**
 * One friend's item lines on a bill: what they had (by item name) plus their
 * prorated tax/fees slice. Returns null when the person isn't on the record —
 * callers keep the flat one-line rendering.
 */
export function personItemBreakdown(
  record: ReceiptSplit,
  personName: string | null,
): PersonItemBreakdownLine[] | null {
  if (!personName?.trim()) return null;
  const key = receiptPersonKey(personName, false);
  const person = computePersonSharesFromRecord(record).find((p) => p.personKey === key);
  if (!person || person.lines.length === 0) return null;

  const itemNameById = new Map(record.items.map((item) => [item.id, item.name]));
  const lines: PersonItemBreakdownLine[] = person.lines.map((line) => ({
    key: line.itemId,
    label: itemNameById.get(line.itemId) ?? '',
    amount: line.amount,
  }));
  if (Math.round(person.proration * 100) !== 0) {
    lines.push({ key: '__proration__', label: '', amount: person.proration, isProration: true });
  }
  return lines;
}
