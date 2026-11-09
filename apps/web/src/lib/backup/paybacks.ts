/**
 * A friend's paybacks on a split bill, as the app records them. Mark paid (or
 * a part payment) into another account than the bill's writes a transfer the
 * share points at (`paid_transaction_id`); one into the bill's own account, or
 * on a bill with no account, writes nothing but the paid share, and the
 * transaction lists show it as a row of its own (`Model.paybackRows`), as the
 * app's `buildPaybackRows` does. No imports, so the tests can load it.
 */

/** A paid share that wrote no transfer, so the lists show it as a payback row. */
export function paidWithoutTransfer<T extends {
  is_self?: number | boolean | null;
  paid_at?: string | null;
  paid_transaction_id?: string | null;
  amount: number;
}>(split: T): split is T & { paid_at: string } {
  return !split.is_self && !!split.paid_at && !split.paid_transaction_id && split.amount > 0;
}

/**
 * A payback's note, as the app writes it on a payback transfer
 * (`buildPaybackTransferNote`): "Aisha: Dinner", a name over 8 characters cut
 * to 7 and "..".
 */
export function paybackNote(personName: string | null | undefined, billNote: string | null | undefined): string {
  const name = (personName ?? "").trim();
  const short = name.length > 8 ? `${name.slice(0, 7)}..` : name;
  const note = (billNote ?? "").trim();
  if (short && note) return `${short}: ${note}`;
  return short || note;
}

/**
 * `txs` with the payback rows (`Model.paybackRows`) merged in, newest first
 * (stored rows first on the same moment); the same list back when there are
 * none.
 */
export function withPaybackRows<T extends { date: Date }>(txs: T[], paybackRows: T[]): T[] {
  if (paybackRows.length === 0) return txs;
  return [...txs, ...paybackRows].sort((a, b) => b.date.getTime() - a.date.getTime());
}
