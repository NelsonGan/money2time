import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { albumCategoryForOwn, albumCategoryForText, albumCategoryList, albumCategoryOf, categoryRowId, compileKeywords, DEFAULT_ALBUM_CATEGORY_LIST, type KeywordTable } from "./categories.ts";
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
  const { row } = billRow({ id: "b1", date: "2026-11-14", note: "Taxi", currency: "MYR", category: "transport", paidBy: "me", shares: [{ memberId: "me", amount: 5 }] }, null);
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

test("an album's list is the defaults as it changed them, with the ones it added, in order", () => {
  assert.deepEqual(
    DEFAULT_ALBUM_CATEGORY_LIST.map((category) => category.key),
    ["food", "groceries", "transport", "housing", "bills", "healthcare", "shopping", "other"],
  );
  const list = albumCategoryList([
    { key: "food", name: "  Meals  ", icon: "emoji:🍜", sort_order: 5 },
    { key: "housing", deleted_at: "2026-11-19T00:00:00.000Z" },
    // Other is never removed.
    { key: "other", name: "Misc", deleted_at: "2026-11-19T00:00:00.000Z", sort_order: 9 },
    { key: "c-tickets1", name: "Tickets", icon: "custom:category-icons/x.png", sort_order: 1 },
    // An added one needs a name; a bad key is not a category.
    { key: "c-noname01", name: "  " },
    { key: "pets", name: "Pets" },
  ]);
  assert.deepEqual(
    list.map((category) => [category.key, category.name, category.icon]),
    // By place, a tie by key (as the app sorts); an uploaded icon is dropped.
    [
      ["c-tickets1", "Tickets", null],
      ["groceries", null, null],
      ["transport", null, null],
      ["bills", null, null],
      ["food", "Meals", "emoji:🍜"],
      ["healthcare", null, null],
      ["shopping", null, null],
      ["other", "Misc", null],
    ],
  );
  assert.equal(categoryRowId("bali-trip-2026-xyz", "food"), "ac-balitrip2026-food");
});

test("a title picks only a default the album has as it is", () => {
  const renamed = albumCategoryList([{ key: "food", name: "Meals" }]);
  assert.equal(albumCategoryForText("Lunch", english, renamed), null);
  const removed = albumCategoryList([{ key: "transport", deleted_at: "x" }]);
  assert.equal(albumCategoryForText("Grab to the airport", english, removed), null);
  assert.equal(albumCategoryForText("Lunch", english, removed), "food");
  assert.equal(albumCategoryForText("Cinema", english, renamed), "other");
});

test("a bill of an added category is written with its key, name and icon", () => {
  const list = albumCategoryList([{ key: "c-tickets1", name: "Tickets", icon: "emoji:🎟️", sort_order: 1 }]);
  const { row } = billRow({ id: "b1", date: "2026-11-14", note: "Museum", currency: "MYR", category: "c-tickets1", paidBy: "me", shares: [{ memberId: "me", amount: 5 }] }, null, list);
  assert.deepEqual([row.category_key, row.category_name, row.category_icon], ["c-tickets1", "Tickets", "emoji:🎟️"]);
  // A renamed default is still written as the default, which older apps match.
  const renamed = billRow({ id: "b2", date: "2026-11-14", note: "Lunch", currency: "MYR", category: "food", paidBy: "me", shares: [{ memberId: "me", amount: 5 }] }, null, albumCategoryList([{ key: "food", name: "Meals" }])).row;
  assert.deepEqual([renamed.category_key, renamed.category_name, renamed.category_icon], ["food", "Food", "meal"]);
});

test("an entry of the user's own reads as the album category of its name, then its icon", () => {
  const list = albumCategoryList([
    { key: "food", name: "Meals", icon: null },
    { key: "c-tickets1", name: "Tickets", icon: "emoji:🎟️", sort_order: 1 },
  ]);
  assert.equal(albumCategoryForOwn({ name: "tickets", icon: "ticket" }, list), "c-tickets1");
  // Renamed Food keeps its icon: the user's Food is matched by it.
  assert.equal(albumCategoryForOwn({ name: "Food", icon: "meal" }, list), "food");
  assert.equal(albumCategoryForOwn({ name: "Transport", icon: "car" }, list), "transport");
  assert.equal(albumCategoryForOwn({ name: "Coffee", icon: "coffee" }, list), "other");
  assert.equal(albumCategoryForOwn({ name: "Transport", icon: "car" }, albumCategoryList([{ key: "transport", deleted_at: "x" }])), "other");
});

test("the group reads its categories, and a bill of one it no longer has as Other", () => {
  const T = "2026-11-14T10:00:00.000Z";
  const member = { table: "album_members", id: "me", data: { id: "me", ledger_id: "bali", name: "me", user_id: "u-me", sort_order: 0, created_at: T, updated_at: T, deleted_at: null } };
  const expense = (id: string, key: string) => ({
    table: "album_expenses",
    id,
    data: { id, ledger_id: "bali", date: "2026-11-14", note: id, amount: 10, currency: "MYR", category_key: key, paid_by: "me", shares_json: JSON.stringify([{ memberId: "me", amount: 10 }]), created_by: "me", created_at: T, updated_at: T, deleted_at: null },
  });
  const category = (key: string, extra: Record<string, unknown>, id = categoryRowId("bali", key)) => ({ table: "album_categories", id, data: { id, ledger_id: "bali", key, sort_order: 0, created_at: T, updated_at: T, deleted_at: null, ...extra } });
  const group = parseGroup({
    album: { id: "share1", ledgerId: "bali", name: "Bali", role: "member", ownerId: "owner", ownerName: "Nelson", memberCount: 1, kind: "album" },
    userId: "u-me",
    rows: [
      member,
      category("c-tickets1", { name: "Tickets", icon: "emoji:🎟️", sort_order: 1 }),
      category("transport", { deleted_at: T }),
      // Under another id than its album and key make: not counted.
      category("c-sneaky01", { name: "Sneaky" }, "ac-bali-other"),
      expense("a", "c-tickets1"),
      expense("b", "transport"),
      expense("c", "c-sneaky01"),
    ],
  });
  assert.ok(group);
  assert.ok(group.categories.some((entry) => entry.key === "c-tickets1"));
  assert.ok(!group.categories.some((entry) => entry.key === "transport" || entry.key === "c-sneaky01"));
  assert.deepEqual(
    group.bills.map((bill) => [bill.id, bill.category]),
    [
      ["a", "c-tickets1"],
      ["b", "other"],
      ["c", "other"],
    ],
  );
});
