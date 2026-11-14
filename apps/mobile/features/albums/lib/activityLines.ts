/**
 * A shared album's activity log as the Activity tab shows it: one line per
 * entry ("Tess changed Dinner: RM100 → RM120"), and, when the change moved the
 * user's own money and someone else made it, a second line saying how ("Your
 * share RM30 → RM40"). Pure: the screen passes names, money and what this
 * phone knows. See README.md > Album members and shared albums > Activity.
 */

import { I18n } from '~/lib/i18n';
import type { AlbumActivity, AlbumBillSnapshot } from '~/types';

import { cents } from './albumGroup';

export interface ActivityContext {
  /** The user's own member in the album, or null. */
  selfId: string | null;
  /** A member's name as the album shows it. */
  nameOf: (memberId: string | null) => string;
  /** Money in a currency ("RM30.00"). */
  money: (amount: number, currency: string) => string;
  /** A bill's day, for a bill moved to another one. */
  day: (date: string) => string;
  /** Whether a bill the user paid still waits for their account here. */
  needsAccount: (billId: string) => boolean;
  /** Whether a deleted bill is still deleted (and so can be restored). */
  isDeleted: (billId: string) => boolean;
}

export interface ActivityLine {
  id: string;
  /** Who made the change. */
  actorId: string | null;
  /** The one line. */
  text: string;
  /** How it moved the user's own money, when someone else did it; null otherwise. */
  mine: string | null;
  /** The bill a tap opens. */
  billId: string | null;
  /** A deleted bill that can be brought back from here. */
  restorable: boolean;
  createdAt: string;
}

const shareOf = (bill: AlbumBillSnapshot | null, memberId: string | null) =>
  !bill || !memberId
    ? 0
    : bill.shares
        .filter((share) => share.memberId === memberId)
        .reduce((sum, share) => sum + share.amount, 0);

const sameShares = (a: AlbumBillSnapshot, b: AlbumBillSnapshot) => {
  const key = (bill: AlbumBillSnapshot) =>
    bill.shares
      .map((share) => `${share.memberId}:${cents(share.amount)}`)
      .sort()
      .join(',');
  return key(a) === key(b);
};

/** The user's part in a bill as money: their share, and whether they paid it. */
function myPart(bill: AlbumBillSnapshot | null, selfId: string | null) {
  return { share: shareOf(bill, selfId), paid: !!bill && !!selfId && bill.paidBy === selfId };
}

