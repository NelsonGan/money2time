// The per-category lines of a period budget or a budget template. A line's id
// is its parent's and its category's, the same on every phone, so two phones
// that edit one budget before they sync edit the same rows (the last edit of
// each line wins) rather than each keeping a line per category.

import { getSQLite } from '~/lib/db/client';

const PARENT_COLUMN = {
  monthly_budget_categories: 'budget_id',
  budget_template_categories: 'template_id',
} as const;

type BudgetLineTable = keyof typeof PARENT_COLUMN;

function budgetLineId(parentId: string, categoryId: string): string {
  return `${parentId}:${categoryId}`;
}

/** Makes `lines` the parent's live lines, in order: each is upserted, any other is retired. */
export function writeBudgetLines(
  table: BudgetLineTable,
  parentId: string,
  lines: readonly { categoryId: string; amount: number }[],
  now: string,
): void {
  const db = getSQLite();
  const parent = PARENT_COLUMN[table];
  const ids = lines.map((line) => budgetLineId(parentId, line.categoryId));
  db.runSync(
    `UPDATE "${table}" SET deleted_at = ?, updated_at = ?
     WHERE ${parent} = ? AND deleted_at IS NULL AND id NOT IN (${ids.map(() => '?').join(', ')})`,
    [now, now, parentId, ...ids],
  );
  lines.forEach((line, index) => {
    db.runSync(
      `INSERT INTO "${table}" (id, ${parent}, category_id, amount, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET amount = excluded.amount, sort_order = excluded.sort_order,
         updated_at = excluded.updated_at, deleted_at = NULL`,
      [ids[index], parentId, line.categoryId, line.amount, index, now, now],
    );
  });
}
