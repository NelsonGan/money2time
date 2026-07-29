import { isClaimable } from '~/features/transactions/lib/reimbursements';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import type { ReimbursementStatus, TransactionType } from '~/types';
import { nowIso } from '~/utils/id';

export interface BulkTransactionChanges {
  date?: string;
  note?: string | null;
  /** Applied only to selected income transactions. */
  incomeCategoryId?: string;
  /** Applied only to selected expense transactions. */
  expenseCategoryId?: string;
  /**
   * Mark every selected expense claimable, for this payer, at its full amount.
   * Filing a trip's receipts is the motivating case, and it should not cost one
   * editor round-trip per row. Already-cleared claims are left alone.
   */
  claimPayer?: string | null;
}

/** What {@link buildBulkUpdateInputs} needs to know about a selected row. */
export interface BulkTransactionSubject {
  type: TransactionType;
  amount: number;
  reimbursementStatus: ReimbursementStatus | null;
}

export function buildBulkUpdateInputs(
  selectedIds: string[],
  changes: BulkTransactionChanges,
  getTransaction: (id: string) => BulkTransactionSubject | undefined,
): { id: string; input: Partial<CreateTransactionInput> }[] {
  const updates: { id: string; input: Partial<CreateTransactionInput> }[] = [];
  selectedIds.forEach((id) => {
    const input: Partial<CreateTransactionInput> = {};
    if (changes.date !== undefined) input.date = changes.date;
    if (changes.note !== undefined) input.note = changes.note;
    const subject = getTransaction(id);
    const type = subject?.type;
    if (type === 'income' && changes.incomeCategoryId) {
      input.categoryId = changes.incomeCategoryId;
    } else if (type === 'expense' && changes.expenseCategoryId) {
      input.categoryId = changes.expenseCategoryId;
    }
    // Claim the whole expense. A cleared claim is skipped rather than
    // overwritten: its amount is already written off, so re-claiming would
    // double-count it. Transfers and income have nothing to claim.
    if (changes.claimPayer !== undefined && subject && isClaimable(subject)) {
      input.reimbursementStatus = 'pending';
      input.reimbursementPayer = changes.claimPayer;
      input.reimbursementAmount = subject.amount;
      if (subject.reimbursementStatus !== 'pending') input.reimbursementClaimedAt = nowIso();
    }
    if (Object.keys(input).length > 0) updates.push({ id, input });
  });
  return updates;
}
