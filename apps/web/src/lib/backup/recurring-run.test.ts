import assert from "node:assert/strict";
import { test } from "node:test";
import { highlightsRecurringRuns, isRecurringRun, planRuleIdsOf, recurringRuleFee, recurringRunRuleId } from "./recurring-run.ts";

test("a rule's run is read from its id; typed-in entries and plan payments are not", () => {
  assert.equal(isRecurringRun({ id: "rr:rule-1:2026-11-01" }), true);
  assert.equal(isRecurringRun({ id: "rr:rule-1:2026-11-01", instalment_rule_id: null }), true);
  assert.equal(isRecurringRun({ id: "5f0c2c1e-8f1a-4c55-9d1e-1b2f0a7c9e11" }), false);
  assert.equal(isRecurringRun({ id: "rr:plan-1:2026-11-01", instalment_rule_id: "plan-1" }), false);
  assert.equal(isRecurringRun({ id: "abc-rr:1" }), false);
});

test("the tint is off unless the phone turned it on", () => {
  assert.equal(highlightsRecurringRuns({}), false);
  assert.equal(highlightsRecurringRuns({ highlight_recurring_transactions: null }), false);
  assert.equal(highlightsRecurringRuns({ highlight_recurring_transactions: 0 }), false);
  assert.equal(highlightsRecurringRuns({ highlight_recurring_transactions: 1 }), true);
});

test("a plan's payment an older app wrote without the plan's id stays plain", () => {
  const plans = planRuleIdsOf([{ id: "plan-1", instalment_count: 12 }, { id: "rule-1", instalment_count: null }, { id: "rule-2" }]);
  assert.deepEqual([...plans], ["plan-1"]);
  assert.equal(isRecurringRun({ id: "rr:plan-1:2026-11-01" }, plans), false);
  assert.equal(isRecurringRun({ id: "rr:rule-1:2026-11-01" }, plans), true);
  assert.deepEqual([...planRuleIdsOf(undefined)], []);
});

test("the rule is read from a run id", () => {
  assert.equal(recurringRunRuleId("rr:rule-1:2026-11-01"), "rule-1");
  assert.equal(recurringRunRuleId("rr:plan-1:payoff"), "plan-1");
  assert.equal(recurringRunRuleId("rr::x"), null);
  assert.equal(recurringRunRuleId("abc"), null);
});

test("a transfer rule's fee is read as the app reads it; any other rule, or none, has no fee", () => {
  const types: Record<string, string> = { card: "credit", wallet: "debit", car: "loan" };
  const typeOf = (id: string) => types[id];
  const topUp = { type: "transfer", from_account_id: "card", to_account_id: "wallet", fee_amount: 2, fee_currency: "MYR" };
  assert.deepEqual(recurringRuleFee(topUp, typeOf), { amount: 2, currency: "MYR" });
  assert.deepEqual(recurringRuleFee({ ...topUp, fee_side: "to" }, typeOf), { amount: 2, currency: "MYR" });
  assert.equal(recurringRuleFee({ type: "transfer" }, typeOf), null);
  assert.equal(recurringRuleFee({ ...topUp, fee_amount: 0 }, typeOf), null);
  assert.equal(recurringRuleFee({ ...topUp, fee_currency: null }, typeOf), null);
  assert.equal(recurringRuleFee({ ...topUp, type: "expense" }, typeOf), null);
  // The phone's runner writes no fee on a loan or on an account that is gone.
  assert.equal(recurringRuleFee({ ...topUp, to_account_id: "car", fee_side: "to" }, typeOf), null);
  assert.equal(recurringRuleFee({ ...topUp, from_account_id: "closed" }, typeOf), null);
});
