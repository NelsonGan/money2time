import assert from "node:assert/strict";
import { test } from "node:test";

import { albumCategoriesOf, albumGroupOf, billPeople, describeActivity, groupActivityByDay, type ActivityContext } from "./album-group.ts";
import type { WebAlbumActivityRow, WebAlbumBillSnapshot } from "./types";

const tables = {
  web_album_members: [
    { id: "tess", album_id: "bali", name: "Tess", is_self: 0, current: 1, sort_order: 1 },
    { id: "gone", album_id: "bali", name: "Gone", is_self: 0, current: 0, sort_order: 2 },
    { id: "me", album_id: "bali", name: "Nelson", is_self: 1, current: 1, sort_order: 3 },
    { id: "x", album_id: "ski", name: "X", is_self: 1, current: 1 },
  ],
  web_album_bills: [
    { id: "b1", album_id: "bali", date: "2026-10-01", note: "Dinner", amount: 30, currency: "MYR", paid_by: "gone", shares: [{ memberId: "me", amount: 30 }] },
    { id: "b2", album_id: "bali", date: "2026-10-01", amount: 4, currency: "MYR", paid_by: "me", shares: [], deleted: 1 },
  ],
  web_album_activity: [
    { id: "old", album_id: "bali", kind: "member_joined", member_id: "tess", created_at: "2026-10-01T08:00:00.000Z" },
    { id: "a", album_id: "bali", kind: "cover_changed", created_at: "2026-10-02T08:00:00.000Z", sort_order: 0 },
    // Added at the end by a patch, but newer.
    { id: "b", album_id: "bali", kind: "cover_changed", created_at: "2026-10-02T08:00:00.000Z", sort_order: 1 },
  ],
};

test("albumGroupOf reads one album's group, the user first and the log newest first", () => {
  const group = albumGroupOf(tables, "bali");
  assert.ok(group);
  assert.equal(group.selfId, "me");
  assert.deepEqual(
    group.members.map((member) => member.id),
    ["me", "tess", "gone"],
  );
  assert.equal(group.bills.get("b2")?.deleted, true);
  assert.deepEqual(
    group.activity.map((entry) => entry.id),
    ["b", "a", "old"],
  );
  // Someone who left stays on a bill they are on, and is offered for no other.
  assert.deepEqual(
    billPeople(group, group.bills.get("b1")!).map((member) => member.id),
    ["me", "tess", "gone"],
  );
  assert.deepEqual(
    billPeople(group, null).map((member) => member.id),
    ["me", "tess"],
  );
});

test("albumGroupOf is null without the phone's group data", () => {
  assert.equal(albumGroupOf({}, "bali"), null);
  assert.equal(albumGroupOf(tables, "nowhere"), null);
});

// The app's words, so a line reads as in its Activity tab.
const WORDS: Record<string, string> = {
  you: "You",
  you_lower: "you",
  untitled: "a bill",
  added: "{actor} added {title} · {money}",
  said_you_paid: "{actor} said you paid {title} · {money}",
  deleted: "{actor} deleted {title} · {money}",
  changed_amount: "{actor} changed {title}: {before} → {after}",
  changed_payer: "{actor} changed who paid {title}: {before} → {after}",
  your_share: "Your share {money}",
  your_share_change: "Your share {before} → {after}",
  your_share_gone: "Your share of {money} is gone",
  paid: "{from} paid {to} {money}",
  undid_payment: "{actor} undid {from} paying {to} {money}",
  undid_own_payment: "{actor} undid paying {to} {money}",
  joined: "{name} joined the album",
  started: "{name} started the album",
  changed_album: "{actor} changed the album",
  changed_bill: "{actor} changed {title}",
  recategorized_bill: "{actor} filed {title} under {category}",
  category_added: "{actor} added the category {name}",
  category_removed: "{actor} removed the category {name}",
  category_renamed: "{actor} renamed the category {before} to {after}",
  category_icon: "{actor} changed the icon of {name}",
};

