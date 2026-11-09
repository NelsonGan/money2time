import assert from "node:assert/strict";
import { test } from "node:test";
import { budgetRate, budgetSpendValue, formatFxRate, latestBudgetRate, storedBudgetCurrency, storedBudgetRate } from "./budget-currency.ts";

// A MYR ledger where 1 JPY is 0.03 MYR at the latest rate.
const latest = (code: string) => (code === "JPY" ? 0.03 : null);

test("a main-currency budget has rate 1 and reads the main-currency amount", () => {
  assert.equal(budgetRate({ currency: null, fxRate: null }, "MYR", latest), 1);
  assert.equal(budgetRate({ currency: "MYR", fxRate: null }, "MYR", latest), 1);
  assert.equal(budgetSpendValue({ amount: 99, original: 3300, currency: "JPY" }, null, 1), 99);
});

test("the frozen rate wins over the latest, which is the fallback", () => {
  assert.equal(budgetRate({ currency: "JPY", fxRate: 0.025 }, "MYR", latest), 0.025);
  assert.equal(budgetRate({ currency: "JPY", fxRate: null }, "MYR", latest), 0.03);
  assert.equal(budgetRate({ currency: "EUR", fxRate: null }, "MYR", latest), null);
});

test("own-currency spending counts at face value, the rest through the rate", () => {
  assert.equal(budgetSpendValue({ amount: 99, original: 3300, currency: "JPY" }, "JPY", 0.025), 3300);
  assert.equal(budgetSpendValue({ amount: 30, original: 30, currency: "MYR" }, "JPY", 0.025), 1200);
  assert.equal(budgetSpendValue({ amount: 30, original: 30, currency: "MYR" }, "JPY", null), null);
});

test("stored values are read back safely", () => {
  assert.equal(storedBudgetCurrency("JPY", "MYR"), "JPY");
  assert.equal(storedBudgetCurrency("MYR", "MYR"), null);
  assert.equal(storedBudgetCurrency(null, "MYR"), null);
  assert.equal(storedBudgetCurrency("yen", "MYR"), null);
  assert.equal(storedBudgetRate(0.025), 0.025);
  assert.equal(storedBudgetRate(0), null);
  assert.equal(storedBudgetRate("0.03"), null);
});

test("a backup without a rates table has no latest rate, not 1:1", () => {
  const toBase = (amount: number) => amount;
  assert.equal(latestBudgetRate({ raw: {}, toBase })("JPY"), null);
  assert.equal(latestBudgetRate({ raw: { exchange_rates: [] }, toBase: () => null })("JPY"), null);
  assert.equal(latestBudgetRate({ raw: { exchange_rates: [] }, toBase: (a) => a * 0.03 })("JPY"), 0.03);
});

test("rates read in the locale's digits with the app's precision", () => {
  assert.equal(formatFxRate(0.025626, "en"), "0.02563");
  assert.equal(formatFxRate(0.025626, "de"), "0,02563");
  assert.equal(formatFxRate(3.4, "en"), "3.4000");
  assert.equal(formatFxRate(1234.5, "en"), "1,234.50");
});
