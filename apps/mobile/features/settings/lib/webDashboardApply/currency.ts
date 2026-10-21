import type { CurrencyExtra } from '~/services/webDashboardEditModules/currency';

import type { ApplyModule } from './types';

/** Saves the `module:currency` steps planned in services/webDashboardEditModules/currency.ts. */
export const currencyApply: ApplyModule = {
  select: (app): CurrencyExtra => ({
    reporting: app.settings.currencyCode,
    fxCurrencies: app.fxCurrencies,
  }),
  apply: (app, step) => {
    const { payload } = step;
    switch (step.action) {
      case 'add':
        // The list is saved before it resolves; the rest fetches its first rate if it can.
        void app.addFxCurrency(String(payload.code));
        return;
      case 'remove':
        app.removeFxCurrency(String(payload.code));
        return;
      case 'reorder':
        app.reorderFxCurrencies(payload.codes as string[]);
        return;
      case 'rate':
        app.setManualExchangeRate(String(payload.code), Number(payload.rate));
        return;
      default:
        throw new Error(`unknown currency step ${step.action}`);
    }
  },
};