const ctx = (patch: Partial<ActivityContext> = {}): ActivityContext => ({
  t: (key, values = {}) => (WORDS[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? ""),
  selfId: "me",
  nameOf: (id) => (id === "tess" ? "Tess" : "Someone"),
  money: (amount) => `RM${amount}`,
  day: (date) => date,
  category: (key) => key.charAt(0).toUpperCase() + key.slice(1),
  ...patch,
});

const snap = (patch: Partial<WebAlbumBillSnapshot> = {}): WebAlbumBillSnapshot => ({
  note: "Dinner",
  amount: 30,
  currency: "MYR",
  date: "2026-10-01",
  paidBy: "tess",
  shares: [
    { memberId: "me", amount: 15 },
    { memberId: "tess", amount: 15 },
  ],
  ...patch,
});

const entry = (patch: Partial<WebAlbumActivityRow>): WebAlbumActivityRow => ({
  id: "e",
  album_id: "bali",
  kind: "bill_added",
  actor_member_id: "tess",
  expense_id: "b1",
  created_at: "2026-10-01T08:00:00.000Z",
  ...patch,
});

test("describeActivity words each change as the app does, with the user's money on its own line", () => {
  assert.deepEqual(
    (({ text, mine }) => ({ text, mine }))(describeActivity(entry({ bill: { before: null, after: snap() } }), ctx())),
    { text: "Tess added Dinner · RM30", mine: "Your share RM15" },
  );
  // Someone said the user paid.
  const said = describeActivity(entry({ bill: { before: null, after: snap({ paidBy: "me" }) } }), ctx());
  assert.equal(said.text, "Tess said you paid Dinner · RM30");
  assert.equal(said.mine, "Your share RM15");
  const edited = describeActivity(entry({ kind: "bill_edited", bill: { before: snap(), after: snap({ amount: 40, shares: [{ memberId: "me", amount: 20 }, { memberId: "tess", amount: 20 }] }) } }), ctx());
  assert.equal(edited.text, "Tess changed Dinner: RM30 → RM40");
  assert.equal(edited.mine, "Your share RM15 → RM20");
  const payer = describeActivity(entry({ kind: "bill_edited", bill: { before: snap({ paidBy: "me" }), after: snap() } }), ctx());
  assert.equal(payer.text, "Tess changed who paid Dinner: you → Tess");
  // Only a share that moved gets a note; who paid is in the line itself.
  assert.equal(payer.mine, null);
  // The user's own change is no news to them.
  assert.equal(describeActivity(entry({ actor_member_id: "me", bill: { before: null, after: snap() } }), ctx()).mine, null);
});

test("describeActivity says what a delete took from the user", () => {
  const line = describeActivity(entry({ kind: "bill_deleted", bill: { before: snap(), after: null } }), ctx());
  assert.equal(line.text, "Tess deleted Dinner · RM30");
  assert.equal(line.mine, "Your share of RM15 is gone");
});

test("describeActivity words payments, members and kinds from a later app", () => {
  const paid = describeActivity(entry({ kind: "payment_recorded", payment: { from: "me", to: "tess", currency: "MYR", amount: 15 } }), ctx());
  assert.equal(paid.text, "You paid Tess RM15");
  // Payments carry no note: the line says who paid whom.
  assert.equal(paid.mine, null);
  assert.equal(describeActivity(entry({ kind: "payment_recorded", payment: { from: "tess", to: "me", currency: "MYR", amount: 15 } }), ctx()).mine, null);
  // Undone by the payer: "Tess undid paying you", not "Tess undid Tess paying you".
  assert.equal(describeActivity(entry({ kind: "payment_undone", payment: { from: "tess", to: "me", currency: "MYR", amount: 15 } }), ctx()).text, "Tess undid paying you RM15");
  // Someone else's undo: the payer is mid-sentence, so "you", not "You".
  assert.equal(describeActivity(entry({ kind: "payment_undone", actor_member_id: "tess", payment: { from: "me", to: "ben", currency: "MYR", amount: 15 } }), ctx()).text, "Tess undid you paying Someone RM15");
  assert.equal(describeActivity(entry({ kind: "member_joined", member_id: "tess" }), ctx()).text, "Tess joined the album");
  assert.equal(describeActivity(entry({ kind: "member_joined", member_id: "tess", started: true }), ctx()).text, "Tess started the album");
  assert.equal(describeActivity(entry({ kind: "from_the_future" }), ctx()).text, "Tess changed the album");
});

test("groupActivityByDay keeps the order and starts a group per day", () => {
  const lines = ["2026-10-02T10:00:00Z", "2026-10-02T08:00:00Z", "2026-10-01T08:00:00Z"].map((createdAt, index) => ({ ...describeActivity(entry({ id: `e${index}`, kind: "cover_changed" }), ctx()), createdAt }));
  const days = groupActivityByDay(lines, (iso) => iso.slice(0, 10));
  assert.deepEqual(
    days.map((day) => [day.day, day.lines.length]),
    [
      ["2026-10-02", 2],
      ["2026-10-01", 1],
    ],
  );
});

test("a change of a bill's album category says what it is filed under now", () => {
  const line = describeActivity(entry({ kind: "bill_edited", bill: { before: snap({ category: "food" }), after: snap({ category: "transport" }) } }), ctx());
  assert.equal(line.text, WORDS.recategorized_bill.replace("{actor}", "Tess").replace("{title}", "Dinner").replace("{category}", "Transport"));
  // An entry logged before bills had one says only that the bill changed.
  const older = describeActivity(entry({ kind: "bill_edited", bill: { before: snap(), after: snap() } }), ctx());
  assert.equal(older.text, WORDS.changed_bill.replace("{actor}", "Tess").replace("{title}", "Dinner"));
});

test("a change to the album's categories says what was added, renamed, re-iconed or removed", () => {
  const change = (before: { name: string | null; icon: string | null } | null, after: { name: string | null; icon: string | null } | null, key = "food") =>
    describeActivity(entry({ kind: "category_changed", expense_id: null, category: { key, before, after } }), ctx({ category: () => "Meals", defaultCategory: (k) => (k === "food" ? "Food" : "Other") })).text;
  assert.equal(change(null, { name: "Tickets", icon: "emoji:🎟️" }, "c-tickets1"), "Tess added the category Tickets");
  assert.equal(change({ name: "Tickets", icon: "emoji:🎟️" }, null, "c-tickets1"), "Tess removed the category Tickets");
  // A name left null is the default's own, not what the album calls it now.
  assert.equal(change({ name: null, icon: null }, { name: "Meals", icon: null }), "Tess renamed the category Food to Meals");
  assert.equal(change({ name: "Meals", icon: null }, { name: "Meals", icon: "emoji:🍜" }), "Tess changed the icon of Meals");
  assert.equal(change({ name: null, icon: null }, { name: null, icon: "pizza" }), "Tess changed the icon of Food");
});

test("an album's categories come from the phone, and a bill of one it no longer has reads as Other", () => {
  const withCategories = {
    ...tables,
    web_album_categories: [
      { id: "bali:food", album_id: "bali", key: "food", name: "Meals", icon: null, sort_order: 0 },
      { id: "bali:c-tickets1", album_id: "bali", key: "c-tickets1", name: "Tickets", icon: "emoji:🎟️", sort_order: 1 },
      { id: "bali:other", album_id: "bali", key: "other", name: null, icon: null, sort_order: 2 },
    ],
    web_album_bills: [
      { id: "b1", album_id: "bali", date: "2026-10-01", amount: 30, currency: "MYR", category: "c-tickets1", paid_by: "me", shares: [{ memberId: "me", amount: 30 }] },
      { id: "b2", album_id: "bali", date: "2026-10-01", amount: 4, currency: "MYR", category: "c-gone0001", paid_by: "me", shares: [{ memberId: "me", amount: 4 }] },
      { id: "b3", album_id: "bali", date: "2026-10-01", amount: 4, currency: "MYR", category: "transport", paid_by: "me", shares: [{ memberId: "me", amount: 4 }] },
    ],
  };
  const group = albumGroupOf(withCategories, "bali");
  assert.ok(group);
  assert.deepEqual(
    group.categories.map((category) => [category.key, category.name]),
    [
      ["food", "Meals"],
      ["c-tickets1", "Tickets"],
      ["other", null],
    ],
  );
  assert.equal(group.bills.get("b1")?.category, "c-tickets1");
  assert.equal(group.bills.get("b2")?.category, "other");
  // The phone's list left Transport out: removed, so its bills read as Other.
  assert.equal(group.bills.get("b3")?.category, "other");
  // An older phone sends none: the eight defaults.
  assert.equal(albumCategoriesOf({}, "bali").length, 8);
});
