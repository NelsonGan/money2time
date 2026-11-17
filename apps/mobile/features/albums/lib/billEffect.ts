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

import { cents } from './albumGroup';

export type BillEffect = { kind: 'borrowed' | 'lent' | 'paid'; amount: number } | { kind: 'none' };

export function billEffect(
  bill: Pick<AlbumExpense, 'amount' | 'paidBy' | 'shares'>,
  selfId: string | null,
): BillEffect {
  if (!selfId) return { kind: 'none' };
  const mine = bill.shares
    .filter((share) => share.memberId === selfId)
    .reduce((sum, share) => sum + cents(share.amount), 0);
  if (bill.paidBy === selfId) {
    const lent = cents(bill.amount) - mine;
    return lent > 0
      ? { kind: 'lent', amount: lent / 100 }
      : { kind: 'paid', amount: cents(bill.amount) / 100 };
  }
  return mine > 0 ? { kind: 'borrowed', amount: mine / 100 } : { kind: 'none' };
}
