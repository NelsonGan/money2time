/**
 * Web Dashboard edits: claiming back a reimbursable expense, or undoing it
 * (ReimbursementsScreen). Planned on the phone like the app's own page;
 * applied by features/settings/lib/webDashboardApply/reimbursement.ts.
 *
 *   mark   { id, at, accountId?, date? }   the money came back, into accountId
 *   unmark { id, at }                      undo: the refund entry goes
 *
 * `at` is the expense's `updated_at`. Without `accountId` the refund lands where
 * the page's chip points: the account picked for it, else the expense's own.
 * `date` is the refund's day, `YYYY-MM-DD`; today when absent, as on the page.
 * The page opens for everyone: flagging an expense as reimbursable is the Pro
 * gate (the transaction editor's), so claiming it back is not.
 */

import type { EditModule, ModuleOp } from '../webDashboardEdits';
import { isAt, isDayKey, isId } from './shared';

type ReimbursementOp =
  | {
      entity: 'module:reimbursement';
      op: 'mark';
      id: string;
      at: string | null;
      accountId?: string;
      date?: string;
    }
  | { entity: 'module:reimbursement'; op: 'unmark'; id: string; at: string | null };

function read(raw: Record<string, unknown>): ModuleOp | null {
  const { op } = raw;
  if (!isId(raw.id) || !isAt(raw.at)) return null;
  const entity = 'module:reimbursement' as const;
  const keys = Object.keys(raw);
  if (op === 'unmark') {
    return keys.length === 4 ? { entity, op, id: raw.id, at: raw.at } : null;
  }
  if (op !== 'mark') return null;
  const allowed = ['entity', 'op', 'id', 'at', 'accountId', 'date'];
  if (keys.some((key) => !allowed.includes(key))) return null;
  if ('accountId' in raw && !isId(raw.accountId)) return null;
  if ('date' in raw && !isDayKey(raw.date)) return null;
  return {
    entity,
    op,
    id: raw.id,
    at: raw.at,
    ...('accountId' in raw ? { accountId: raw.accountId as string } : {}),
    ...('date' in raw ? { date: raw.date as string } : {}),
  };
}

export const reimbursementModule: EditModule = {
  entity: 'module:reimbursement',
  read,
  rowIds: (raw) => [(raw as unknown as ReimbursementOp).id],
  plan: (tools, raw, steps) => {
    const op = raw as unknown as ReimbursementOp;
    if (!tools.claim(`tx:${op.id}`)) return tools.refuse('invalid');
    const expense = tools.lookup.transactions.find((tx) => tx.id === op.id);
    // Gone on the phone, or changed there since the browser's copy.
    if (!expense || expense.deletedAt || expense.updatedAt !== op.at) {
      return tools.refuse('conflict');
    }
    if (op.op === 'unmark') {
      // The page's Paid back list: anything marked, kept reachable for undo.
      if (!expense.reimbursedAt) return tools.refuse('invalid');
      steps.push({
        kind: 'module',
        entity: 'module:reimbursement',
        action: 'unmark',
        payload: { id: expense.id },
      });
      return tools.ok(1);
    }
    // The page's Waiting to come back list: a flagged expense not yet paid back.
    if (expense.type !== 'expense' || !expense.reimbursable || expense.reimbursedAt) {
      return tools.refuse('invalid');
    }
    const accountId = op.accountId ?? expense.reimbursementAccountId ?? expense.accountId;
    // "Add an account first": the page will not claim into nowhere.
    if (!tools.findAccount(accountId)) return tools.refuse('invalid');
    steps.push({
      kind: 'module',
      entity: 'module:reimbursement',
      action: 'mark',
      payload: { id: expense.id, accountId, ...(op.date ? { date: op.date } : {}) },
    });
    return tools.ok(1);
  },
};
