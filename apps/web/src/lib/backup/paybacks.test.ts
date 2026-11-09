import assert from "node:assert/strict";
import { test } from "node:test";
import { paidWithoutTransfer, paybackNote, withPaybackRows } from "./paybacks.ts";

test("a paid share with no transfer is a payback row; anything else is not", () => {
  const paid = { amount: 30, paid_at: "2026-11-08T10:00:00.000Z" };
  assert.equal(paidWithoutTransfer(paid), true);
  assert.equal(paidWithoutTransfer({ ...paid, paid_transaction_id: "tr" }), false);
  assert.equal(paidWithoutTransfer({ ...paid, paid_at: null }), false);
  assert.equal(paidWithoutTransfer({ ...paid, is_self: 1 }), false);
  assert.equal(paidWithoutTransfer({ ...paid, amount: 0 }), false);
});

test("the note reads as the app's payback transfer note", () => {
  assert.equal(paybackNote(" Aisha ", " Dinner "), "Aisha: Dinner");
  assert.equal(paybackNote("Bartholomew", "Dinner"), "Barthol..: Dinner");
  assert.equal(paybackNote("Aisha", ""), "Aisha");
  assert.equal(paybackNote(null, "Dinner"), "Dinner");
  assert.equal(paybackNote(null, null), "");
});

test("payback rows merge in by date, newest first, after stored rows of the same moment", () => {
  const at = (id: string, iso: string) => ({ id, date: new Date(iso) });
  const stored = [at("b", "2026-11-08T12:00:00Z"), at("a", "2026-11-07T09:00:00Z")];
  assert.equal(withPaybackRows(stored, []), stored);
  const merged = withPaybackRows(stored, [at("p2", "2026-11-09T08:00:00Z"), at("p1", "2026-11-08T12:00:00Z")]);
  assert.deepEqual(
    merged.map((row) => row.id),
    ["p2", "b", "p1", "a"],
  );
});
