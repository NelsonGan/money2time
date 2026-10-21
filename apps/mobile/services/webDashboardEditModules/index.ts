/**
 * Entities beyond the built-in ones (transactions, accounts, groups,
 * categories, recurring rules) that the Web Dashboard can change, one module
 * each. A module reads its ops, plans them like the app's editor for it, and
 * leaves steps that its counterpart in features/settings/lib/webDashboardApply/
 * saves through AppContext.
 */

import type { EditModule } from '../webDashboardEdits';
import { albumModule } from './album';
import { budgetModule } from './budget';
import { currencyModule } from './currency';
import { goalModule } from './goal';
import { itemModule } from './item';
import { loanModule } from './loan';
import { reimbursementModule } from './reimbursement';
import { reorderModule } from './reorder';
import { splitModule } from './split';
import { wageModule } from './wage';

export const EDIT_MODULES: EditModule[] = [
  goalModule,
  loanModule,
  budgetModule,
  itemModule,
  albumModule,
  splitModule,
  reimbursementModule,
  wageModule,
  currencyModule,
  reorderModule,
];