export function describeActivity(entry: AlbumActivity, ctx: ActivityContext): ActivityLine {
  const t = (key: string, options?: Record<string, unknown>) =>
    I18n.t(`albums.activity.${key}`, options);
  const byMe = !!ctx.selfId && entry.actorMemberId === ctx.selfId;
  const who = (memberId: string | null, capital = true) =>
    memberId && memberId === ctx.selfId ? t(capital ? 'you' : 'you_lower') : ctx.nameOf(memberId);
  const actor = who(entry.actorMemberId);
  const bill = entry.bill?.after ?? entry.bill?.before ?? null;
  const title = bill?.note?.trim() || t('untitled');
  const line = (text: string, mine: string | null = null): ActivityLine => ({
    id: entry.id,
    actorId: entry.actorMemberId,
    text,
    // Only someone else's change is news about the user's money.
    mine: byMe ? null : mine,
    billId: entry.expenseId,
    restorable:
      entry.kind === 'bill_deleted' && !!entry.expenseId && ctx.isDeleted(entry.expenseId),
    createdAt: entry.createdAt,
  });

  switch (entry.kind) {
    case 'bill_added':
    case 'bill_restored': {
      const after = entry.bill?.after ?? null;
      if (!after) return line(t('changed_bill', { actor, title }));
      const mine = myPart(after, ctx.selfId);
      const money = ctx.money(after.amount, after.currency);
      // Someone else saying the user paid: the account is the user's to give.
      if (mine.paid && !byMe) {
        return line(
          t(entry.kind === 'bill_added' ? 'said_you_paid' : 'restored', { actor, title, money }),
          entry.expenseId && ctx.needsAccount(entry.expenseId)
            ? t('choose_account')
            : t('your_share', { money: ctx.money(mine.share, after.currency) }),
        );
      }
      return line(
        t(entry.kind === 'bill_added' ? 'added' : 'restored', { actor, title, money }),
        mine.share > 0 ? t('your_share', { money: ctx.money(mine.share, after.currency) }) : null,
      );
    }
    case 'bill_deleted': {
      const before = entry.bill?.before ?? null;
      const money = before ? ctx.money(before.amount, before.currency) : '';
      const mine = myPart(before, ctx.selfId);
      return line(
        t('deleted', { actor, title, money }),
        before && (mine.share > 0 || mine.paid)
          ? t('your_share_gone', { money: ctx.money(mine.share, before.currency) })
          : null,
      );
    }
    case 'bill_edited': {
      const before = entry.bill?.before ?? null;
      const after = entry.bill?.after ?? null;
      if (!before || !after) return line(t('changed_bill', { actor, title }));
      const fmt = (amount: number) => ctx.money(amount, after.currency);
      let text: string;
      if (cents(before.amount) !== cents(after.amount) || before.currency !== after.currency) {
        text = t('changed_amount', {
          actor,
          title,
          before: ctx.money(before.amount, before.currency),
          after: fmt(after.amount),
        });
      } else if (before.paidBy !== after.paidBy) {
        text = t('changed_payer', {
          actor,
          title,
          before: who(before.paidBy, false),
          after: who(after.paidBy, false),
        });
      } else if (!sameShares(before, after)) {
        text = t('changed_split', { actor, title });
      } else if ((before.note ?? '') !== (after.note ?? '')) {
        text = t('renamed_bill', {
          actor,
          before: before.note?.trim() || t('untitled'),
          after: title,
        });
      } else if (before.date !== after.date) {
        text = t('moved_bill', { actor, title, day: ctx.day(after.date) });
      } else {
        text = t('changed_bill', { actor, title });
      }
      // How it moved the user's money: who paid first, then their share.
      const was = myPart(before, ctx.selfId);
      const now = myPart(after, ctx.selfId);
      let mine: string | null = null;
      if (!was.paid && now.paid) {
        mine =
          entry.expenseId && ctx.needsAccount(entry.expenseId)
            ? t('you_paid_choose_account')
            : t('you_paid');
      } else if (was.paid && !now.paid) {
        mine = t('they_paid', { name: who(after.paidBy) });
      } else if (cents(was.share) !== cents(now.share)) {
        mine =
          now.share > 0
            ? t('your_share_change', { before: fmt(was.share), after: fmt(now.share) })
            : t('your_share_gone', { money: fmt(was.share) });
      }
      return line(text, mine);
    }
    case 'payment_recorded':
    case 'payment_undone': {
      const payment = entry.payment;
      if (!payment) return line(t('changed_bill', { actor, title }));
      const values = {
        actor,
        from: who(payment.from),
        to: who(payment.to, false),
        money: ctx.money(payment.amount, payment.currency),
      };
      const involvesMe = payment.from === ctx.selfId || payment.to === ctx.selfId;
      if (entry.kind === 'payment_undone') {
        // "Tess undid you paying Ben": the payer is mid-sentence here.
        return line(
          t('undid_payment', { ...values, from: who(payment.from, false) }),
          involvesMe ? t('recorded_by', { actor }) : null,
        );
      }
      return line(
        t(payment.even ? 'paid_even' : 'paid', values),
        involvesMe ? t('recorded_by', { actor }) : null,
      );
    }
    case 'member_joined':
      return line(t('joined', { name: who(entry.memberId) }));
    case 'member_left':
      return line(t('left', { name: who(entry.memberId) }));
    case 'member_renamed':
      return line(
        t('renamed_member', {
          before: entry.rename?.before ?? '',
          after: entry.rename?.after ?? '',
        }),
      );
    case 'simplify_changed':
      return line(t(entry.simplify ? 'simplify_on' : 'simplify_off', { actor }));
    case 'cover_changed':
      return line(t('cover', { actor }));
  }
}

export interface ActivityDay {
  /** The local day, `YYYY-MM-DD`. */
  day: string;
  lines: ActivityLine[];
}

/** The lines grouped by the local day they happened on, newest day first (the lines already are). */
export function groupActivityByDay(
  lines: readonly ActivityLine[],
  dayOf: (iso: string) => string,
): ActivityDay[] {
  const days: ActivityDay[] = [];
  for (const line of lines) {
    const day = dayOf(line.createdAt);
    const last = days.at(-1);
    if (last?.day === day) last.lines.push(line);
    else days.push({ day, lines: [line] });
  }
  return days;
}
