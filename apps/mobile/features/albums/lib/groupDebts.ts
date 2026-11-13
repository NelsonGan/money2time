/**
 * Who owes whom in a shared album's group. Pure: no database, no clock.
 *
 * The group's debts live on its bills: each member's share of a bill is owed
 * to the member who paid it, less the payments made on it (`openShares`).
 * Everything here is derived from those, per currency, in cents:
 *
 * - `pairwiseDebts`: each pair's net. What the album shows as it is.
 * - `simplifyDebts`: the same nets with fewer payments ("Simplify group
 *   debts"): the fewest, when the group's bills can carry each of them, else
 *   debts passed along a chain (A owes B and B owes C, so A owes C) until
 *   nobody both owes and is owed.
 * - `settleDebt`: a payment between two members as payments on bills, which
 *   is all the group holds. A simplified debt has no bill of its own, so the
 *   money is routed along the bills between the two (A's share of B's bill,
 *   B's share of C's), and debts left going round in a circle, which nobody
 *   has to pay, are closed with it.
 */

import type { AlbumExpense, AlbumSettlement } from '~/types';

import { cents, settlementsByBill, shareLeft } from './albumGroup';

type Bill = Pick<
  AlbumExpense,
  'id' | 'date' | 'amount' | 'currency' | 'paidBy' | 'shares' | 'deletedAt'
>;
type Payment = Pick<
  AlbumSettlement,
  'id' | 'expenseId' | 'fromMember' | 'toMember' | 'amount' | 'date' | 'createdAt' | 'deletedAt'
>;

/** What one member still owes another on one bill. */
interface OpenShare {
  expenseId: string;
  /** The member who owes. */
  from: string;
  /** The member who paid the bill. */
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
interface BillPayment {
  expenseId: string;
  from: string;
  to: string;
  amount: number;
}

/** Every share of the group's standing bills that is still owed, oldest bill first. */
export function openShares(
  expenses: readonly Bill[],
  settlements: readonly Payment[],
): OpenShare[] {
  const open: OpenShare[] = [];
  const paid = settlementsByBill(settlements);
  const bills = expenses
    .filter((bill) => !bill.deletedAt)
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : 1));
  for (const bill of bills) {
    const shares = new Map<string, number>();
    for (const share of bill.shares) {
      shares.set(share.memberId, (shares.get(share.memberId) ?? 0) + share.amount);
    }
    for (const [memberId, share] of shares) {
      if (memberId === bill.paidBy) continue;
      const amount = shareLeft(bill, paid.get(bill.id) ?? [], memberId, bill.paidBy, share);
      if (amount > 0) {
        open.push({
          expenseId: bill.id,
          from: memberId,
          to: bill.paidBy,
          currency: bill.currency,
          amount,
        });
      }
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
 */
export function settleDebt(open: readonly OpenShare[], debt: GroupDebt): BillPayment[] {
  const shares = open.filter((share) => share.currency === debt.currency);
  // What the debts are to start with, and what can still move along each.
  const before = owedOnBills(shares);
  const room = owedOnBills(shares);
  if (moveAlong(room, debt.from, debt.to, cents(debt.amount)) === 0) return [];
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
  for (let circle = findCircle(still); circle; circle = findCircle(still)) {
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
