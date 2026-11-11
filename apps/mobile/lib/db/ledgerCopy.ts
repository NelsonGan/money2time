/**
 * A new ledger copied from another one: "Everything" (history and all), or
 * the parts the user picked (`ledgerPartsCopySpecs`). Every row gets a new id
 * and every reference between the rows follows it, so the copy shares nothing
 * with its source and either can be edited or deleted on its own.
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

import { lastLoanRestOnOrBefore, loanLedgerAnchor } from '~/features/loans/lib/loanMath';
import type { RecurrencePattern } from '~/types';
import { isAfterRecurringEndDate, nextRunAfter } from '~/utils/recurringRules';

type Row = Record<string, unknown>;

/** The id space a reference column points into. */
type Target =
  | 'accounts'
  | 'categories'
  | 'transactions'
  | 'transaction_splits'
  | 'albums'
  | 'budget_templates'
  | 'monthly_budgets'
  | 'receipt_splits'
  | 'receipt_split_items'
  | 'recurring_rules';

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
  /** Rows of the table worth copying; every row when absent. */
  keep?: (row: Row) => boolean;
  /**
   * Every non-null reference must land on a copied row, or the row is left
   * out: a recurring rule whose account stays behind would run into nothing.
   */
  allRefs?: boolean;
  /** References `allRefs` lets go of: one that does not land becomes null. */
  optionalRefs?: readonly string[];
  /** Last changes to a planned copy (`source` is the row it copies), after its references are mapped. */
  adjust?: (copy: Row, source: Row) => void;
  /** Last changes across all of a table's copies (`sources[i]` is what `copies[i]` copies). */
  finish?: (copies: Row[], sources: Row[]) => void;
}

/**
 * Part payments point at their share's first row (`part_of_split_id`). When
 * that row is not copied (it was removed, here or by an older app version that
 * hands nothing over), the reference would map to null and split the share
 * into separate paid shares. Instead the oldest copied part becomes the share's
 * first row and the others point at it, as `planShareHandover` does in the app.
 */
function keepPartPaymentsTogether(copies: Row[], sources: Row[]): void {
  const orphansByShare = new Map<string, number[]>();
  copies.forEach((copy, index) => {
    const sourceShare = sources[index]?.part_of_split_id;
    if (sourceShare == null || copy.part_of_split_id != null) return;
    const key = String(sourceShare);
    orphansByShare.set(key, [...(orphansByShare.get(key) ?? []), index]);
  });
  for (const indexes of orphansByShare.values()) {
    const ordered = [...indexes].sort((a, b) => {
      const aAt = String(sources[a]?.created_at ?? '');
      const bAt = String(sources[b]?.created_at ?? '');
      return aAt === bAt
        ? String(copies[a]?.id).localeCompare(String(copies[b]?.id))
        : aAt < bAt
          ? -1
          : 1;
    });
    const [first, ...rest] = ordered;
    if (first === undefined) continue;
    for (const index of rest) copies[index]!.part_of_split_id = copies[first]!.id;
  }
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
      // A transfer's fee follows the transfer into the copy.
      fee_of_id: 'transactions',
      // A payment follows its instalment plan into the copy.
      instalment_rule_id: 'recurring_rules',
    },
    // A shared ledger's people are not the new ledger's: its entries become
    // the user's own (null is the ledger's owner).
    cleared: ['created_by', 'member_id'],
  },
  {
    table: 'recurring_rules',
    owner: { ledger: true },
    refs: {
      account_id: 'accounts',
      from_account_id: 'accounts',
      to_account_id: 'accounts',
      category_id: 'categories',
      // A transfer rule's fee is filed under the copy's category.
      fee_category_id: 'categories',
    },
    cleared: ['member_id'],
  },
  {
    table: 'transaction_splits',
    owner: { parent: 'transaction_id', via: 'transactions' },
    refs: {
      transaction_id: 'transactions',
      payback_account_id: 'accounts',
      paid_transaction_id: 'transactions',
      part_of_split_id: 'transaction_splits',
    },
    required: ['transaction_id'],
    finish: keepPartPaymentsTogether,
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
  transaction_splits: 'transaction_splits',
  albums: 'albums',
  budget_templates: 'budget_templates',
  monthly_budgets: 'monthly_budgets',
  receipt_splits: 'receipt_splits',
  receipt_split_items: 'receipt_split_items',
  recurring_rules: 'recurring_rules',
};

