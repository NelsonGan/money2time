/**
 * Who may do what in a shared album. Pure, so the screens, the writes in
 * AppContext and the tests read one set of rules (README: Album members and
 * shared albums > Who can change what).
 *
 * Everyone in a shared album joined it with an account, and nobody moves
 * anyone else's money:
 *
 * - **Only you can say you paid.** A bill's payer is whoever adds it.
 * - **A bill belongs to its payer.** Only they change it or delete it.
 * - **Payments lock a bill.** With a payment recorded on it, nobody changes
 *   or deletes it until the payments are undone.
 * - **Only the person paying records a payment**, and only its recorder
 *   undoes it (including all the bills of a simplified payment).
 *   Someone who has left the album can no longer record theirs, so a payment
 *   from them is recorded by the person it went to.
 */

interface Bill {
  paidBy: string;
}

interface Payment {
  expenseId: string | null;
  fromMember: string;
  toMember: string;
  deletedAt?: string | null;
}

/** Whether the user may change or delete a bill, payments aside: it is theirs. */
export function ownsBill(selfId: string, bill: Bill): boolean {
  return bill.paidBy === selfId;
}

/** Whether any payment still stands on a bill. */
export function billHasPayments(payments: readonly Payment[], billId: string): boolean {
  return payments.some((payment) => !payment.deletedAt && payment.expenseId === billId);
}

/** Why the user cannot change a bill, or null when they can. */
export function billChangeBlock(
  selfId: string,
  bill: Bill,
  payments: readonly Payment[],
  billId: string,
): 'not_payer' | 'has_payments' | null {
  if (!ownsBill(selfId, bill)) return 'not_payer';
  if (billHasPayments(payments, billId)) return 'has_payments';
  return null;
}

interface Member {
  id: string;
  /** The account that joined; null once they have left. */
  userId: string | null;
}

/**
 * Whether the user may record (or undo) a payment: one they make, or one to
 * them from someone who has left.
 */
export function canRecordPayment(
  members: readonly Member[],
  selfId: string,
  fromMember: string,
  toMember: string,
): boolean {
  if (fromMember === selfId) return true;
  return toMember === selfId && !members.find((member) => member.id === fromMember)?.userId;
}

/**
 * A simplified payment may close bills through other members. Only its
 * recorder undoes that whole act, not a member on an intermediate bill.
 * Old payments without an author, and payments whose recorder has since
 * left (so nobody could undo them and their bills stayed locked), follow the
 * payer rule: the payer, or the person paid once the payer has left.
 */
export function canUndoPayment(
  members: readonly Member[],
  selfId: string,
  payment: { fromMember: string; toMember: string; createdBy: string | null },
): boolean {
  const self = members.find((member) => member.id === selfId);
  if (!self?.userId) return false;
  if (payment.createdBy === self.userId) return true;
  const recorderStayed =
    !!payment.createdBy && members.some((member) => member.userId === payment.createdBy);
  if (recorderStayed) return false;
  return canRecordPayment(members, selfId, payment.fromMember, payment.toMember);
}
