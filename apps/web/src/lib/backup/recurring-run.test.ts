import assert from "node:assert/strict";
import { test } from "node:test";
import { highlightsRecurringRuns, isRecurringRun, planRuleIdsOf, recurringRunRuleId } from "./recurring-run.ts";

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
