/**
 * Who may do what in a shared album. Pure, so the screens, the writes in
 * AppContext and the tests read one set of rules (README: Album members and
 * shared albums > Who can change what).
 *
 * The idea is that nobody moves anyone else's money:
 *
 * - **Only you can say you paid.** A bill's payer is the user, or someone on
 *   the list who has not joined (they have no phone, so no account moves).
 * - **A bill belongs to its payer.** Only they change it or delete it; a bill
 *   a person who has not joined paid belongs to everyone.
 * - **Payments lock a bill.** With a payment recorded on it, nobody changes
 *   or deletes it until the payments are undone.
 * - **Only the person paying records a payment**, and only they undo it. A
 *   payment from someone who has not joined is recorded by the person it went
 *   to.
 */

interface Member {
  id: string;
  userId: string | null;
}

interface Bill {
  paidBy: string;
}

interface Payment {
  expenseId: string | null;
  fromMember: string;
  toMember: string;
  deletedAt?: string | null;
}

const joined = (members: readonly Member[], memberId: string) =>
  !!members.find((member) => member.id === memberId)?.userId;

/** Whether a member can be named a bill's payer by the user. */
export function canBePayer(members: readonly Member[], selfId: string, memberId: string): boolean {
  return memberId === selfId || !joined(members, memberId);
}

/** Whether the user may change or delete a bill, payments aside. */
export function ownsBill(members: readonly Member[], selfId: string, bill: Bill): boolean {
  return bill.paidBy === selfId || !joined(members, bill.paidBy);
}

/** Whether any payment still stands on a bill. */
export function billHasPayments(payments: readonly Payment[], billId: string): boolean {
  return payments.some((payment) => !payment.deletedAt && payment.expenseId === billId);
}

/** Why the user cannot change a bill, or null when they can. */
export function billChangeBlock(
  members: readonly Member[],
  selfId: string,
  bill: Bill,
  payments: readonly Payment[],
  billId: string,
): 'not_payer' | 'has_payments' | null {
  if (!ownsBill(members, selfId, bill)) return 'not_payer';
  if (billHasPayments(payments, billId)) return 'has_payments';
  return null;
}

/**
 * Whether the user may record (or undo) a payment from one member to
 * another: their own, or one to them from someone who has not joined.
 */
export function canRecordPayment(
  members: readonly Member[],
  selfId: string,
  fromMember: string,
  toMember: string,
): boolean {
  return fromMember === selfId || (toMember === selfId && !joined(members, fromMember));
}
