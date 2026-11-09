import assert from "node:assert/strict";
import { test } from "node:test";
import { isMonthlyBudget, monthlyBudgetRows } from "./budget-period.ts";

test("rows without a period are monthly", () => {
  assert.equal(isMonthlyBudget({}), true);
  assert.equal(isMonthlyBudget({ period: null }), true);
  assert.equal(isMonthlyBudget({ period: "month" }), true);
});

test("weekly and yearly rows are dropped", () => {
  assert.equal(isMonthlyBudget({ period: "week" }), false);
  assert.equal(isMonthlyBudget({ period: "year" }), false);
  const rows = [
    { id: "a", month: "2026-10" },
    { id: "b", month: "2026-10-05", period: "week" },
    { id: "c", month: "2026", period: "year" },
    { id: "d", month: "2026-11", period: "month" },
  ];
  assert.deepEqual(
    monthlyBudgetRows(rows).map((row) => row.id),
    ["a", "d"],
  );
});
