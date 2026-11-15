import assert from "node:assert/strict";
import test from "node:test";

import { albumGroupNet, groupAlbumIds } from "./album-group-net.ts";
import { balancesByAlbum } from "./split-payer.ts";

const members = [
  { id: "me", album_id: "bali", name: "Me", is_self: 1, current: 1, sort_order: 0 },
  { id: "ben", album_id: "bali", name: "Ben", is_self: 0, current: 1, sort_order: 1 },
];
const bill = (id: string, paidBy: string, shares: Record<string, number>, extra: Record<string, unknown> = {}) => ({
  id,
  album_id: "bali",
  date: "2026-11-15",
  note: id,
  amount: Object.values(shares).reduce((a, b) => a + b, 0),
  currency: "MYR",
  paid_by: paidBy,
  shares: Object.entries(shares).map(([memberId, amount]) => ({ memberId, amount })),
  ...extra,
});
const payment = (id: string, expense: string, from: string, to: string, amount: number, currency = "MYR") => ({
  id,
  album_id: "bali",
  expense_id: expense,
  from_member: from,
  to_member: to,
  amount,
  currency,
});

test("an album's net is its group's: a payment on a deleted bill is owed back", () => {
  const tables = {
    web_album_members: members,
    web_album_bills: [bill("dinner", "me", { me: 30, ben: 30 }, { deleted: 1 }), bill("taxi", "ben", { me: 10, ben: 10 })],
    web_album_settlements: [payment("p1", "dinner", "ben", "me", 30)],
  };
  // Ben paid 30 on a bill since deleted (owed back to him) and the user owes 10 on the taxi.
  assert.deepEqual(albumGroupNet(tables, "bali", "MYR"), { count: 2, netByCurrency: [{ currency: "MYR", amount: -40 }] });
  // No payments sent (an older app): read from the entries instead.
  assert.equal(albumGroupNet({ web_album_members: members, web_album_bills: tables.web_album_bills }, "bali"), null);
});

test("Balances lists a shared album by its group's net, even with no entry left owing", () => {
  const tables = {
    web_album_members: members,
    web_album_bills: [bill("dinner", "me", { me: 30, ben: 30 }, { deleted: 1 })],
    web_album_settlements: [payment("p1", "dinner", "ben", "me", 30)],
  };
  const { albums } = balancesByAlbum([], [], [{ id: "bali", name: "Bali", txIds: [] }], new Set(["bali"]), "MYR", (id) => albumGroupNet(tables, id, "MYR"));
  assert.deepEqual(
    albums.map((album) => ({ id: album.id, net: album.net, netByCurrency: album.netByCurrency, open: album.open })),
    [{ id: "bali", net: -30, netByCurrency: [{ currency: "MYR", amount: -30 }], open: 1 }],
  );
  // Settled in the group: not listed.
  const settled = { ...tables, web_album_settlements: [payment("p1", "dinner", "ben", "me", 30), payment("p2", "dinner", "me", "ben", 30)] };
  assert.deepEqual(balancesByAlbum([], [], [{ id: "bali", name: "Bali", txIds: [] }], new Set(["bali"]), "MYR", (id) => albumGroupNet(settled, id, "MYR")).albums, []);
});

test("an album the phone sent a group for counts as shared, with or without entries", () => {
  assert.deepEqual([...groupAlbumIds({ web_album_members: members })], ["bali"]);
  assert.deepEqual([...groupAlbumIds({})], []);
});
