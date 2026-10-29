/**
 * "Everything": a new ledger made as a full copy of another one, history and
 * all. Every row gets a new id and every reference between the rows follows
 * it, so the copy shares nothing with its source and either can be edited or
 * deleted on its own.
 *
 * The plan is pure (rows in, rows out) so it is tested without a database;
 * `copyLedgerRows` runs it against SQLite inside the caller's transaction.
 * Inserts go through plain SQL, so Cloud Sync's triggers record them like any
 * other write.
 *
 * Not copied: deleted rows (except deleted budget periods, which stop
 * auto-create bringing a period back), rows that point at one (an album's
 * join to a deleted entry), payment-alert captures and the card digits they
 * match on (they belong to the phone that saw the notification), and the
 * ledger's own preferences (they name the source's accounts; the copy starts
 * with defaults). Image paths are shared, which is safe: the asset sweep
 * keeps a file while any row still names it.
 */

type Row = Record<string, unknown>;

/** The id space a reference column points into. */
type Target =
  | 'accounts'
  | 'categories'
  | 'transactions'
  | 'albums'
  | 'budget_templates'
  | 'monthly_budgets'
  | 'receipt_splits'
  | 'receipt_split_items';

interface TableSpec {
  table: string;
  /** Rows chosen by `ledger_id`, or by their parent's (copied) id. */
  owner: { ledger: true } | { parent: string; via: Target };
  /** Reference columns and the table their id comes from. */
  refs: Record<string, Target>;
  /**
   * NOT NULL references: a row whose target is not copied (an album entry
   * pointing at a deleted transaction) is left out rather than nulled, which
   * the column would refuse.
   */
  required?: readonly string[];
  /** Copy soft-deleted rows too: they are tombstones the app reads. */
  withDeleted?: boolean;
  /** Columns the copy starts empty (they belong to the source only). */
  cleared?: readonly string[];
}

/** Parents before children, so a child's parent is already planned. */
export const LEDGER_COPY_TABLES: readonly TableSpec[] = [
  { table: 'account_groups', owner: { ledger: true }, refs: {} },
  { table: 'categories', owner: { ledger: true }, refs: { parent_id: 'categories' } },
  {
    table: 'accounts',
    owner: { ledger: true },
    refs: { loan_payment_category_id: 'categories' },
    // The card digits payment alerts match on: routing is per ledger.
    cleared: ['auto_log_identifiers_json'],
  },
  {
    table: 'transactions',
    owner: { ledger: true },
    refs: {
      account_id: 'accounts',
      from_account_id: 'accounts',
      to_account_id: 'accounts',
      reimbursement_account_id: 'accounts',
      category_id: 'categories',
      recurrence_parent_id: 'transactions',
      reimbursement_transaction_id: 'transactions',
      reimbursement_of_id: 'transactions',
    },
  },
  {
    table: 'recurring_rules',
    owner: { ledger: true },
    refs: {
      account_id: 'accounts',
      from_account_id: 'accounts',
      to_account_id: 'accounts',
      category_id: 'categories',
    },
  },
  {
    table: 'transaction_splits',
    owner: { parent: 'transaction_id', via: 'transactions' },
    refs: {
      transaction_id: 'transactions',
      payback_account_id: 'accounts',
      paid_transaction_id: 'transactions',
    },
    required: ['transaction_id'],
  },
  { table: 'albums', owner: { ledger: true }, refs: {} },
  {
    table: 'album_transactions',
    owner: { parent: 'album_id', via: 'albums' },
    refs: { album_id: 'albums', transaction_id: 'transactions' },
    required: ['album_id', 'transaction_id'],
  },
  { table: 'items', owner: { ledger: true }, refs: {} },
  { table: 'budget_templates', owner: { ledger: true }, refs: {} },
  {
    table: 'budget_template_categories',
    owner: { parent: 'template_id', via: 'budget_templates' },
    refs: { template_id: 'budget_templates', category_id: 'categories' },
    required: ['template_id', 'category_id'],
  },
  {
    table: 'monthly_budgets',
    owner: { ledger: true },
    refs: { template_id: 'budget_templates' },
    // A deleted period stops auto-create bringing it back (schema.ts).
    withDeleted: true,
  },
  {
    table: 'monthly_budget_categories',
    owner: { parent: 'budget_id', via: 'monthly_budgets' },
    refs: { budget_id: 'monthly_budgets', category_id: 'categories' },
    required: ['budget_id', 'category_id'],
  },
  {
    table: 'receipt_splits',
    owner: { parent: 'transaction_id', via: 'transactions' },
    refs: { transaction_id: 'transactions' },
    required: ['transaction_id'],
  },
  {
    table: 'receipt_split_items',
    owner: { parent: 'receipt_split_id', via: 'receipt_splits' },
    refs: { receipt_split_id: 'receipt_splits' },
    required: ['receipt_split_id'],
  },
  {
    table: 'receipt_split_item_shares',
    owner: { parent: 'receipt_split_id', via: 'receipt_splits' },
    refs: { receipt_split_id: 'receipt_splits', item_id: 'receipt_split_items' },
    required: ['receipt_split_id', 'item_id'],
  },
];

