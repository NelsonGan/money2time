/**
 * Web Dashboard edits: the order of accounts, account groups and categories,
 * as the app's Accounts and Categories screens set it by dragging. Planned on
 * the phone; applied by features/settings/lib/webDashboardApply/reorder.ts.
 *
 *   module:reorder  accounts { ids }   groups { ids }   categories { type, ids }
 *
 * Like the app's own drag, an op carries the whole new order: every account
 * the Accounts screen sorts (all but savings goals, which have their own
 * list), every account group, or every category of one type (parents and
 * their subcategories in one list). It must be exactly that set as the phone
 * has it now, or the browser's copy is behind and the op is refused.
 */

import type { EditModule, ModuleOp } from '../webDashboardEdits';

/** A batch's row limit (MAX_EDIT_ROWS), kept here so this module imports no values from the planner. */
const MAX_IDS = 500;

type ReorderOp =
  | { entity: 'module:reorder'; op: 'accounts' | 'groups'; ids: string[] }
  | { entity: 'module:reorder'; op: 'categories'; type: 'expense' | 'income'; ids: string[] };

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 64;

function read(raw: Record<string, unknown>): ModuleOp | null {
  const { op, ids } = raw;
  const keys = op === 'categories' ? ['type', 'ids'] : ['ids'];
  if (op !== 'accounts' && op !== 'groups' && op !== 'categories') return null;
  if (Object.keys(raw).some((key) => key !== 'entity' && key !== 'op' && !keys.includes(key))) {
    return null;
  }
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_IDS) return null;
  if (!ids.every(isId) || new Set(ids).size !== ids.length) return null;
  if (op === 'categories') {
    if (raw.type !== 'expense' && raw.type !== 'income') return null;
    return { entity: 'module:reorder', op, type: raw.type, ids: [...ids] };
  }
  return { entity: 'module:reorder', op, ids: [...ids] };
}

/** Whether `ids` is `live` in some order: nothing missing, nothing extra. */
function isPermutation(ids: string[], live: string[]): boolean {
  const set = new Set(live);
  return ids.length === set.size && ids.every((id) => set.has(id));
}

export const reorderModule: EditModule = {
  entity: 'module:reorder',
  read,
  size: (op) => (op as unknown as ReorderOp).ids.length,
  plan: (tools, raw, steps) => {
    const op = raw as unknown as ReorderOp;
    const key = op.op === 'categories' ? `reorder:categories:${op.type}` : `reorder:${op.op}`;
    if (!tools.claim(key)) return tools.refuse('invalid');
    const type = op.op === 'categories' ? op.type : null;
    const live =
      op.op === 'accounts'
        ? // The Accounts screen's sections hold every account but savings goals.
          tools.liveAccounts.filter((account) => account.type !== 'goal').map((a) => a.id)
        : op.op === 'groups'
          ? tools.lookup.accountGroups.filter((group) => !group.deletedAt).map((g) => g.id)
          : tools.liveCategories.filter((item) => item.type === type).map((c) => c.id);
    if (!isPermutation(op.ids, live)) return tools.refuse('conflict');
    steps.push({
      kind: 'module',
      entity: 'module:reorder',
      action: op.op,
      payload: { ids: op.ids },
    });
    return tools.ok(op.ids.length);
  },
};
