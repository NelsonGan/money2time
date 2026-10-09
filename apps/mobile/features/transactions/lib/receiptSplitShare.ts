// Pure helpers for surfacing a persisted itemized receipt split (the
// receipt_splits record) in Settle Up share cards. No RN imports.

import type { ReceiptSplit } from '~/types';

import { computeReceiptSplit, type PersonReceiptShare, receiptPersonKey } from './receiptSplitMath';

/**
 * Re-run the split math over a persisted itemized record. Persisted shares
 * carry distinct materialized names (self, or "Person A"/custom), so we key
 * by the settle-up name-key here. Item amounts already include tax.
 */
function computePersonSharesFromRecord(record: ReceiptSplit): PersonReceiptShare[] {
  return computeReceiptSplit({
    items: record.items.map((item) => ({
      id: item.id,
      lineTotal: item.lineTotal,
      shares: item.shares.map((share) => ({
        personKey: receiptPersonKey(share.personName, share.isSelf),
        isSelf: share.isSelf,
        weight: share.weight,
      })),
    })),
  }).perPerson;
}

/**
 * The item names a person had on a bill, for a receipt's per-person bullet
 * list. Returns null when the person isn't on the record.
 */
export function personItemNames(record: ReceiptSplit, personName: string | null): string[] | null {
  if (!personName?.trim()) return null;
  const key = receiptPersonKey(personName, false);
  const person = computePersonSharesFromRecord(record).find((p) => p.personKey === key);
  if (!person || person.lines.length === 0) return null;

  const itemNameById = new Map(record.items.map((item) => [item.id, item.name]));
  return person.lines
    .map((line) => itemNameById.get(line.itemId)?.trim())
    .filter((name): name is string => Boolean(name));
}
