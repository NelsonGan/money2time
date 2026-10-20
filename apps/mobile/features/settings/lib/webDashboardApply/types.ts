import type { useApp, useTransactions } from '~/context/AppContext';
import type { EditStep } from '~/services/webDashboardEdits';

export type AppApi = ReturnType<typeof useApp>;
export type TransactionsState = ReturnType<typeof useTransactions>;
export type ModuleStep = Extract<EditStep, { kind: 'module' }>;

/** Saves one module's steps through AppContext, as the app's own editor does. */
export type ApplyModule = {
  /** What the module's planner reads from the app (its `extra`). */
  select?: (app: AppApi, transactions: TransactionsState) => unknown;
  /**
   * Saves one step. Push the id of every transaction it creates to `created`
   * and deletes to `deleted`, so the save is checked once it has landed.
   */
  apply: (app: AppApi, step: ModuleStep, created: string[], deleted: string[]) => void;
};
