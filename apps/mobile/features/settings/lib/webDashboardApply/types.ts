import type { useApp } from '~/context/AppContext';
import type { EditStep } from '~/services/webDashboardEdits';

export type AppApi = ReturnType<typeof useApp>;
export type ModuleStep = Extract<EditStep, { kind: 'module' }>;

/** What a saver hands back about one step, so the save is checked once it has landed. */
export type ApplyTrack = {
  /** Ids of the transactions the step creates. */
  created: string[];
  /** Ids of the transactions the step deletes. */
  deleted: string[];
  /** Checks that the step's change is in the database; any false fails the save. */
  checks: (() => boolean)[];
};

/** Saves one module's steps through AppContext, as the app's own editor does. */
export type ApplyModule = {
  /**
   * What the module's planner reads from the app (its `extra`), read when an
   * edit for it arrives. Anything transaction-derived is read from the
   * database or AppContext's live getters, not from `useTransactions()`, which
   * a hidden tab holds still.
   */
  select?: (app: AppApi) => unknown;
  /** Saves one step, recording what it creates, deletes and must have saved in `track`. */
  apply: (app: AppApi, step: ModuleStep, track: ApplyTrack) => void;
};
