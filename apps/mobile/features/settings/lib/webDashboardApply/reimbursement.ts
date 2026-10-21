import { transactionsRepository } from '~/lib/repositories/transactionsRepository';

import type { ApplyModule } from './types';

/**
 * Saves the `module:reimbursement` steps planned in
 * services/webDashboardEditModules/reimbursement.ts, as ReimbursementsScreen
 * does: markTransactionReimbursed into the chosen account, or
 * unmarkTransactionReimbursed for Undo.
 */
export const reimbursementApply: ApplyModule = {
  apply: (app, step, { checks }) => {
    const { id, accountId, date } = step.payload as {
      id: string;
      accountId?: string;
      date?: string;
    };
    // Both skip an expense they cannot find without a word, so the save is
    // checked once it lands: not marked (or still marked) is not applied.
    if (step.action === 'mark') {
      app.markTransactionReimbursed(id, date ? { accountId, date } : { accountId });
      checks.push(() => !!transactionsRepository.getById(id)?.reimbursedAt);
    } else if (step.action === 'unmark') {
      app.unmarkTransactionReimbursed(id);
      checks.push(() => !transactionsRepository.getById(id)?.reimbursedAt);
    } else {
      throw new Error(`unknown reimbursement step ${step.action}`);
    }
  },
};
