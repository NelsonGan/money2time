/**
 * Changes the dashboard asks the phone to make. The phone checks every batch
 * against its own data and saves it the way the app's own editors would; the
 * rules live there (the app's services/webDashboardEdits.ts), and these shapes
 * must match it. Nothing here changes data by itself.
 */

type EditRow = { id: string; at: string | null };
export type Sentiment = "happy" | "neutral" | "sad";
export type TxType = "expense" | "income" | "transfer" | "balance_adjustment";

/** A transaction as the editor describes it; on update, only the fields being changed. */
export type TxFields = {
  type?: TxType;
  amount?: number;
  currency?: string;
  toAmount?: number | null;
  /** A day, `YYYY-MM-DD`. */
  date?: string;
  accountId?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  note?: string;
  details?: string;
  sentiment?: Sentiment;
  reimbursable?: boolean;
  countsAsExpense?: boolean;
};

export type AccountFields = {
  name?: string;
  type?: "debit" | "credit";
  /** The group's name, or null for ungrouped. */
  group?: string | null;
  logoId?: string | null;
  /** A built-in design, `<genre>/<name>`, or null for the plain card. An uploaded (`custom:`) one only as the account already has it. */
  cardDesign?: string | null;
  currency?: string;
  /** New account: its starting balance. Existing one: the balance it should show now. */
  balance?: number;
  /** How a changed balance is recorded, as the app asks. */
  balanceRecord?: "difference" | "flow";
  includeInTotals?: boolean;
  creditStatementDay?: number | null;
  creditDueDay?: number | null;
  /**
   * Days after each statement the bill is due (1–45), or null for the fixed
   * `creditDueDay`. Only for a phone that names `credit-due-days-after`.
   */
  creditDueDaysAfterStatement?: number | null;
};

export type CategoryFields = {
  name?: string;
  type?: "expense" | "income";
  parentId?: string | null;
  icon?: string;
};

export type RuleFields = {
  name?: string;
  type?: "expense" | "income" | "transfer";
  amount?: number;
  /** An expense or income rule's currency; the phone keeps the rule's own when absent. */
  currency?: string;
  accountId?: string | null;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  categoryId?: string | null;
  note?: string;
  logoId?: string | null;
  pattern?: "daily" | "weekly" | "monthly" | "yearly";
  interval?: number;
  nextRunDate?: string;
  endDate?: string | null;
  isActive?: boolean;
};

export type EditOp =
  | { entity: "transaction"; op: "create"; tx: TxFields }
  | { entity: "transaction"; op: "update"; rows: EditRow[]; set: TxFields }
  | { entity: "transaction"; op: "delete"; rows: EditRow[] }
  | { entity: "account"; op: "create"; account: AccountFields }
  | { entity: "account"; op: "update"; id: string; at: string | null; set: AccountFields }
  | { entity: "account"; op: "delete"; id: string; at: string | null }
  | { entity: "group"; op: "create"; name: string }
  | { entity: "group"; op: "update"; id: string; name: string; at: string | null }
  | { entity: "group"; op: "delete"; id: string; at: string | null }
  | { entity: "category"; op: "create"; category: CategoryFields }
  | { entity: "category"; op: "update"; id: string; at: string | null; set: CategoryFields }
  | { entity: "category"; op: "delete"; id: string; at: string | null; reassignTo?: string | null }
  | { entity: "recurring"; op: "create"; rule: RuleFields }
  | { entity: "recurring"; op: "update"; id: string; at: string | null; set: RuleFields }
  | { entity: "recurring"; op: "delete"; id: string; at: string | null }
  | ModuleOp;

/**
 * An op for an entity a module plans on the phone (goals, budgets, items, …):
 * the app's services/webDashboardEditModules/<name>.ts reads it. Each module's
 * web editor builds these in its own file.
 */
type ModuleOp = { entity: `module:${string}`; op: string; [key: string]: unknown };

/**
 * Why a change was not saved. From the phone: `stale`, `conflict`,
 * `amount_locked`, `pro_required`, `off`, `invalid`, `failed`, `busy` (four
 * edits are already waiting on it) and `unknown` (saving failed partway).
 * Here too: `busy` (one change at a time from this browser), `away` (no phone
 * to send it to), `too_large` (more than one message carries), and `unknown`
 * (the phone went away after it was sent, so it may or may not have been
 * saved).
 */
export type EditError =
  | "stale"
  | "conflict"
  | "amount_locked"
  | "pro_required"
  | "off"
  | "invalid"
  | "failed"
  | "busy"
  | "away"
  | "too_large"
  | "unknown";

export const PHONE_ERRORS: EditError[] = ["stale", "conflict", "amount_locked", "pro_required", "off", "invalid", "failed", "busy", "unknown"];

/** The free-plan limit a `pro_required` refusal names. */
export type ProFeature =
  | "accounts"
  | "categories"
  | "recurring"
  | "reimbursements"
  | "goals"
  | "loans"
  | "items"
  | "albums"
  | "budget_templates"
  | "split_bills"
  | "subcurrencies"
  | "wage_entries";

export type EditResult =
  | { ok: true; count: number; version: number | null }
  | { ok: false; error: EditError; feature?: ProFeature };

/** Rows one batch may touch, as the phone allows. */
export const MAX_EDIT_ROWS = 500;

/** Ops one batch may carry, as the phone allows (its MAX_OPS). */
export const MAX_EDIT_OPS = 50;

const length = (value: unknown) => (Array.isArray(value) ? value.length : 0);

/**
 * The rows a module op touches, as the phone's module counts them (each
 * module's `size` in the app's services/webDashboardEditModules/): a new
 * album and the entries in it, an album's entries added and removed, each
 * line of a budget, each row of a split bill, each share of a shared album's
 * bill, and each row a reorder moves.
 */
function moduleSize(op: ModuleOp): number {
  const record = (key: string) => (op[key] && typeof op[key] === "object" ? (op[key] as Record<string, unknown>) : {});
  switch (op.entity) {
    case "module:album":
      if (op.op === "create") return 1 + length(record("album").transactionIds);
      if (op.op === "reorder") return length(op.ids);
      return op.op === "transactions" ? length(op.add) + length(op.remove) : 1;
    case "module:budget":
      return 1 + length(record("template").allocations ?? record("budget").lines);
    case "module:currency":
      return op.op === "reorder" ? length(op.codes) : 1;
    case "module:item":
      return op.op === "reorder" ? length(op.ids) : 1;
    case "module:reorder":
      return length(op.ids);
    case "module:split":
      return op.op === "create" || op.op === "update" ? 1 + length(op.splits) : 1;
    case "module:albumbill":
      if (op.op === "update") return 1 + length(record("set").shares);
      return op.op === "restore" ? 1 : length(op.rows);
    default:
      return 1;
  }
}

/** Entries a batch touches, for analytics, counted as the phone counts them against MAX_EDIT_ROWS. */
export function editCount(ops: EditOp[]): number {
  return ops.reduce((sum, op) => {
    if (op.entity === "transaction") return sum + (op.op === "create" ? 1 : op.rows.length);
    return sum + (op.entity.startsWith("module:") ? moduleSize(op as ModuleOp) : 1);
  }, 0);
}
