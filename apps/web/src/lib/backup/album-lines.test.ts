import assert from "node:assert/strict";
import { test } from "node:test";

import { albumIdOfLine, albumLineId, albumOfEntries, lineOf } from "./album-lines.ts";
import { budgetSummary } from "./budget-summary.ts";
import type { BudgetMonth, Category, Trip, Tx } from "./model";

// Albums as their own line in the category lists on the Web Dashboard, as in
// the app (README: Key patterns > Albums).

test("an entry is in one album: an older app's second link gives way to the lower id", () => {
  const byEntry = albumOfEntries([
    { id: "b", album_id: "bali", transaction_id: "t1" },
    { id: "a", album_id: "tokyo", transaction_id: "t1" },
    { id: "c", album_id: "bali", transaction_id: "t2" },
  ]);
  assert.deepEqual([...byEntry], [
    ["t1", "tokyo"],
    ["t2", "bali"],
  ]);
});

test("spending in an album counts under the album's line; income and the rest under their category", () => {
  assert.equal(lineOf({ spending: true, albumId: "bali", parentId: "food" }), "album:bali");
  assert.equal(lineOf({ spending: false, albumId: "bali", parentId: "salary" }), "salary");
  assert.equal(lineOf({ spending: true, parentId: "food" }), "food");
  assert.equal(lineOf({ spending: true, parentId: null }), "__none");
  assert.equal(albumIdOfLine(albumLineId("bali")), "bali");
  assert.equal(albumIdOfLine("food"), null);
});

const category = (id: string, parentId: string | null = null): Category => ({ id, name: id, type: "expense", parentId, icon: null, sortOrder: 0, color: "#000", children: [], updatedAt: null });
const tx = (id: string, amount: number, categoryId: string, albumId?: string) =>
  ({ id, type: "expense", amount, originalAmount: amount, currency: "MYR", categoryId, parentId: categoryId, spending: true, month: "2026-07", ...(albumId ? { albumId } : null) }) as unknown as Tx;
const trip = { id: "bali", name: "Bali", coverUri: null, place: null, countryCode: null, start: null, end: null, active: false, txIds: ["b", "c"], color: "#3A4FA0" } as Trip;
const model = {
  categories: new Map([["food", category("food")], ["coffee", category("coffee")], ["transport", category("transport")]]),
  currency: "MYR",
  raw: {},
  toBase: () => null,
  trips: [trip],
} as unknown as Parameters<typeof budgetSummary>[0];
const budget = { id: "b1", month: "2026-07", total: 500, countUnbudgeted: false, lines: [{ categoryId: "food", amount: 100 }], currency: null, fxRate: null } as unknown as BudgetMonth;
const byMonth = new Map([["2026-07", [tx("a", 30, "food"), tx("b", 50, "food", "bali"), tx("c", 40, "coffee", "bali"), tx("d", 25, "transport")]]]);

test("a budget counts album spending toward its total, never a category's line, even with unbudgeted spending off", () => {
  const summary = budgetSummary(model, budget, byMonth);
  assert.equal(summary.lines[0].spent, 30);
  assert.deepEqual(summary.albums.map((album) => [album.trip.id, album.spent]), [["bali", 90]]);
  assert.equal(summary.unbudgeted, 25);
  assert.equal(summary.totalSpent, 120);
  // Counted once, whatever the setting.
  const counted = budgetSummary(model, { ...budget, countUnbudgeted: true }, byMonth);
  assert.equal(counted.totalSpent, 30 + 90 + 25);
});
