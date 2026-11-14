/**
 * Who owes whom in a shared album's group: the app's
 * `features/albums/lib/groupDebts.ts` and the totals of its `albumGroup.ts`,
 * the same rules line for line, so the website and every phone show the same
 * debts and record the same payments. Pure: no fetch, no clock.
 *
 * - `openShares`: each share owed to its bill's payer, less the payments made
 *   on it; a payment past what was owed is owed back.
 * - `pairwiseDebts`: each pair's net. `simplifyDebts`: the same nets with
 *   fewer payments (Simplify group debts).
 * - `settleDebt`: a payment between two members as payments on bills.
 */

import { cents } from "../backup/album-group.ts";
import type { Bill, Payment } from "./group";

/** Amounts in whole cents, which is what the sums are done in (the dashboard's helper). */
export { cents };

/** A group's live payments by the bill they are for. */
export function settlementsByBill<T extends Pick<Payment, "expenseId" | "deleted">>(payments: readonly T[]): Map<string, T[]> {
  const byBill = new Map<string, T[]>();
  for (const item of payments) {
    if (item.deleted || !item.expenseId) continue;
    const list = byBill.get(item.expenseId);
    if (list) list.push(item);
    else byBill.set(item.expenseId, [item]);
  }
  return byBill;
}

/** A group's spending in one currency, and one member's part in it. */
export type GroupSpending = { total: number; selfPaid: number; selfShare: number };

/** What the group spent, and what one member paid and their share of it, per currency. */
export function groupTotals(bills: readonly Bill[], selfId: string | null): Map<string, GroupSpending> {
  const totals = new Map<string, { total: number; selfPaid: number; selfShare: number }>();
  for (const bill of bills) {
    if (bill.deleted) continue;
    const entry = totals.get(bill.currency) ?? { total: 0, selfPaid: 0, selfShare: 0 };
    entry.total += cents(bill.amount);
    if (bill.paidBy === selfId) entry.selfPaid += cents(bill.amount);
    for (const share of bill.shares) if (share.memberId === selfId) entry.selfShare += cents(share.amount);
    totals.set(bill.currency, entry);
  }
  return new Map([...totals].map(([currency, entry]) => [currency, { total: entry.total / 100, selfPaid: entry.selfPaid / 100, selfShare: entry.selfShare / 100 }]));
}

type DebtBill = Pick<Bill, "id" | "date" | "amount" | "currency" | "paidBy" | "shares" | "deleted">;
type DebtPayment = Pick<Payment, "id" | "expenseId" | "fromMember" | "toMember" | "amount" | "currency" | "deleted">;

/** What one member still owes another on one bill. */
export interface OpenShare {
  expenseId: string;
  /** The member who owes. */
  from: string;
  /** The member owed: the bill's payer, or someone who paid past their share. */
  to: string;
  currency: string;
  amount: number;
}

/** A debt between two members: `from` owes `to`. */
export interface GroupDebt {
  from: string;
  to: string;
  currency: string;
  amount: number;
}

/** A payment on one bill, from the member who owes a share of it to the one who paid it. */
export interface BillPayment {
  expenseId: string;
  from: string;
  to: string;
  amount: number;
}

/**
 * What is still owed on each of the group's bills, oldest bill first: each
 * share owed to the bill's payer, less the payments made on it. A payment is
 * money one member gave another for that bill, so it is set off against what
 * they owed each other on it: past a share (an edit lowered it, the payer
 * changed, or the bill was deleted, which leaves its payments standing), the
 * difference is owed back the other way.
 */
export function openShares(expenses: readonly DebtBill[], settlements: readonly DebtPayment[]): OpenShare[] {
  const open: OpenShare[] = [];
  const paid = settlementsByBill(settlements);
  const bills = expenses
    .filter((bill) => !bill.deleted || paid.has(bill.id))
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : 1));
  for (const bill of bills) {
    const graph: Graph = new Map();
    if (!bill.deleted) {
      for (const share of bill.shares) {
        if (share.memberId === bill.paidBy) continue;
        addNet(graph, share.memberId, bill.paidBy, cents(share.amount));
      }
    }
    for (const payment of paid.get(bill.id) ?? []) {
      // A payment in another currency than its bill's is not a payment on it.
      if (payment.currency && payment.currency !== bill.currency) continue;
      addNet(graph, payment.toMember, payment.fromMember, Math.max(0, cents(payment.amount)));
    }
    for (const debt of debtsOf(graph, bill.currency)) {
      open.push({ expenseId: bill.id, ...debt });
    }
  }
  return open;
}

/** Debts of one currency in cents: who owes (`from`), whom, how much. */
type Graph = Map<string, Map<string, number>>;

const owed = (graph: Graph, from: string, to: string) => graph.get(from)?.get(to) ?? 0;

function setOwed(graph: Graph, from: string, to: string, amount: number): void {
  const row = graph.get(from) ?? new Map<string, number>();
  if (amount > 0) row.set(to, amount);
  else row.delete(to);
  if (row.size) graph.set(from, row);
  else graph.delete(from);
}

