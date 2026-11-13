import assert from "node:assert/strict";
import { test } from "node:test";
import { balanceFriends, draftRows, evenAcrossUnpaid, evenOwedAmounts, unpaidSplitBills, type SplitDraftRow, type SplitRecord } from "./split-ops.ts";

const row = (amount: string, extra: Partial<SplitDraftRow> = {}): SplitDraftRow => ({
  key: extra.id ?? `k${amount}`,
  name: "",
  amount,
  isSelf: false,
  paybackAccountId: null,
  paid: false,
  paidAt: null,
  ...extra,
});

test("evenOwedAmounts matches a plain even split when nobody has paid", () => {
  assert.deepEqual(evenOwedAmounts(100, [0, 0, 0]), [33.34, 33.33, 33.33]);
});

test("evenOwedAmounts keeps shares even when one is part paid", () => {
  // RM10,000 between 10; Aisha paid RM300, so RM9,700 is still owed.
  const owed = evenOwedAmounts(9700, [0, 300, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(owed[1], 700);
  assert.ok(owed.every((value, i) => i === 1 || value === 1000));
});

test("evenOwedAmounts lets a share that paid more than its portion owe nothing, and still adds up", () => {
  assert.deepEqual(evenOwedAmounts(100, [0, 90, 0]), [50, 0, 50]);
  assert.equal(evenOwedAmounts(10, [0, 30, 0]).reduce((a, b) => a + b, 0), 10);
});

test("split evenly counts what a part-paid friend already paid", () => {
  // RM3,000 between Me, Aisha and Ben; Aisha paid RM300, so RM2,700 is owed.
  const rows = [
    row("1000", { isSelf: true }),
    row("700", { id: "a", shareKey: "a" }),
    row("300", { id: "p", shareKey: "a", paid: true }),
    row("1000", { id: "b", shareKey: "b" }),
  ];
  assert.deepEqual(
    evenAcrossUnpaid(rows, 2700).map((r) => r.amount),
    ["1000.00", "700.00", "300", "1000.00"],
  );
});

test("split evenly gives a share owing on two rows one portion", () => {
  const rows = [row("0", { isSelf: true }), row("700", { shareKey: "a" }), row("300", { shareKey: "a" }), row("1000", { shareKey: "b" })];
  assert.deepEqual(
    evenAcrossUnpaid(rows, 2000).map((r) => r.amount),
    ["666.67", "666.67", "0.00", "666.66"],
  );
});

test("editing Me spreads the rest over the friends' shares", () => {
  const rows = [
    row("1000", { isSelf: true }),
    row("700", { shareKey: "a" }),
    row("300", { shareKey: "a", paid: true }),
    row("1000", { shareKey: "b" }),
  ];
  // Me takes RM800: RM1,900 left for Aisha and Ben, of which Aisha paid RM300.
  assert.deepEqual(
    balanceFriends(rows, 2700).map((r) => r.amount),
    ["1000", "700.00", "300", "1000.00"],
  );
  const lighterMe = [{ ...rows[0], amount: "800" }, ...rows.slice(1)];
  assert.deepEqual(
    balanceFriends(lighterMe, 2700).map((r) => r.amount),
    ["800", "800.00", "300", "1100.00"],
  );
});

test("rows from a phone without part payments split as before", () => {
  const rows = [row("0", { isSelf: true }), row("50"), row("50")];
  assert.deepEqual(
    evenAcrossUnpaid(rows, 90).map((r) => r.amount),
    ["30.00", "30.00", "30.00"],
  );
});

test("draftRows keys each friend by share", () => {
  const records = [
    { id: "me", transaction_id: "t", amount: 0, is_self: 1 },
    { id: "a", transaction_id: "t", amount: 700, person_name: "Aisha" },
    { id: "p", transaction_id: "t", amount: 300, person_name: "Aisha", paid_at: "2026-11-07", part_of_split_id: "a" },
    { id: "b", transaction_id: "t", amount: 1000, person_name: "Ben" },
  ] as SplitRecord[];
  assert.deepEqual(
    draftRows(records).map((r) => r.shareKey),
    [undefined, "a", "a", "b"],
  );
});

test("the free plan's split count leaves a shared album's bills out, as the app's countUnpaidSplitBills", () => {
  const tx = (id: string, albumGroupId?: string) => [id, { id, ...(albumGroupId ? { albumGroupId } : null) }] as const;
  const split = (id: string, transaction_id: string, amount: number, extra: Partial<SplitRecord> = {}) => ({ id, transaction_id, person_name: "Ben", amount, ...extra });
  const model = {
    txById: new Map([tx("mine"), tx("group", "album-1"), tx("paid"), tx("friend-paid"), tx("group-friend-paid", "album-1")]),
    raw: {
      transaction_splits: [
        split("a", "mine", 10),
        split("b", "group", 10),
        split("c", "paid", 10, { paid_at: "2026-11-01T00:00:00.000Z" }),
        split("d", "gone", 10),
      ],
    },
    splitOwed: [{ txId: "friend-paid" }, { txId: "group-friend-paid" }],
  } as unknown as Parameters<typeof unpaidSplitBills>[0];
  assert.equal(unpaidSplitBills(model), 2);
});
