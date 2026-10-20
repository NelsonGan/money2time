import type { ApplyModule } from './types';

/**
 * Saves the `module:reimbursement` steps planned in
 * services/webDashboardEditModules/reimbursement.ts, as ReimbursementsScreen
 * does: markTransactionReimbursed into the chosen account, or
 * unmarkTransactionReimbursed for Undo.
 */
export const reimbursementApply: ApplyModule = {
  apply: (app, step) => {
    const { id, accountId, date } = step.payload as {
      id: string;
      accountId?: string;
      date?: string;
    };
    if (step.action === 'mark') {
      app.markTransactionReimbursed(id, date ? { accountId, date } : { accountId });
    } else if (step.action === 'unmark') {
      app.unmarkTransactionReimbursed(id);
    } else {
      throw new Error(`unknown reimbursement step ${step.action}`);
    }
  },
};
