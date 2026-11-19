/**
 * A shared album's activity log as its Activity card shows it: one line per
 * entry ("Tess changed Dinner: RM100 → RM120"), and, when someone else's change
 * to a bill moved the user's share, a short note of how ("Your share RM30 →
 * RM40"), with whether it costs them more or less. Pure: the screen passes
 * names, money and what this phone knows. See README.md > Album members and
 * shared albums > Activity.
 */

import { I18n } from '~/lib/i18n';
import type { AlbumActivity, AlbumBillSnapshot } from '~/types';

import { albumCategoryLabel } from './albumCategories';
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
  /** A category's name as the album shows it now (`albumCategoryNameOf`); a default's without. */
  categoryName?: (key: string) => string;
}

/** How a change moved the user's share: less to pay (`in`) or more (`out`). */
export type MineTone = 'in' | 'out';

export interface ActivityLine {
  id: string;
  /** Who made the change. */
  actorId: string | null;
  /** The one line. */
  text: string;
  /** How it moved the user's share, when someone else did it; null otherwise. */
  mine: string | null;
  /** Which way the share moved (meaningless while `mine` is null). */
  tone: MineTone;
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
  const line = (
    text: string,
    mine: string | null = null,
    tone: MineTone = 'out',
  ): ActivityLine => ({
    id: entry.id,
    actorId: entry.actorMemberId,
    text,
    // Only someone else's change is news about the user's money.
    mine: byMe ? null : mine,
    tone,
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
          t('your_share', { money: ctx.money(mine.share, after.currency) }),
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
        'in',
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
      } else if (after.category && before.category !== after.category) {
        text = t('recategorized_bill', {
          actor,
          title,
          category: (ctx.categoryName ?? albumCategoryLabel)(after.category),
        });
      } else {
        text = t('changed_bill', { actor, title });
      }
      // How it moved the user's share.
      const was = shareOf(before, ctx.selfId);
      const now = shareOf(after, ctx.selfId);
      if (cents(was) === cents(now)) return line(text);
      return line(
        text,
        now > 0
          ? t('your_share_change', { before: fmt(was), after: fmt(now) })
          : t('your_share_gone', { money: fmt(was) }),
        now > was ? 'out' : 'in',
      );
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
      if (entry.kind === 'payment_undone') {
        // "Ben undid paying you", or "Tess undid you paying Ben": the payer
        // is mid-sentence here.
        if (entry.actorMemberId === payment.from) return line(t('undid_own_payment', values));
        return line(t('undid_payment', { ...values, from: who(payment.from, false) }));
      }
      return line(t(payment.even ? 'paid_even' : 'paid', values));
    }
    case 'member_joined':
      return line(t(entry.started ? 'started' : 'joined', { name: who(entry.memberId) }));
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
    case 'category_changed': {
      const change = entry.category;
      const nameOf = (look: { name: string | null } | null) =>
        look?.name ?? (change ? albumCategoryLabel(change.key) : '');
      if (!change?.before)
        return line(t('category_added', { actor, name: nameOf(change?.after ?? null) }));
      if (!change.after) return line(t('category_removed', { actor, name: nameOf(change.before) }));
      const before = nameOf(change.before);
      const after = nameOf(change.after);
      return line(
        before === after
          ? t('category_icon', { actor, name: after })
          : t('category_renamed', { actor, before, after }),
      );
    }
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
