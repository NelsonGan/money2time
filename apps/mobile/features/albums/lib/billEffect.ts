/**
 * What one bill of a shared album is to one member, as its row in the album's
 * Transactions tab shows it beside who paid: the share they borrowed when
 * someone else paid, what they lent the others when they paid, the whole bill
 * when it was theirs alone, or nothing when they are not on it. The bill as
 * split, not what is still owed: payments do not change it.
 *
 * The website's `apps/web/src/lib/album/debts.ts` (`billEffect`), the same
 * rules, so a bill reads the same on the phone and on album.money2time.com.
 */

import type { AlbumExpense } from '~/types';

import { cents, ownSide } from './albumGroup';

export type BillEffect = { kind: 'borrowed' | 'lent' | 'paid'; amount: number } | { kind: 'none' };

/** Read off `ownSide`, the same split the user's own entry is made from. */
export function billEffect(
  bill: Pick<AlbumExpense, 'id' | 'amount' | 'paidBy' | 'shares'>,
  selfId: string | null,
): BillEffect {
  const side = ownSide(bill, selfId);
  if (side.kind === 'paid') {
    const lent = cents(side.total) - cents(side.selfShare);
    return lent > 0 ? { kind: 'lent', amount: lent / 100 } : { kind: 'paid', amount: side.total };
  }
  if (side.kind === 'owes') return { kind: 'borrowed', amount: side.selfShare };
  return { kind: 'none' };
}
