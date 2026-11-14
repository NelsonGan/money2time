/**
 * Who may do what in a shared album. Pure, so the screens, the writes in
 * AppContext and the tests read one set of rules (README: Album members and
 * shared albums > Anyone in it can change it). The Worker keeps the same
 * rules for every write (apps/cloudflare/workers/cloud-sync/src/albumGroups.ts).
 *
 * - **Anyone in the album changes anything of the group's**: adds, edits
 *   (amount, day, title, payer, shares) and deletes any bill, restores a
 *   deleted one, and records or undoes a payment between any two members.
 * - **What is each person's own stays theirs**: a bill's account, category,
 *   longer note, receipt and mood live on their phone only.
 * - **Someone who has left changes nothing.** Their bills stay, and stay
 *   theirs, but they are never put on a new one.
 */

interface Member {
  id: string;
  /** The account that joined; null once they have left. */
  userId: string | null;
  deletedAt?: string | null;
}

interface Payment {
  expenseId: string | null;
  deletedAt?: string | null;
}

/** Whether a member is still in the album. */
export function isCurrentMember(member: Member | undefined | null): boolean {
  return !!member?.userId && !member.deletedAt;
}

/** Whether the user (by account) can change the album: they are still in it. */
export function canEditGroup(members: readonly Member[], userId: string | null): boolean {
  return !!userId && members.some((member) => member.userId === userId && !member.deletedAt);
}

/**
 * The people a bill can be paid by, or split with: everyone still in the
 * album, and anyone who left but is already on the bill (`keep`).
 */
export function billPeople<T extends Member>(
  members: readonly T[],
  keep: readonly string[] = [],
): T[] {
  return members.filter((member) => isCurrentMember(member) || keep.includes(member.id));
}

/** Whether any payment still stands on a bill: changing or deleting it then asks first. */
export function billHasPayments(payments: readonly Payment[], billId: string): boolean {
  return payments.some((payment) => !payment.deletedAt && payment.expenseId === billId);
}
