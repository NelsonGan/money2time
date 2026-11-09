/** The rule a run's id names (`rr:<ruleId>:…`), or null for any other id. As the app's `recurringRunRuleId`. */
export function recurringRunRuleId(id: string): string | null {
  if (!id.startsWith("rr:")) return null;
  const end = id.indexOf(":", 3);
  return end > 3 ? id.slice(3, end) : null;
}

/**
 * Whether a transaction was made by an ordinary recurring rule, read from its
 * id, as the app's `isRecurringRunTransaction` (utils/recurringRules.ts) does:
 * every run a rule makes is named `rr:<ruleId>:…` (`recurringRunTransactionId`).
 * An instalment plan's payments are runs too but belong to the plan, so they
 * stay plain: a payment names its plan in `instalment_rule_id`, and
 * `planRuleIds` catches one an older app wrote without it. Runs from app
 * versions before run ids had random ids and read as typed in.
 */
export function isRecurringRun(
  row: { id: string; instalment_rule_id?: string | null },
  planRuleIds?: ReadonlySet<string>,
): boolean {
  if (row.instalment_rule_id) return false;
  const ruleId = recurringRunRuleId(row.id);
  return ruleId !== null && !planRuleIds?.has(ruleId);
}

/** The ids of every instalment plan (a recurring rule with `instalment_count`), deleted ones included. */
export function planRuleIdsOf(rules: readonly { id: string; instalment_count?: number | null }[] | undefined): Set<string> {
  return new Set((rules ?? []).filter((rule) => (rule.instalment_count ?? 0) > 0).map((rule) => rule.id));
}

/**
 * Whether the lists tint those entries: the app's
 * `settings.highlightRecurringTransactions` (its migration 086), off by
 * default, so data from an app without the setting reads as off.
 */
export function highlightsRecurringRuns(settings: { highlight_recurring_transactions?: number | null }): boolean {
  return settings.highlight_recurring_transactions === 1;
}
