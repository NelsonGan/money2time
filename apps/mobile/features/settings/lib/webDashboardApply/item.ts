import { ITEM_ICON_SOURCES } from '~/constants/itemIcons.generated';
import type { ItemExtra } from '~/services/webDashboardEditModules/item';

import type { AppApi, ApplyModule } from './types';

type ItemInput = Parameters<AppApi['createItem']>[0];

/** Saves the `module:item` steps planned in services/webDashboardEditModules/item.ts. */
export const itemApply: ApplyModule = {
  select: (app): ItemExtra => ({
    items: app.items,
    // ItemEditorScreen's currency picker: the main currency and the added ones.
    currencies: [app.settings.currencyCode, ...app.fxCurrencies],
    isIcon: (id) => Object.prototype.hasOwnProperty.call(ITEM_ICON_SOURCES, id),
  }),
  // As ItemEditorScreen saves: createItem / updateItem with the whole form, deleteItem.
  apply: (app, step) => {
    const { id, input, ids } = step.payload as { id?: string; input?: ItemInput; ids?: string[] };
    if (step.action === 'create' && input) app.createItem(input);
    else if (step.action === 'update' && id && input) app.updateItem(id, input);
    else if (step.action === 'delete' && id) app.deleteItem(id);
    else if (step.action === 'reorder' && ids) app.reorderItems(ids);
    else throw new Error(`unknown item step ${step.action}`);
  },
};
