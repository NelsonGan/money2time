/**
 * The album's Transactions tab on a shared album: each bill's row says who paid
 * the whole bill under its title, and on the right what it is to the user
 * (`billEffect`) instead of the user's own entry amount. The album screen
 * provides the lookup; every other list leaves it null and rows read as before.
 * README: Shared albums > Transactions tab.
 */

import { createContext, useContext } from 'react';

import { I18n } from '~/lib/i18n';
import type { AlbumExpense, AlbumMember } from '~/types';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency } from '~/utils/formatters';

import { type BillEffect, billEffect } from './billEffect';

export interface AlbumBillSide {
  /** Who paid the whole bill: "Daniel paid RM132.40", "You paid RM180.00". */
  paid: string;
  /** What the bill is to the user. */
  kind: BillEffect['kind'];
  /** The word over the amount ("You borrowed", "You lent"); null on a bill that was the user's alone. */
  tag: string | null;
  /** The user's amount, in the bill's currency; null on a bill they are not on. */
  amount: number | null;
}

export type AlbumBillSides = (transactionId: string) => AlbumBillSide | null;

export const AlbumBillSidesContext = createContext<AlbumBillSides | null>(null);

/** The row's side of its shared album's bill, or null outside a shared album's tab. */
export function useAlbumBillSide(transactionId: string): AlbumBillSide | null {
  const sideOf = useContext(AlbumBillSidesContext);
  return sideOf ? sideOf(transactionId) : null;
}

/** A lookup from an entry's id (its bill's id) to the side its row shows. */
export function albumBillSides(
  bills: readonly AlbumExpense[],
  members: readonly AlbumMember[],
  selfId: string | null,
): AlbumBillSides {
  const byId = new Map(bills.map((bill) => [bill.id, bill]));
  const names = new Map(members.map((member) => [member.id, member.name]));
  const cache = new Map<string, AlbumBillSide | null>();
  return (transactionId) => {
    if (cache.has(transactionId)) return cache.get(transactionId)!;
    const bill = byId.get(transactionId);
    let side: AlbumBillSide | null = null;
    if (bill) {
      const total = formatCurrency(bill.amount, currencySymbolForCode(bill.currency));
      const effect = billEffect(bill, selfId);
      side = {
        paid:
          bill.paidBy === selfId
            ? I18n.t('albums.bill.you_paid_total', { amount: total })
            : I18n.t('albums.bill.paid_total', {
                name: names.get(bill.paidBy)?.trim() || I18n.t('transactions.settleUp.someone'),
                amount: total,
              }),
        kind: effect.kind,
        tag:
          effect.kind === 'borrowed'
            ? I18n.t('albums.bill.borrowed_tag')
            : effect.kind === 'lent'
              ? I18n.t('albums.bill.lent_tag')
              : effect.kind === 'none'
                ? I18n.t('albums.bill.not_involved_tag')
                : null,
        amount: effect.kind === 'none' ? null : effect.amount,
      };
    }
    cache.set(transactionId, side);
    return side;
  };
}
