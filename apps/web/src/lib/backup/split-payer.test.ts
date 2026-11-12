import assert from "node:assert/strict";
import { test } from "node:test";
import { billPayer, netByPerson, owedToPayers } from "./split-payer.ts";

const dinner = [
  { id: "me", transaction_id: "dinner", amount: 30, is_self: 1 },
  { id: "aisha", transaction_id: "dinner", person_name: " Aisha ", amount: 0, is_payer: 1, share_amount: 30 },
  { id: "ben", transaction_id: "dinner", person_name: "Ben", amount: 0, share_amount: 30 },
];
const hotel = [
  { id: "h-me", transaction_id: "hotel", amount: 200, is_self: 1 },
  { id: "h-aisha", transaction_id: "hotel", person_name: "Aisha", amount: 200 },
];

test("the payer is the friend whose row carries is_payer; a bill the user paid has none", () => {
  assert.equal(billPayer(dinner)?.id, "aisha");
  assert.equal(billPayer(hotel), null);
  // Rows from an app before the column read as a bill the user paid.
  assert.equal(billPayer([{ id: "x", transaction_id: "t", amount: 10 }]), null);
  assert.equal(billPayer([{ id: "x", transaction_id: "t", amount: 10, is_payer: 1, is_self: 1 }]), null);
  assert.equal(billPayer([{ id: "x", transaction_id: "t", amount: 10, is_payer: 1, part_of_split_id: "root" }]), null);
});

test("the user owes the payer their own share, once per bill", () => {
  assert.deepEqual(owedToPayers([...dinner, ...hotel], () => 0), [{ txId: "dinner", splitId: "aisha", person: "Aisha", amount: 30, paidAt: null }]);
});

test("a debt paid back carries when; a bill with no Me row owes the expense itself", () => {
  const paid = dinner.map((row) => (row.id === "aisha" ? { ...row, paid_at: "2026-11-12T08:00:00.000Z" } : row));
  assert.equal(owedToPayers(paid, () => 0)[0].paidAt, "2026-11-12T08:00:00.000Z");
  assert.equal(owedToPayers([dinner[1]], () => 42)[0].amount, 42);
});

test("balances net per person, biggest either way first", () => {
  const balances = netByPerson(
    [
      { person: "Aisha", amountBase: 200 },
      { person: "Ben", amountBase: 20 },
    ],
    [
      { person: "aisha", amountBase: 30 },
      { person: "Cal", amountBase: 250 },
    ],
  );
  assert.deepEqual(balances, [
    { person: "Cal", net: -250, count: 1 },
    { person: "Aisha", net: 170, count: 2 },
    { person: "Ben", net: 20, count: 1 },
  ]);
});