/** Which id space a table's own ids belong to, when other rows point at them. */
const ID_SPACE: Record<string, Target | undefined> = {
  accounts: 'accounts',
  categories: 'categories',
  transactions: 'transactions',
  albums: 'albums',
  budget_templates: 'budget_templates',
  monthly_budgets: 'monthly_budgets',
  receipt_splits: 'receipt_splits',
  receipt_split_items: 'receipt_split_items',
};

/** The rows of one table that a plan may copy (the plan filters further). */
export type ReadRows = (spec: TableSpec) => Row[];

/**
 * The rows to insert for a copy into `targetLedgerId`. `read` returns the
 * source's live rows for a ledger table, and every live row of a child table
 * (the plan keeps the children of copied parents only). A reference to a row
 * that is not copied (deleted, or another ledger's) becomes null, so the copy
 * never points back into its source.
 */
export function planLedgerCopy(
  read: ReadRows,
  targetLedgerId: string,
  newId: () => string,
  now: string,
): { table: string; rows: Row[] }[] {
  const maps = new Map<Target, Map<string, string>>();
  const mapOf = (target: Target) => {
    let map = maps.get(target);
    if (!map) {
      map = new Map();
      maps.set(target, map);
    }
    return map;
  };

  // Every id first, so self-references (a transaction's reimbursement, a
  // subcategory's parent) resolve whatever order the rows come in.
  const chosen = LEDGER_COPY_TABLES.map((spec) => {
    const owner = spec.owner;
    const rows = read(spec).filter(
      (row) =>
        ('ledger' in owner || mapOf(owner.via).has(String(row[owner.parent]))) &&
        (spec.required ?? []).every((column) => mapOf(spec.refs[column]).has(String(row[column]))),
    );
    const space = ID_SPACE[spec.table];
    const ids = new Map<string, string>();
    for (const row of rows) {
      const id = newId();
      ids.set(String(row.id), id);
      if (space) mapOf(space).set(String(row.id), id);
    }
    return { spec, rows, ids };
  });

  return chosen.map(({ spec, rows, ids }) => ({
    table: spec.table,
    rows: rows.map((row) => {
      const copy: Row = { ...row, id: ids.get(String(row.id)), updated_at: now };
      if ('ledger' in spec.owner) copy.ledger_id = targetLedgerId;
      for (const column of spec.cleared ?? []) if (column in copy) copy[column] = null;
      for (const [column, target] of Object.entries(spec.refs)) {
        const old = row[column];
        if (old == null) continue;
        copy[column] = mapOf(target).get(String(old)) ?? null;
      }
      return copy;
    }),
  }));
}

type BindValue = string | number | null | boolean | Uint8Array;

/**
 * A table's rows that belong to the source ledger: by `ledger_id`, or through
 * their parent chain (an itemized receipt's line belongs to a receipt, which
 * belongs to a transaction in the ledger), so no other ledger's rows are read.
 */
function rowsOfSource(spec: TableSpec, ledgerId: string): { where: string; params: BindValue[] } {
  const owner = spec.owner;
  if ('ledger' in owner) return { where: 'ledger_id = ?', params: [ledgerId] };
  const parent = LEDGER_COPY_TABLES.find((candidate) => candidate.table === owner.via);
  if (!parent) throw new Error(`ledgerCopy: no spec for ${owner.via}`);
  const inner = rowsOfSource(parent, ledgerId);
  return {
    where: `${owner.parent} IN (SELECT id FROM ${parent.table} WHERE ${inner.where})`,
    params: inner.params,
  };
}

interface SqliteLike {
  getAllSync<T>(sql: string, params: BindValue[]): T[];
  runSync(sql: string, params: BindValue[]): unknown;
}

/**
 * Copy every live row of `sourceLedgerId` into `targetLedgerId`. Run inside
 * the caller's transaction, after the target ledger row exists.
 */
export function copyLedgerRows(
  sqlite: SqliteLike,
  sourceLedgerId: string,
  targetLedgerId: string,
  newId: () => string,
  now: string,
): number {
  const plan = planLedgerCopy(
    (spec) => {
      const scope = rowsOfSource(spec, sourceLedgerId);
      const live = spec.withDeleted ? '' : ' AND deleted_at IS NULL';
      return sqlite.getAllSync<Row>(
        `SELECT * FROM ${spec.table} WHERE ${scope.where}${live}`,
        scope.params,
      );
    },
    targetLedgerId,
    newId,
    now,
  );
  let copied = 0;
  for (const { table, rows } of plan) {
    for (const row of rows) {
      const columns = Object.keys(row);
      sqlite.runSync(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map((column) => (row[column] ?? null) as BindValue),
      );
      copied += 1;
    }
  }
  return copied;
}
