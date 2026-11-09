import assert from "node:assert/strict";
import { test } from "node:test";
import { maxRecurrenceInterval, recurrenceFrequencyOf, storedRecurrenceOf } from "./recurrence.ts";

test("quarterly and semi-annual choices save phone-compatible monthly intervals", () => {
  assert.deepEqual(storedRecurrenceOf("quarterly", 1), { pattern: "monthly", interval: 3 });
  assert.deepEqual(storedRecurrenceOf("semiannually", 1), { pattern: "monthly", interval: 6 });
  assert.deepEqual(storedRecurrenceOf("quarterly", 2), { pattern: "monthly", interval: 6 });
  assert.deepEqual(storedRecurrenceOf("semiannually", 3), { pattern: "monthly", interval: 18 });
});

test("opening and saving existing schedules keeps their stored pattern and interval", () => {
  for (const pattern of ["daily", "weekly", "monthly", "yearly"] as const) {
    for (const interval of [1, 2, 3, 6, 9, 12, 999]) {
      const choice = recurrenceFrequencyOf(pattern, interval);
      assert.deepEqual(storedRecurrenceOf(choice.frequency, choice.interval), { pattern, interval });
    }
  }
  assert.deepEqual(recurrenceFrequencyOf("monthly", 3), { frequency: "quarterly", interval: 1 });
  assert.deepEqual(recurrenceFrequencyOf("monthly", 6), { frequency: "semiannually", interval: 1 });
  assert.deepEqual(recurrenceFrequencyOf("monthly", 9), { frequency: "monthly", interval: 9 });
});

test("scaled intervals stay inside the phone's 999 interval edit limit", () => {
  for (const frequency of ["daily", "weekly", "monthly", "quarterly", "semiannually", "yearly"] as const) {
    const max = maxRecurrenceInterval(frequency);
    assert.ok(storedRecurrenceOf(frequency, max).interval <= 999);
    assert.ok(storedRecurrenceOf(frequency, max + 1).interval > 999);
  }
});
