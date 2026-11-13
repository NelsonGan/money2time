import assert from "node:assert/strict";
import { test } from "node:test";
import { awaitingAccount, balancesByAlbum, billPayer, isPayBackPart, netByPerson, owedToPayers, partyKey } from "./split-payer.ts";

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
  assert.deepEqual(owedToPayers([...dinner, ...hotel], () => 0), [{ txId: "dinner", splitId: "aisha", person: "Aisha", key: "aisha", amount: 30, paidAt: null }]);
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

test("a part paid back leaves what is still owed on the Me row", () => {
  const partPaid = [
    { id: "me", transaction_id: "dinner", amount: 20, is_self: 1 },
    { id: "aisha", transaction_id: "dinner", person_name: "Aisha", amount: 0, is_payer: 1, share_amount: 30 },
    { id: "part", transaction_id: "dinner", person_name: "Aisha", amount: 0, share_amount: 10, part_of_split_id: "aisha", paid_at: "2026-11-08T09:00:00.000Z", paid_transaction_id: "tx" },
  ];
  assert.equal(owedToPayers(partPaid, () => 0)[0].amount, 20);
  assert.deepEqual(partPaid.map(isPayBackPart), [false, false, true]);
  // A friend's part payment on a bill the user paid keeps its amount in `amount`.
  assert.equal(isPayBackPart({ id: "x", transaction_id: "t", amount: 10, part_of_split_id: "root", paid_at: "2026-11-08" }), false);
});

test("a real user is one person whatever name they were typed under", () => {
  assert.equal(partyKey(" Aisha "), "aisha");
  assert.equal(partyKey("Aisha", "u1"), "member:u1");
  const balances = netByPerson(
    [
      { person: "Aisha", key: "member:u1", amountBase: 40 },
      { person: "Aisha B.", key: "member:u1", amountBase: 10 },
      { person: "Aisha", key: "aisha", amountBase: 5 },
    ],
    [],
  );
  assert.deepEqual(balances, [
    { person: "Aisha", net: 50, count: 2 },
    { person: "Aisha", net: 5, count: 1 },
  ]);
});

test("an album answers for its own bills, and the people list for the rest", () => {
  const balances = balancesByAlbum(
    [
      { person: "Aisha", amountBase: 30, txId: "dinner" },
      { person: "Ben", amountBase: 30, txId: "dinner" },
      { person: "Aisha", amountBase: 12, txId: "lunch" },
    ],
    [{ person: "aisha", amountBase: 40, txId: "boat" }],
    [
      { id: "bali", name: "Bali trip", txIds: ["dinner", "boat"] },
      { id: "quiet", name: "Nothing open", txIds: ["paid"] },
    ],
  );
  assert.deepEqual(balances.people, [{ person: "Aisha", net: 12, count: 1 }]);
  assert.deepEqual(balances.albums, [
    {
      id: "bali",
      name: "Bali trip",
      net: 20,
      people: [
        { person: "Ben", net: 30, count: 1 },
        { person: "Aisha", net: -10, count: 2 },
      ],
    },
  ]);
});

test("a shared album's bill someone else said the user paid waits for its account, as the app's needsAccountConfirm", () => {
  const tx = (id: string, extra: { accountId?: string | null; albumGroupId?: string; type?: string } = {}) => ({
    id,
    type: extra.type ?? "expense",
    accountId: extra.accountId ?? null,
    ...(extra.albumGroupId ? { albumGroupId: extra.albumGroupId } : null),
  });
  const splits = [
    { id: "w-me", transaction_id: "waiting", amount: 30, is_self: 1 },
    { id: "w-ben", transaction_id: "waiting", person_name: "Ben", amount: 30 },
    { id: "c-me", transaction_id: "confirmed", amount: 30, is_self: 1 },
    { id: "c-ben", transaction_id: "confirmed", person_name: "Ben", amount: 30 },
    { id: "o-ben", transaction_id: "own", person_name: "Ben", amount: 30 },
    ...dinner.map((row) => ({ ...row, transaction_id: "friend-paid" })),
  ];
  const txs = [
    tx("waiting", { albumGroupId: "bali" }),
    tx("confirmed", { albumGroupId: "bali", accountId: "cash" }),
    // Not a group's bill: on no account for the user's own reasons.
    tx("own"),
    // A friend paid it: owed, not waiting.
    tx("friend-paid", { albumGroupId: "bali" }),
  ];
  assert.deepEqual([...awaitingAccount(txs, splits)], ["waiting"]);
});
