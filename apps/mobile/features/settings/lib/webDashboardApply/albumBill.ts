import type { AlbumBillRowInput } from '~/context/AppContext';
import { selfMember } from '~/features/albums/lib/albumPeople';
import { isCurrentMember } from '~/features/albums/lib/groupRules';
import { listGroupBills, listGroupMembers } from '~/features/albums/services/albumGroupStore';
import { listAlbumShares } from '~/features/cloudSync/services/sharedLedgerStore';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import type { AlbumBillExtra } from '~/services/webDashboardEditModules/albumBill';
import { dateKeepingTimeOfDay, dayKeyFromIsoLocal } from '~/utils/formatters';
import { nowIso } from '~/utils/id';

import type { ApplyModule, ApplyTrack } from './types';

type OwnFields = {
  categoryId?: string | null;
  details?: string;
  accountId?: string | null;
  sentiment?: 'happy' | 'neutral' | 'sad';
  reimbursable?: boolean;
};

/** The user's own fields on an entry, as `saveAlbumBillOwnFields` takes them: the row's, changed by `own`. */
function ownFieldsOf(id: string, own: OwnFields) {
  const tx = transactionsRepository.getById(id);
  if (!tx) return null;
  return {
    categoryId: own.categoryId !== undefined ? own.categoryId : tx.categoryId,
    details: own.details !== undefined ? own.details.trim() || null : (tx.details ?? null),
    receiptUri: tx.receiptUri ?? null,
    sentiment: own.sentiment ?? tx.sentiment ?? 'neutral',
    reimbursable: own.reimbursable ?? tx.reimbursable ?? false,
    accountId: own.accountId !== undefined ? own.accountId : tx.accountId,
  };
}

/** A check that each row was written at or after `startedAt` (the app's writers swallow a failure). */
function writtenSince(ids: readonly string[], startedAt: string, track: ApplyTrack) {
  track.checks.push(() =>
    ids.every((id) => {
      const row = transactionsRepository.getById(id);
      return !!row && row.updatedAt >= startedAt;
    }),
  );
}

/**
 * Saves the `module:albumbill` steps planned in
 * services/webDashboardEditModules/albumBill.ts, with the calls
 * EditTransactionScreen, the album's bulk Edit and its Activity tab make.
 * A change of the group's goes through the Worker: the save waits for it
 * (`track.pending`) and fails when it did not go.
 */
export const albumBillApply: ApplyModule = {
  select: (): AlbumBillExtra => ({
    groups: listAlbumShares().map((share) => {
      const members = listGroupMembers(share.ledgerId);
      // The user changes the album only while still in it (`canEditGroup`).
      const self = selfMember(members, share.userId);
      return {
        id: share.ledgerId,
        selfId: self && isCurrentMember(self) ? self.id : null,
        members: members
          .filter((member) => !member.deletedAt)
          .map((member) => ({
            id: member.id,
            name: member.name,
            current: isCurrentMember(member),
          })),
        bills: listGroupBills(share.ledgerId).map((bill) => ({
          id: bill.id,
          date: bill.date,
          note: bill.note,
          currency: bill.currency,
          paidBy: bill.paidBy,
          shares: bill.shares,
          deleted: !!bill.deletedAt,
        })),
      };
    }),
  }),
  apply: (app, step, track) => {
    const p = step.payload as Record<string, unknown>;
    switch (step.action) {
      case 'own': {
        // EditTransactionScreen when only the user's own fields changed.
        const id = p.id as string;
        const fields = ownFieldsOf(id, p.own as OwnFields);
        if (!fields) throw new Error('not found');
        const startedAt = nowIso();
        app.saveAlbumBillOwnFields(id, fields);
        writtenSince([id], startedAt, track);
        return;
      }
      case 'save': {
        // EditTransactionScreen.handleSubmitWithSplits for a shared album's bill.
        const id = p.id as string;
        const tx = transactionsRepository.getById(id);
        const own = tx ? ownFieldsOf(id, p.own as OwnFields) : null;
        if (!tx || !own) throw new Error('not found');
        const rows = p.rows as AlbumBillRowInput[];
        const amount = rows.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
        const day = (p.date as string | null) ?? dayKeyFromIsoLocal(tx.date);
        const input: CreateTransactionInput = {
          type: 'expense',
          amount,
          currency: p.currency as string,
          date: dateKeepingTimeOfDay(day, tx.date),
          note: p.note as string,
          ...own,
        } as CreateTransactionInput;
        track.pending.push(
          app.saveAlbumBill(p.groupId as string, input, rows, id).then((saved) => saved !== null),
        );
        return;
      }
      case 'bulk': {
        // AlbumDetailScreen.handleApplyBulkUpdate: the account is the user's
        // own, on this phone; the day and title the group's, for everyone;
        // the category the user's own, as on any entry.
        const ids = p.ids as string[];
        const date = p.date as string | undefined;
        const note = p.note as string | undefined;
        if (typeof p.accountId === 'string') {
          const accountId = p.accountId;
          const applied = app.setGroupEntriesAccount(ids, accountId);
          track.checks.push(() => applied === ids.length);
        }
        if (date !== undefined || note !== undefined) {
          track.pending.push(app.editGroupBills(ids, { date, note }).done);
        }
        if (typeof p.categoryId === 'string') {
          const startedAt = nowIso();
          app.updateTransactionsBulk(
            ids.map((id) => ({ id, input: { categoryId: p.categoryId as string } })),
          );
          writtenSince(ids, startedAt, track);
        }
        return;
      }
      case 'delete': {
        // EditTransactionScreen's Delete, and the selection's: through the
        // group, for everyone; the payments stay.
        track.pending.push(app.deleteGroupBills(p.ids as string[]));
        return;
      }
      case 'restore':
        // The Activity tab's Restore.
        track.pending.push(app.restoreAlbumBill(p.groupId as string, p.billId as string));
        return;
      default:
        throw new Error(`unknown album bill step ${step.action}`);
    }
  },
};
