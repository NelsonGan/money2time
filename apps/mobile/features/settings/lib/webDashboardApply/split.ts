import type { SplitDraftInput } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import type { SplitDraftPayload, SplitExtra } from '~/services/webDashboardEditModules/split';

import type { ApplyModule } from './types';

/** The Split Bill page names Me with the app's label; a saved Me keeps its own. */
function toInputs(splits: SplitDraftPayload[]): SplitDraftInput[] {
  return splits.map((split) => ({
    ...split,
    personName:
      split.isSelf && !split.personName
        ? String(I18n.t('transactions.editor.split.me_label'))
        : split.personName,
  }));
}

/** The editor's "Pending reimbursement" tick fires this as it changes (TransactionEditorScreen). */
function trackReimbursable(input: Record<string, unknown>) {
  if (typeof input.reimbursable === 'boolean') {
    void trackEvent(AnalyticsEvents.REIMBURSEMENT_FLAGGED, { reimbursable: input.reimbursable });
  }
}

/**
 * Saves the `module:split` steps planned in services/webDashboardEditModules/split.ts,
 * with the calls AddTransactionScreen, EditTransactionScreen and SettleUpShareList make.
 */
export const splitApply: ApplyModule = {
  select: (app): SplitExtra => ({
    // The editor's own count, read from AppContext's live transactions.
    unpaidBills: app.getUnpaidSplitBillCount(),
  }),
  apply: (app, step, { created }) => {
    const payload = step.payload;
    switch (step.action) {
      case 'create': {
        // AddTransactionScreen.handleSubmitWithSplits: a new bill has no paid share,
        // so the parent starts at the full amount.
        created.push(
          app.createTransactionWithSplits(
            payload.input as unknown as CreateTransactionInput,
            toInputs(payload.splits as SplitDraftPayload[]),
          ),
        );
        if ((payload.input as Record<string, unknown>).reimbursable === true) {
          trackReimbursable(payload.input as Record<string, unknown>);
        }
        return;
      }
      case 'update': {
        // EditTransactionScreen.handleSubmitWithSplits: the split rows first, then
        // the staged Mark paid / Undo, then the transaction's own fields.
        const id = payload.id as string;
        app.updateTransactionSplits(id, toInputs(payload.splits as SplitDraftPayload[]));
        for (const paid of payload.markPaid as { id: string; paybackAccountId: string | null }[]) {
          app.markSplitPaid(paid.id, { paybackAccountId: paid.paybackAccountId });
        }
        for (const splitId of payload.markUnpaid as string[]) app.markSplitUnpaid(splitId);
        const input = payload.input as Partial<CreateTransactionInput>;
        if (Object.keys(input).length) app.updateTransaction(id, input);
        trackReimbursable(input as Record<string, unknown>);
        return;
      }
      case 'settle': {
        // SettleUpShareList: the share's payback account (picked on its chip), then Mark paid.
        const splitId = payload.splitId as string;
        if (typeof payload.paybackAccountId === 'string') {
          app.markSplitPaid(splitId, { paybackAccountId: payload.paybackAccountId });
        } else {
          app.markSplitPaid(splitId);
        }
        return;
      }
      case 'unsettle':
        app.markSplitUnpaid(payload.splitId as string);
        return;
      case 'remove':
        // SettleUpShareList's bin, after "Remove this request?".
        app.deleteSplit(payload.splitId as string);
        return;
      case 'payback':
        // SettleUpShareList's account chip.
        app.updateSplitPaybackAccount(
          payload.splitId as string,
          payload.paybackAccountId as string,
        );
        return;
      case 'default_payback':
        // SettleUpSettingsScreen's "Default paid to".
        app.updateSettings({ defaultPaybackAccountId: payload.accountId as string });
        return;
      default:
        throw new Error(`unknown split step ${step.action}`);
    }
  },
};