/** Adds a debt, set off against what `to` already owes `from`. */
function addNet(graph: Graph, from: string, to: string, amount: number): void {
  const back = owed(graph, to, from);
  const cancelled = Math.min(back, amount);
  if (cancelled > 0) setOwed(graph, to, from, back - cancelled);
  if (amount > cancelled) setOwed(graph, from, to, owed(graph, from, to) + amount - cancelled);
}

function byCurrency<T extends { currency: string }>(rows: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.currency);
    if (group) group.push(row);
    else groups.set(row.currency, [row]);
  }
  return groups;
}

/** The graph's debts as a list, in an order every phone agrees on. */
function debtsOf(graph: Graph, currency: string): GroupDebt[] {
  return [...graph.keys()]
    .sort()
    .flatMap((from) =>
      [...graph.get(from)!.keys()]
        .sort()
        .map((to) => ({ from, to, currency, amount: owed(graph, from, to) / 100 })),
    );
}

/** Each pair's net in each currency: who owes whom now. */
export function pairwiseDebts(open: readonly OpenShare[]): GroupDebt[] {
  return [...byCurrency(open)]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([currency, shares]) => {
      const graph: Graph = new Map();
      for (const share of shares) addNet(graph, share.from, share.to, cents(share.amount));
      return debtsOf(graph, currency);
    });
}

/** A path of members from `from` to `to` along debts that still have room, shortest first. */
function findPath(graph: Graph, from: string, to: string): string[] | null {
  const cameFrom = new Map<string, string>();
  const queue = [from];
  for (let i = 0; i < queue.length; i += 1) {
    const member = queue[i];
    for (const next of [...(graph.get(member)?.keys() ?? [])].sort()) {
      if (next === from || cameFrom.has(next)) continue;
      cameFrom.set(next, member);
      if (next === to) {
        const path = [to];
        while (path[0] !== from) path.unshift(cameFrom.get(path[0])!);
        return path;
      }
      queue.push(next);
    }
  }
  return null;
}

/** Members going round in a circle of debts, or null when there is none. */
function findCircle(graph: Graph): string[] | null {
  for (const start of [...graph.keys()].sort()) {
    for (const next of [...graph.get(start)!.keys()].sort()) {
      if (next === start) continue;
      const back = findPath(graph, next, start);
      if (back) return [start, ...back];
    }
  }
  return null;
}

/** What each member owes each other on the group's bills in one currency, before any netting. */
function owedOnBills(shares: readonly OpenShare[]): Graph {
  const graph: Graph = new Map();
  for (const share of shares) {
    setOwed(graph, share.from, share.to, owed(graph, share.from, share.to) + cents(share.amount));
  }
  return graph;
}

/**
 * Moves up to `limit` from `from` to `to` along the debts in `room`, which it
 * changes: each debt it uses has that much less room, and as much room the
 * other way (to take it back, should a later path do better through there).
 * Returns what moved.
 */
function moveAlong(room: Graph, from: string, to: string, limit: number): number {
  let left = limit;
  while (left > 0) {
    const path = findPath(room, from, to);
    if (!path) break;
    const amount = Math.min(
      left,
      ...path.slice(0, -1).map((member, i) => owed(room, member, path[i + 1])),
    );
    for (let i = 0; i + 1 < path.length; i += 1) {
      setOwed(room, path[i], path[i + 1], owed(room, path[i], path[i + 1]) - amount);
      setOwed(room, path[i + 1], path[i], owed(room, path[i + 1], path[i]) + amount);
    }
    left -= amount;
  }
  return limit - left;
}

/** Moves up to `limit` straight from `from` to `to`, along their own debt only. Returns what moved. */
function moveDirect(room: Graph, from: string, to: string, limit: number): number {
  const amount = Math.min(limit, owed(room, from, to));
  if (amount > 0) setOwed(room, from, to, owed(room, from, to) - amount);
  return amount;
}

/** Debts passed along: while someone both owes and is owed, what they are owed goes to the one they owe. */
function passedAlong(pairs: Graph): Graph {
  const graph: Graph = new Map([...pairs].map(([from, row]) => [from, new Map(row)]));
  for (;;) {
    // Someone in the middle: owed by `from`, and owing `to`.
    const middle = [...graph.keys()]
      .sort()
      .find((member) => [...graph.keys()].some((from) => owed(graph, from, member) > 0));
    if (!middle) return graph;
    const from = [...graph.keys()].sort().find((member) => owed(graph, member, middle) > 0)!;
    const to = [...graph.get(middle)!.keys()].sort()[0];
    const amount = Math.min(owed(graph, from, middle), owed(graph, middle, to));
    setOwed(graph, from, middle, owed(graph, from, middle) - amount);
    setOwed(graph, middle, to, owed(graph, middle, to) - amount);
    // Set off against what `to` owes `from`: a circle of debts is simply gone.
    addNet(graph, from, to, amount);
  }
}

