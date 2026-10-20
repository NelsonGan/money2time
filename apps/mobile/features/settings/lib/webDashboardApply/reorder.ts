import type { ApplyModule } from './types';

/** Saves the `module:reorder` steps planned in services/webDashboardEditModules/reorder.ts. */
export const reorderApply: ApplyModule = {
  apply: (app, step) => {
    const ids = step.payload.ids as string[];
    // The same calls the Accounts and Categories screens make when a drag ends.
    switch (step.action) {
      case 'accounts':
        app.reorderAccounts(ids);
        return;
      case 'groups':
        app.reorderAccountGroups(ids);
        return;
      case 'categories':
        app.reorderCategories(ids);
        return;
      default:
        throw new Error(`unknown reorder step ${step.action}`);
    }
  },
};
