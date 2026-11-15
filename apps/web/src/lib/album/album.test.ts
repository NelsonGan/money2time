import assert from "node:assert/strict";
import { test } from "node:test";

import { groupTotals, openShares, pairwiseDebts, simplifyDebts } from "./debts.ts";
import { albumsOf, billPeople, parseGroup, type Bill, type Payment } from "./group.ts";
import { balanceSelf, readValue, splitShares, valuesFor, type SplitInput } from "./split.ts";
import { evenGroupRows, settleRows, undonePaymentRows } from "./writes.ts";

const T = "2026-11-14T10:00:00.000Z";
const album = { id: "share1", ledgerId: "bali", name: "Bali", role: "member", ownerId: "owner", ownerName: "Nelson", memberCount: 2, kind: "album" };
const member = (id: string, name: string, userId: string | null, sort = 0) => ({
  table: "album_members",
  id,
  data: { id, ledger_id: "bali", name, user_id: userId, sort_order: sort, created_at: T, updated_at: T, deleted_at: null },
});
const billData = (id: string, paidBy: string, shares: Record<string, number>, extra: Record<string, unknown> = {}) => ({
  table: "album_expenses",
  id,
  data: {
    id,
    ledger_id: "bali",
    date: "2026-11-14",
    note: id,
    amount: Object.values(shares).reduce((a, b) => a + b, 0),
    currency: "MYR",
    paid_by: paidBy,
    shares_json: JSON.stringify(Object.entries(shares).map(([memberId, amount]) => ({ memberId, amount }))),
    created_by: "owner",
    created_at: T,
    updated_at: T,
    deleted_at: null,
    ...extra,
  },
});

const bill = (id: string, paidBy: string, shares: Record<string, number>, extra: Partial<Bill> = {}): Bill => ({
  id,
  date: "2026-11-14",
  note: id,
  amount: Object.values(shares).reduce((a, b) => a + b, 0),
  currency: "MYR",
  categoryName: null,
  categoryIcon: null,
  paidBy,
  shares: Object.entries(shares).map(([memberId, amount]) => ({ memberId, amount })),
  createdBy: null,
  createdAt: T,
  updatedAt: T,
  deleted: false,
  ...extra,
});
const pay = (id: string, expenseId: string, from: string, to: string, amount: number): Payment => ({
  id,
  expenseId,
  fromMember: from,
  toMember: to,
  amount,
  currency: "MYR",
  date: "2026-11-14",
  createdBy: null,
  createdAt: T,
  deleted: false,
});

test("a group is read as a phone reads it: bad rows and strangers' rows are left out", () => {
  const group = parseGroup({
    album,
    userId: "tess",
    rows: [
      member("m-owner", "Nelson", "owner", 0),
      member("m-tess", "Tess", "tess", 1),
      member("m-gone", "Ben", null, 2),
      member("bad id!", "X", "x"),
      billData("dinner", "m-owner", { "m-owner": 50, "m-tess": 50 }),
      billData("stranger", "m-who", { "m-who": 10 }),
      billData("nope", "m-owner", { "m-owner": -5 }),
      billData("other-album", "m-owner", { "m-owner": 5 }, { ledger_id: "ski" }),
      { table: "album_groups", id: "bali", data: { id: "bali", ledger_id: "bali", simplify_debts: 1, cover_photo_uri: "album-covers/abc.jpg", created_at: T } },
      {
        table: "album_activity",
        id: "a1",
        data: { id: "a1", ledger_id: "bali", kind: "member_joined", actor_member_id: "m-tess", member_id: "m-tess", data_json: "{}", created_at: "2026-11-14T11:00:00.000Z" },
      },
      {
        table: "album_activity",
        id: "a0",
        data: { id: "a0", ledger_id: "bali", kind: "member_joined", member_id: "m-owner", data_json: '{"started":true}', created_at: T },
      },
      { table: "album_activity", id: "a2", data: { id: "a2", kind: "unknown_kind", created_at: T } },
    ],
  });
  assert.ok(group);
  assert.equal(group.selfId, "m-tess");
  assert.deepEqual(
    group.members.map((m) => [m.id, m.userId]),
    [
      ["m-owner", "owner"],
      ["m-tess", "tess"],
      ["m-gone", null],
    ],
  );
  assert.deepEqual(
    group.bills.map((b) => b.id),
    ["dinner"],
  );
  assert.equal(group.simplify, true);
  assert.equal(group.cover, "album-covers/abc.jpg");
  assert.deepEqual(
    group.activity.map((a) => [a.id, a.started ?? null]),
    [
      ["a1", false],
      ["a0", true],
    ],
  );
  // Someone who left is put on no new bill, but stays on the ones they are on.
  assert.deepEqual(
    billPeople(group.members, null).map((m) => m.id),
    ["m-owner", "m-tess"],
  );
  assert.deepEqual(
    billPeople(group.members, bill("x", "m-gone", { "m-gone": 1 })).map((m) => m.id),
    ["m-owner", "m-tess", "m-gone"],
  );
});