/** The rows of one table that a plan may copy (the plan filters further). */
type ReadRows = (spec: TableSpec) => Row[];

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
  specs: readonly TableSpec[] = LEDGER_COPY_TABLES,
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
  const chosen = specs.map((spec) => {
    const owner = spec.owner;
    const lands = (row: Row, column: string) => mapOf(spec.refs[column]).has(String(row[column]));
    const rows = read(spec).filter(
      (row) =>
        ('ledger' in owner || mapOf(owner.via).has(String(row[owner.parent]))) &&
        (spec.required ?? []).every((column) => lands(row, column)) &&
        (!spec.allRefs ||
          Object.keys(spec.refs).every(
            (column) =>
              row[column] == null ||
              lands(row, column) ||
              (spec.optionalRefs?.includes(column) ?? false),
          )) &&
        (spec.keep?.(row) ?? true),
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

  return chosen.map(({ spec, rows, ids }) => {
    const copies = rows.map((row) => {
      const copy: Row = { ...row, id: ids.get(String(row.id)), updated_at: now };
      if ('ledger' in spec.owner) copy.ledger_id = targetLedgerId;
      for (const column of spec.cleared ?? []) if (column in copy) copy[column] = null;
      for (const [column, target] of Object.entries(spec.refs)) {
        const old = row[column];
        if (old == null) continue;
        copy[column] = mapOf(target).get(String(old)) ?? null;
      }
      spec.adjust?.(copy, row);
      return copy;
    });
    spec.finish?.(copies, rows);
    return { table: spec.table, rows: copies };
  });
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
 * Copy every live row of `sourceLedgerId` into `targetLedgerId`, or only the
 * tables in `specs` (`ledgerPartsCopySpecs`). Run inside the caller's
 * transaction, after the target ledger row exists.
 */
export function copyLedgerRows(
  sqlite: SqliteLike,
  sourceLedgerId: string,
  targetLedgerId: string,
  newId: () => string,
  now: string,
  specs: readonly TableSpec[] = LEDGER_COPY_TABLES,
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
    specs,
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

/** The parts of a ledger a new one can start with, short of "Everything". */
export const LEDGER_COPY_PARTS = [
  'accounts',
  'categories',
  'goals',
  'loans',
  'recurring',
  'budgets',
  'items',
  'albums',
] as const;
export type LedgerCopyPart = (typeof LEDGER_COPY_PARTS)[number];

/**
 * Parts another part cannot be copied without: a recurring rule needs the
 * accounts and categories it posts to, a budget its category lines.
 */
export const LEDGER_COPY_NEEDS: Readonly<
  Partial<Record<LedgerCopyPart, readonly LedgerCopyPart[]>>
> = {
  recurring: ['accounts', 'categories'],
  budgets: ['categories'],
};

/** `parts` with everything they need (`LEDGER_COPY_NEEDS`) added. */
export function withCopyNeeds(parts: Iterable<LedgerCopyPart>): Set<LedgerCopyPart> {
  const all = new Set(parts);
  for (const part of [...all]) {
    for (const need of LEDGER_COPY_NEEDS[part] ?? []) all.add(need);
  }
  return all;
}

/** The part an account of this type is copied with. */
export function copyPartOfAccountType(type: unknown): LedgerCopyPart | null {
  if (type === 'debit' || type === 'credit') return 'accounts';
  if (type === 'goal') return 'goals';
  if (type === 'loan') return 'loans';
  return null;
}

/** Below this, a loan is settled: it is not worth copying. */
const SETTLED_LOAN = 0.005;

/**
 * The run date a copied recurring rule starts from: the source's, moved past
 * `nowIso` so the new ledger does not replay runs the source already made.
 * Null when the rule has nothing left to run (a one-off in the past, or a
 * rule past its end), so it is not copied.
 */
export function copiedRuleNextRun(
  rule: {
    nextRunDate: string;
    recurrencePattern: RecurrencePattern;
    recurrenceInterval: number;
    anchorDay?: number | null;
    endDate: string | null;
  },
  nowIso: string,
): string | null {
  let cursor: string | null = rule.nextRunDate;
  for (let guard = 0; cursor && cursor <= nowIso && guard < 5000; guard += 1) {
    cursor = nextRunAfter(cursor, rule.recurrencePattern, rule.recurrenceInterval, rule.anchorDay);
  }
  if (!cursor || cursor <= nowIso || isAfterRecurringEndDate(cursor, rule.endDate)) return null;
  return cursor;
}

/** Whether an account of the source is copied with `parts`, before its references are checked. */
export function isCopiedAccount(
  account: {
    id: string;
    type: unknown;
    archivedAt?: unknown;
    goalArchivedAt?: unknown;
    loanArchivedAt?: unknown;
  },
  parts: ReadonlySet<LedgerCopyPart>,
  loanBalances: ReadonlyMap<string, number>,
): boolean {
  const part = copyPartOfAccountType(account.type);
  if (!part || !parts.has(part)) return false;
  // An archived everyday account is history, like an archived goal or loan.
  if (account.archivedAt != null) return false;
  if (part === 'goals') return account.goalArchivedAt == null;
  if (part === 'loans') {
    return account.loanArchivedAt == null && (loanBalances.get(account.id) ?? 0) > SETTLED_LOAN;
  }
  return true;
}

export interface LedgerPartsCopy {
  parts: ReadonlySet<LedgerCopyPart>;
  /**
   * Everyday accounts and budget templates in the source's main currency
   * (`from`) take the new ledger's (`to`).
   */
  currency: { from: string; to: string };
  /** What each of the source's loans still owes: a copied loan starts there. */
  loanBalances: ReadonlyMap<string, number>;
  /** Now, as an ISO instant: copied rows are created now, overdue rules move past it. */
  nowIso: string;
  /** Today's day key: a copied loan's balance is as of today, anchored on its last rest. */
  today: string;
}

/**
 * The tables a copy of `parts` writes, without any history: no entries, so
 * accounts and goals start at zero, a loan at what it still owes (a loan at
 * zero would read as paid off), and albums empty. Parents come before
 * children, as in `LEDGER_COPY_TABLES`. Archived accounts, goals and loans, settled
 * loans, instalment plans and rules with nothing left to run stay behind; a recurring rule
 * comes along only when every account and category it names does. Parts
 * another needs are added (`withCopyNeeds`).
 */
export function ledgerPartsCopySpecs(copy: LedgerPartsCopy): TableSpec[] {
  // A rule without its accounts, or a budget without its categories, is not
  // worth copying: the parts they need always come along.
  const parts = withCopyNeeds(copy.parts);
  const base = (table: string): TableSpec => {
    const spec = LEDGER_COPY_TABLES.find((candidate) => candidate.table === table);
    if (!spec) throw new Error(`ledgerCopy: no spec for ${table}`);
    return spec;
  };
  // Rows made now: they are not the source's history.
  const fresh =
    (adjust?: (copied: Row, source: Row) => void) =>
    (copied: Row, source: Row): void => {
      copied.created_at = copy.nowIso;
      adjust?.(copied, source);
    };
  const specs: TableSpec[] = [];
  if (parts.has('accounts')) specs.push({ ...base('account_groups'), adjust: fresh() });
  if (parts.has('categories')) specs.push({ ...base('categories'), adjust: fresh() });
  if (parts.has('accounts') || parts.has('goals') || parts.has('loans')) {
    specs.push({
      ...base('accounts'),
      keep: (row) =>
        isCopiedAccount(
          {
            id: String(row.id),
            type: row.type,
            archivedAt: row.archived_at,
            goalArchivedAt: row.goal_archived_at,
            loanArchivedAt: row.loan_archived_at,
          },
          parts,
          copy.loanBalances,
        ),
      adjust: fresh((account, source) => {
        if (account.type === 'loan') {
          // What is still owed today, anchored on the source's last monthly
          // rest, so interest keeps its day of the month and none is skipped.
          account.starting_balance = copy.loanBalances.get(String(source.id)) ?? 0;
          account.loan_ledger_anchor_date = lastLoanRestOnOrBefore(
            loanLedgerAnchor(
              {
                loanLedgerAnchorDate: textOrNull(source.loan_ledger_anchor_date),
                createdAt: textOrNull(source.created_at),
                loanStartDate: textOrNull(source.loan_start_date),
              },
              copy.today,
            ),
            copy.today,
          );
          account.loan_paid_off_at = null;
          return;
        }
        account.starting_balance = 0;
        if (account.type === 'goal') {
          account.goal_achieved_at = null;
        } else if (account.currency === copy.currency.from) {
          account.currency = copy.currency.to;
        }
      }),
    });
  }
  if (parts.has('recurring')) {
    specs.push({
      ...base('recurring_rules'),
      allRefs: true,
      // A fee filed under a category left behind is still charged, unfiled.
      optionalRefs: ['fee_category_id'],
      // An instalment plan is one purchase being paid off, and its payments
      // stay behind with the rest of the history: it is not copied.
      keep: (row) =>
        row.instalment_count == null && copiedRuleNextRun(ruleOf(row), copy.nowIso) !== null,
      adjust: fresh((rule) => {
        rule.next_run_date = copiedRuleNextRun(ruleOf(rule), copy.nowIso);
      }),
    });
  }
  if (parts.has('budgets')) {
    specs.push({
      ...base('budget_templates'),
      // A template in the source's main currency (null) takes the new
      // ledger's, like an everyday account; one in another currency keeps it,
      // and reads as the main currency again when that is the new ledger's.
      adjust: fresh((template) => {
        if (template.currency === copy.currency.to) template.currency = null;
      }),
    });
    specs.push({ ...base('budget_template_categories'), adjust: fresh() });
  }
  if (parts.has('items')) specs.push({ ...base('items'), adjust: fresh() });
  if (parts.has('albums')) {
    // Without their entries, and not collecting new ones until picked again.
    specs.push({ ...base('albums'), adjust: fresh((album) => (album.is_active = 0)) });
  }
  return specs;
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function ruleOf(row: Row) {
  return {
    nextRunDate: String(row.next_run_date),
    recurrencePattern: row.recurrence_pattern as RecurrencePattern,
    recurrenceInterval: Number(row.recurrence_interval) || 1,
    anchorDay: typeof row.anchor_day === 'number' ? row.anchor_day : null,
    endDate: textOrNull(row.end_date),
  };
}
