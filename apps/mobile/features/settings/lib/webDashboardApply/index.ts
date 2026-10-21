import { albumApply } from './album';
import { budgetApply } from './budget';
import { currencyApply } from './currency';
import { goalApply } from './goal';
import { itemApply } from './item';
import { loanApply } from './loan';
import { reimbursementApply } from './reimbursement';
import { reorderApply } from './reorder';
import { splitApply } from './split';
import type { ApplyModule } from './types';
import { wageApply } from './wage';

/** Each module's saver, by its entity (`module:<name>`). */
export const APPLY_MODULES: Record<string, ApplyModule> = {
  'module:goal': goalApply,
  'module:loan': loanApply,
  'module:budget': budgetApply,
  'module:item': itemApply,
  'module:album': albumApply,
  'module:split': splitApply,
  'module:reimbursement': reimbursementApply,
  'module:wage': wageApply,
  'module:currency': currencyApply,
  'module:reorder': reorderApply,
};