test("an answer that is not a group reads as none, and the list keeps only albums", () => {
  assert.equal(parseGroup({ album, rows: [] }), null);
  assert.equal(parseGroup(null), null);
  assert.deepEqual(
    albumsOf({ ledgers: [album, { ...album, id: "l", kind: "ledger" }] }).map((a) => a.id),
    ["share1"],
  );
});

test("debts and totals come out as in the app", () => {
  const bills = [bill("dinner", "a", { a: 30, b: 30, c: 30 }), bill("taxi", "b", { b: 10, c: 10 })];
  const open = openShares(bills, []);
  assert.deepEqual(pairwiseDebts(open), [
    { from: "b", to: "a", currency: "MYR", amount: 30 },
    { from: "c", to: "a", currency: "MYR", amount: 30 },
    { from: "c", to: "b", currency: "MYR", amount: 10 },
  ]);
  const simplified = simplifyDebts(open);
  const net = (id: string) => simplified.reduce((sum, d) => sum + (d.to === id ? d.amount : 0) - (d.from === id ? d.amount : 0), 0);
  assert.equal(net("a"), 60);
  assert.equal(net("c"), -40);
  assert.deepEqual(groupTotals(bills, "b").get("MYR"), { total: 110, selfPaid: 20, selfShare: 40 });
});

test("settling a debt writes payments on its bills, never more than is owed", () => {
  const group = { bills: [bill("dinner", "a", { a: 30, b: 30 })], payments: [] as Payment[], simplify: false };
  const rows = settleRows(group, { from: "b", to: "a", currency: "MYR", amount: 100 }, "2026-11-15");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].row.amount, 30);
  assert.equal(rows[0].row.expense_id, "dinner");
  assert.match(String(rows[0].row.id), /\.0$/);
  // Paid already: nothing more to write.
  const paid = { ...group, payments: [pay("p.0", "dinner", "b", "a", 30)] };
  assert.deepEqual(settleRows(paid, { from: "b", to: "a", currency: "MYR", amount: 30 }, "2026-11-15"), []);
});

test("an even group with Simplify on closes its circle; off, it does not", () => {
  const circle = [bill("1", "a", { a: 10, b: 10 }), bill("2", "b", { b: 10, c: 10 }), bill("3", "c", { c: 10, a: 10 })];
  assert.equal(evenGroupRows({ bills: circle, payments: [], simplify: true }, "2026-11-15").length, 3);
  assert.equal(evenGroupRows({ bills: circle, payments: [], simplify: false }, "2026-11-15").length, 0);
});

test("undoing a payment undoes its whole act, by exact prefix", () => {
  const payments = [pay("b1.0", "x", "a", "b", 1), pay("b1.1", "y", "a", "b", 1), pay("b10.0", "x", "a", "b", 1), pay("solo", "x", "a", "b", 1)];
  assert.deepEqual(
    undonePaymentRows("b1.1", payments).map((r) => r.row.id),
    ["b1.0", "b1.1"],
  );
  assert.deepEqual(
    undonePaymentRows("solo", payments).map((r) => r.row.id),
    ["solo"],
  );
});

test("each split method fills in amounts that add up to the bill", () => {
  const base: SplitInput = { method: "even", totalCents: 10000, people: ["me", "tess", "ben"], values: {}, selfId: "me" };
  assert.deepEqual(
    splitShares(base).shares.map((s) => s.amount),
    [33.34, 33.33, 33.33],
  );
  const percent = { ...base, method: "percent" as const, values: { me: "50", tess: "25", ben: "25" } };
  assert.deepEqual(
    splitShares(percent).shares.map((s) => s.amount),
    [50, 25, 25],
  );
  assert.deepEqual(splitShares({ ...percent, values: { me: "50", tess: "25" } }).problem, { kind: "percent", given: 75 });
  const shares = { ...base, method: "shares" as const, values: { me: "2", tess: "1", ben: "1" } };
  assert.deepEqual(
    splitShares(shares).shares.map((s) => s.amount),
    [50, 25, 25],
  );
  const adjust = { ...base, method: "adjust" as const, values: { tess: "10" } };
  assert.deepEqual(
    splitShares(adjust).shares.map((s) => s.amount),
    [30, 40, 30],
  );
  const amount = { ...base, method: "amount" as const, values: { me: "20", tess: "30", ben: "40" } };
  assert.deepEqual(splitShares(amount).problem, { kind: "amount_left", cents: 1000 });
  // The user's own row takes what is left when someone else's is typed.
  assert.equal(balanceSelf(amount, "tess").me, "30");
  // Switching method keeps the split.
  assert.deepEqual(valuesFor("percent", base), { me: "33.34", tess: "33.33", ben: "33.33" });
  assert.deepEqual(valuesFor("adjust", base), { me: "0", tess: "0", ben: "0" });
});

test("a typed amount reads with either decimal mark", () => {
  assert.equal(readValue("12,50"), 12.5);
  assert.equal(readValue("1,234.50"), 1234.5);
  assert.equal(readValue("1.234,50"), 1234.5);
  assert.equal(readValue(""), 0);
});
