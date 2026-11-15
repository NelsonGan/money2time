import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { albumCategoryForText, albumCategoryOf, compileKeywords, type KeywordTable } from "./categories.ts";
import { parseGroup } from "./group.ts";
import { billRow } from "./writes.ts";

// A shared album's categories on the website, as the app has them: the same
// key for everyone, tagged from a bill's title by the app's keywords.

const table = (name: string) => JSON.parse(readFileSync(new URL(`./keywords/${name}.json`, import.meta.url), "utf8")) as KeywordTable;
const english = compileKeywords([table("core")]);

test("a bill's category is its key, else its icon, then its English name, else Other", () => {
  assert.equal(albumCategoryOf({ category_key: "bills", category_icon: "meal" }), "bills");
  // An older app writes its own category's name and icon.
  assert.equal(albumCategoryOf({ category_name: "Makan", category_icon: "meal" }), "food");
  assert.equal(albumCategoryOf({ category_name: "housing", category_icon: null }), "housing");
  assert.equal(albumCategoryOf({ category_name: "Coffee", category_icon: "coffee" }), "other");
  assert.equal(albumCategoryOf({ category_key: "pets" }), "other");
  assert.equal(albumCategoryOf({}), "other");
});

test("a bill is written with its key and that category's English name and icon", () => {
  const { row } = billRow({ id: "b1", date: "2026-11-14", note: "Taxi", currency: "MYR", category: "transport", paidBy: "me", shares: [{ memberId: "me", amount: 5 }] });
  assert.deepEqual([row.category_key, row.category_name, row.category_icon], ["transport", "Transport", "car"]);
});

test("a title picks the category as the app's Quick Entry does", () => {
  assert.equal(albumCategoryForText("Lunch", english), "food");
  assert.equal(albumCategoryForText("lunch with Tess", english), "food");
  assert.equal(albumCategoryForText("Grab to the airport", english), "transport");
  assert.equal(albumCategoryForText("午餐", english), "food");
  // A keyword of another kind (a movie): Other.
  assert.equal(albumCategoryForText("Cinema", english), "other");
  // No keyword: keep what is picked.
  assert.equal(albumCategoryForText("Zxqv", english), null);
  assert.equal(albumCategoryForText("  ", english), null);
  // A whole word only: "taxing" is not a taxi.
  assert.equal(albumCategoryForText("Taxing", english), null);
});

test("each language adds its own keywords to the English ones", () => {
  const malay = compileKeywords([table("core"), table("ms")]);
  assert.equal(albumCategoryForText("Nasi ayam hainan", malay), "food");
  assert.equal(albumCategoryForText("Lunch", malay), "food");
});

test("the group's bills are read with their album category", () => {
  const T = "2026-11-14T10:00:00.000Z";
  const member = (id: string, userId: string) => ({ table: "album_members", id, data: { id, ledger_id: "bali", name: id, user_id: userId, sort_order: 0, created_at: T, updated_at: T, deleted_at: null } });
  const expense = (id: string, extra: Record<string, unknown>) => ({
    table: "album_expenses",
    id,
    data: { id, ledger_id: "bali", date: "2026-11-14", note: id, amount: 10, currency: "MYR", paid_by: "me", shares_json: JSON.stringify([{ memberId: "me", amount: 10 }]), created_by: "me", created_at: T, updated_at: T, deleted_at: null, ...extra },
  });
  const group = parseGroup({
    album: { id: "share1", ledgerId: "bali", name: "Bali", role: "member", ownerId: "owner", ownerName: "Nelson", memberCount: 1, kind: "album" },
    userId: "u-me",
    rows: [member("me", "u-me"), expense("a", { category_key: "shopping" }), expense("b", { category_name: "Groceries", category_icon: "grocery-basket" })],
  });
  assert.deepEqual(
    group?.bills.map((bill) => [bill.id, bill.category]),
    [
      ["a", "shopping"],
      ["b", "groceries"],
    ],
  );
});
