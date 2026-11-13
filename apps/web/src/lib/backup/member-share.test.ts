import assert from "node:assert/strict";
import { test } from "node:test";

import { memberShare, personKey, tripPeople } from "./member-share.ts";

const selfPaid = [
  { id: "me", transaction_id: "dinner", amount: 30, is_self: 1 },
  { id: "a", transaction_id: "dinner", person_name: "Aisha", amount: 30 },
  { id: "b", transaction_id: "dinner", person_name: " Ben ", amount: 20 },
  { id: "b-part", transaction_id: "dinner", person_name: "Ben", amount: 10, part_of_split_id: "b", paid_at: "2026-11-06" },
];
const friendPaid = [
  { id: "me", transaction_id: "hotel", amount: 20, is_self: 1 },
  { id: "a", transaction_id: "hotel", person_name: "Aisha", amount: 0, is_payer: 1, share_amount: 30 },
  { id: "a-part", transaction_id: "hotel", person_name: "Aisha", amount: 0, part_of_split_id: "a", share_amount: 10, paid_at: "2026-11-06" },
  { id: "b", transaction_id: "hotel", person_name: "Ben", amount: 0, share_amount: 30 },
];

test("an entry that is not split is the user's own, and nobody else's", () => {
  assert.equal(memberShare(undefined, 42, { kind: "self" }), 42);
  assert.equal(memberShare([], 42, { kind: "person", key: "aisha" }), 0);
});

test("a bill the user paid is shared by its rows, part payments included", () => {
  assert.equal(memberShare(selfPaid, 90, { kind: "self" }), 30);
  assert.equal(memberShare(selfPaid, 90, { kind: "person", key: "aisha" }), 30);
  assert.equal(memberShare(selfPaid, 90, { kind: "person", key: personKey("ben") }), 30);
});

test("a bill a friend paid reads shares from share_amount, leaving out the user's paybacks", () => {
  assert.equal(memberShare(friendPaid, 20, { kind: "self" }), 20);
  assert.equal(memberShare(friendPaid, 20, { kind: "person", key: "aisha" }), 30);
  assert.equal(memberShare(friendPaid, 20, { kind: "person", key: "ben" }), 30);
});

test("a trip's people are the names on its split bills", () => {
  const splits = new Map([
    ["dinner", selfPaid],
    ["hotel", friendPaid],
  ]);
  assert.deepEqual(tripPeople(splits, ["dinner", "hotel", "taxi"]), [
    { key: "aisha", name: "Aisha" },
    { key: "ben", name: "Ben" },
  ]);
  assert.deepEqual(tripPeople(splits, ["taxi"]), []);
});

test("the user's share of a bill a friend paid falls back to the expense when the Me row is gone", () => {
  const rows = [{ id: "a", transaction_id: "t", person_name: "Aisha", amount: 0, is_payer: 1, share_amount: 25 }];
  assert.equal(memberShare(rows, 25, { kind: "self" }), 25);
  assert.equal(memberShare([{ id: "b", transaction_id: "t", person_name: "Ben", amount: 50 }], 50, { kind: "self" }), 0);
});
