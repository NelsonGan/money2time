import type { WageConfig } from '~/types';

import type { ApplyModule } from './types';

/** Saves the `module:wage` steps planned in services/webDashboardEditModules/wage.ts. */
export const wageApply: ApplyModule = {
  // What the Hourly value screen lists.
  select: (app) => app.monthlyWages,
  apply: (app, step) => {
    const month = String(step.payload.month);
    if (step.action === 'delete') {
      // As the screen's delete confirmation.
      app.deleteWageConfigForMonth(month);
      return;
    }
    // As the wage calculator's last step saves for its month.
    app.updateWageConfigForMonth(month, step.payload.config as WageConfig);
  },
};