/** The fewest payments that settle everyone's net: whoever owes most pays whoever is owed most. */
function fewestPayments(pairs: Graph): Graph {
  const net = new Map<string, number>();
  for (const [from, row] of pairs) {
    for (const [to, amount] of row) {
      net.set(from, (net.get(from) ?? 0) - amount);
      net.set(to, (net.get(to) ?? 0) + amount);
    }
  }
  const graph: Graph = new Map();
  for (;;) {
    // The largest first, then by id, so every phone picks the same.
    const ranked = [...net].filter(([, value]) => value !== 0).sort(([a], [b]) => (a < b ? -1 : 1));
    const payer = ranked.reduce<[string, number] | null>(
      (best, item) => (item[1] < 0 && (!best || item[1] < best[1]) ? item : best),
      null,
    );
    const payee = ranked.reduce<[string, number] | null>(
      (best, item) => (item[1] > 0 && (!best || item[1] > best[1]) ? item : best),
      null,
    );
    if (!payer || !payee) return graph;
    const amount = Math.min(-payer[1], payee[1]);
    setOwed(graph, payer[0], payee[0], amount);
    net.set(payer[0], payer[1] + amount);
    net.set(payee[0], payee[1] - amount);
  }
}

/**
 * The group's debts with fewer payments, for the same nets: nobody pays or
 * gets more in total. The fewest payments there can be, when each of them
 * can be paid along the group's bills as they stand (`settleDebt` records a
 * payment on the bills between the two); else the debts passed along, which
 * always can.
 */
export function simplifyDebts(open: readonly OpenShare[]): GroupDebt[] {
  return [...byCurrency(open)]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([currency, shares]) => {
      const pairs: Graph = new Map();
      for (const share of shares) addNet(pairs, share.from, share.to, cents(share.amount));
      const chained = debtsOf(passedAlong(pairs), currency);
      const fewest = debtsOf(fewestPayments(pairs), currency);
      const payable = fewest.every(
        (debt) =>
          moveAlong(owedOnBills(shares), debt.from, debt.to, cents(debt.amount)) ===
          cents(debt.amount),
      );
      return payable && fewest.length < chained.length ? fewest : chained;
    });
}

/**
 * `debt.from` paying `debt.to` up to `debt.amount`, as payments on the
 * group's bills. The money follows the debts between the two (straight, or
 * through the members in between, whose own books come out even), never more
 * than those debts carry. Then every circle of debts left is closed, since
 * nobody has to pay it. Empty when nothing is owed along the way.
 *
 * With `simplified` off the album lists each pair's own net, so the money
 * moves only along the debts between the two, and only the two's debts to
 * each other are set off: nobody else's line changes.
 */
export function settleDebt(
  open: readonly OpenShare[],
  debt: GroupDebt,
  { simplified = true }: { simplified?: boolean } = {},
): BillPayment[] {
  const shares = open.filter((share) => share.currency === debt.currency);
  // What the debts are to start with, and what can still move along each.
  const before = owedOnBills(shares);
  const room = owedOnBills(shares);
  const sent = simplified
    ? moveAlong(room, debt.from, debt.to, cents(debt.amount))
    : moveDirect(room, debt.from, debt.to, cents(debt.amount));
  if (sent === 0) return [];
  // What moved along each debt, and what is still owed on it.
  const paid: Graph = new Map();
  const still: Graph = new Map();
  for (const [from, row] of before) {
    for (const [to, amount] of row) {
      const moved = Math.max(0, amount - owed(room, from, to));
      setOwed(paid, from, to, moved);
      setOwed(still, from, to, amount - moved);
    }
  }
  const circleOf = simplified
    ? findCircle
    : (graph: Graph) =>
        owed(graph, debt.from, debt.to) > 0 && owed(graph, debt.to, debt.from) > 0
          ? [debt.from, debt.to, debt.from]
          : null;
  for (let circle = circleOf(still); circle; circle = circleOf(still)) {
    const amount = Math.min(...circle.slice(0, -1).map((m, i) => owed(still, m, circle[i + 1])));
    for (let i = 0; i + 1 < circle.length; i += 1) {
      const [from, to] = [circle[i], circle[i + 1]];
      setOwed(still, from, to, owed(still, from, to) - amount);
      setOwed(paid, from, to, owed(paid, from, to) + amount);
    }
  }
  // Each pair's payment goes onto their bills, the oldest first.
  const payments: BillPayment[] = [];
  for (const share of shares) {
    const amount = Math.min(cents(share.amount), owed(paid, share.from, share.to));
    if (amount <= 0) continue;
    setOwed(paid, share.from, share.to, owed(paid, share.from, share.to) - amount);
    payments.push({
      expenseId: share.expenseId,
      from: share.from,
      to: share.to,
      amount: amount / 100,
    });
  }
  return payments;
}
