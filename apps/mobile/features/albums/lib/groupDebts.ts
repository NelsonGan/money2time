/**
 * Who owes whom in a shared album's group. Pure: no database, no clock.
 *
 * The group's debts live on its bills: each member's share of a bill is owed
 * to the member who paid it, less the payments made on it, and a payment past
 * what was owed is owed back (`openShares`).
 * Everything here is derived from those, per currency, in cents:
 *
 * - `pairwiseDebts`: each pair's net. What the album shows as it is.
 * - `simplifyDebts`: the same nets as fewer payments ("Simplify group
 *   debts"), where nobody both owes and is owed (`planDebts`). Each of them
 *   can be paid along the group's bills, and paying one, or part of one,
 *   leaves every other one as it was.
 * - `settleDebt`: a payment between two members as payments on bills, which
 *   is all the group holds. A simplified debt has no bill of its own, so the
 *   money goes along the bills its plan set aside for it (A's share of B's
 *   bill, B's share of C's).
 * - `evenPayments`: what closes a group that came out even, whose open bills
 *   only go round in circles.
 */

import type { AlbumExpense, AlbumSettlement } from '~/types';

import { cents, settlementsByBill } from './albumGroup';

type Bill = Pick<
  AlbumExpense,
  'id' | 'date' | 'amount' | 'currency' | 'paidBy' | 'shares' | 'deletedAt'
>;
type Payment = Pick<
  AlbumSettlement,
  'id' | 'expenseId' | 'fromMember' | 'toMember' | 'amount' | 'date' | 'createdAt' | 'deletedAt'
> &
  Partial<Pick<AlbumSettlement, 'currency'>>;

/** What one member still owes another on one bill. */
interface OpenShare {
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
interface BillPayment {
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
export function openShares(
  expenses: readonly Bill[],
  settlements: readonly Payment[],
): OpenShare[] {
  const open: OpenShare[] = [];
  const paid = settlementsByBill(settlements);
  const bills = expenses
    .filter((bill) => !bill.deletedAt || paid.has(bill.id))
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.id < b.id ? -1 : 1));
  for (const bill of bills) {
    // The bill's own currency first; a payment in another one (the bill's
    // currency was changed after it) sets nothing off and is owed back in its
    // own, as on a deleted bill.
    const graphs = new Map<string, Graph>([[bill.currency, new Map()]]);
    const graphOf = (currency: string): Graph => {
      const known = graphs.get(currency);
      if (known) return known;
      const graph: Graph = new Map();
      graphs.set(currency, graph);
      return graph;
    };
    if (!bill.deletedAt) {
      for (const share of bill.shares) {
        if (share.memberId === bill.paidBy) continue;
        addNet(graphOf(bill.currency), share.memberId, bill.paidBy, cents(share.amount));
      }
    }
    for (const payment of paid.get(bill.id) ?? []) {
      addNet(
        graphOf(payment.currency || bill.currency),
        payment.toMember,
        payment.fromMember,
        Math.max(0, cents(payment.amount)),
      );
    }
    const currencies = [
      bill.currency,
      ...[...graphs.keys()].filter((currency) => currency !== bill.currency).sort(),
    ];
    for (const currency of currencies) {
      for (const debt of debtsOf(graphs.get(currency)!, currency)) {
        open.push({ expenseId: bill.id, ...debt });
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

/** Each debt along `path` (members in order) changed by `amount` in `graph`. */
function addAlong(graph: Graph, path: readonly string[], amount: number): void {
  for (let i = 0; i + 1 < path.length; i += 1) {
    setOwed(graph, path[i], path[i + 1], owed(graph, path[i], path[i + 1]) + amount);
  }
}

/** The smallest debt along `path` (members in order). */
const leastAlong = (graph: Graph, path: readonly string[]) =>
  Math.min(...path.slice(0, -1).map((member, i) => owed(graph, member, path[i + 1])));

const copyGraph = (graph: Graph): Graph =>
  new Map([...graph].map(([from, row]) => [from, new Map(row)]));

/** Every debt in a graph, as (who owes, whom), in an order every phone agrees on. */
const edgesOf = (graph: Graph): [string, string][] =>
  [...graph.keys()]
    .sort()
    .flatMap((from) =>
      [...graph.get(from)!.keys()].sort().map((to): [string, string] => [from, to]),
    );

/** Each member's net in cents: what they are owed above zero, what they owe below. */
function netsOf(graph: Graph): Map<string, number> {
  const net = new Map<string, number>();
  for (const [from, to] of edgesOf(graph)) {
    net.set(from, (net.get(from) ?? 0) - owed(graph, from, to));
    net.set(to, (net.get(to) ?? 0) + owed(graph, from, to));
  }
  return net;
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
    const amount = Math.min(left, leastAlong(room, path));
    for (let i = 0; i + 1 < path.length; i += 1) {
      setOwed(room, path[i], path[i + 1], owed(room, path[i], path[i + 1]) - amount);
      setOwed(room, path[i + 1], path[i], owed(room, path[i + 1], path[i]) + amount);
    }
    left -= amount;
  }
  return limit - left;
}

/**
 * Up to `limit` from `from` to `to` along the debts in `room` (left as it
 * is): how much of each of those debts it takes. The money may go through
 * members in between, whose own books come out even; none of it goes round
 * in a circle.
 */
function flowAlong(
  room: Graph,
  from: string,
  to: string,
  limit: number,
): { flow: Graph; amount: number } {
  const left = copyGraph(room);
  const amount = moveAlong(left, from, to, limit);
  const flow: Graph = new Map();
  for (const [a, b] of edgesOf(room)) {
    const moved = owed(room, a, b) - owed(left, a, b);
    if (moved > 0) setOwed(flow, a, b, moved);
  }
  for (let circle = findCircle(flow); circle; circle = findCircle(flow)) {
    addAlong(flow, circle, -leastAlong(flow, circle));
  }
  return { flow, amount };
}

/** A simplified debt, and what pays it: how much of each debt on the bills it takes. */
interface PlannedDebt {
  from: string;
  to: string;
  /** In cents. */
  amount: number;
  route: Graph;
}

/**
 * A currency's simplified debts, and what is left on its bills once they are
 * all paid: debts that only go round in circles, which nobody has to pay.
 */
interface DebtPlan {
  debts: PlannedDebt[];
  circles: Graph;
}

/**
 * The simplified debts in a fixed order: each member who owes, by id, pays
 * each member owed, by id, as much as the one still owes, the other is still
 * owed, and the bills can carry from one to the other once the debts before
 * it took their part. Nobody in the
 * middle: whoever owes only pays, whoever is owed only gets paid. Whoever
 * still owes can always reach someone still owed along what is left, so
 * everyone's net is paid.
 *
 * The order never depends on how much anyone owes, so paying a debt, or part
 * of it, along its own route leaves every other debt as it was: the debts
 * before it are made from the same, and after it its two members have each
 * that much less, as the debt between them does.
 */
function fixedOrderPlan(onBills: Graph): DebtPlan {
  const room = copyGraph(onBills);
  const net = netsOf(onBills);
  const owing = [...net.keys()].filter((member) => net.get(member)! < 0).sort();
  const owedTo = [...net.keys()].filter((member) => net.get(member)! > 0).sort();
  const debts: PlannedDebt[] = [];
  for (const from of owing) {
    for (const to of owedTo) {
      const want = Math.min(-net.get(from)!, net.get(to)!);
      if (want <= 0) continue;
      const { flow, amount } = flowAlong(room, from, to, want);
      if (amount <= 0) continue;
      for (const [a, b] of edgesOf(flow)) setOwed(room, a, b, owed(room, a, b) - owed(flow, a, b));
      net.set(from, net.get(from)! + amount);
      net.set(to, net.get(to)! - amount);
      debts.push({ from, to, amount, route: flow });
    }
  }
  return { debts, circles: room };
}

/**
 * A currency's simplified debts (`fixedOrderPlan`). Usually as few as, or
 * fewer than, each pair's own; in a rare sparse group a line or two more,
 * since keeping every other line still and nobody in the middle come first
 * (a switch to each pair's own debts would break both). Not always the fewest
 * there could be: that is a far harder problem, and its answer would change
 * under every payment.
 */
function planDebts(shares: readonly OpenShare[]): DebtPlan {
  return fixedOrderPlan(owedOnBills(shares));
}

/**
 * The group's debts with fewer payments, for the same nets: nobody pays or
 * gets more in total, and nobody both owes and is owed (`planDebts`).
 */
export function simplifyDebts(open: readonly OpenShare[]): GroupDebt[] {
  return [...byCurrency(open)]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .flatMap(([currency, shares]) => {
      const graph: Graph = new Map();
      for (const debt of planDebts(shares).debts) setOwed(graph, debt.from, debt.to, debt.amount);
      return debtsOf(graph, currency);
    });
}

/** `amount` of a route from `from` to `to`, taken path by path, shortest first. */
function partOf(route: Graph, from: string, to: string, amount: number): Graph {
  const left = copyGraph(route);
  const part: Graph = new Map();
  for (let rest = amount; rest > 0; ) {
    const path = findPath(left, from, to);
    if (!path) break;
    const step = Math.min(rest, leastAlong(left, path));
    addAlong(left, path, -step);
    addAlong(part, path, step);
    rest -= step;
  }
  return part;
}

/**
 * Closes, into `paid`, the circles of `circles` that run along a pair the
 * money in `paid` moved between: what nobody has to pay on the bills just
 * paid goes with it. Other circles are left for the group's last payment
 * (`evenPayments`), so every act stays the size of what it pays.
 */
function closeAlong(circles: Graph, paid: Graph): void {
  const touched = new Set(edgesOf(paid).flatMap(([a, b]) => [`${a}>${b}`, `${b}>${a}`]));
  for (;;) {
    let circle: string[] | null = null;
    for (const [a, b] of edgesOf(circles)) {
      if (!touched.has(`${a}>${b}`)) continue;
      const back = findPath(circles, b, a);
      if (back) {
        circle = [a, ...back];
        break;
      }
    }
    if (!circle) return;
    const amount = leastAlong(circles, circle);
    addAlong(circles, circle, -amount);
    addAlong(paid, circle, amount);
  }
}

/** What moves along each debt (`paid`, in cents) as payments on the bills, the oldest first. */
function onBillsOf(shares: readonly OpenShare[], paid: Graph): BillPayment[] {
  const left = copyGraph(paid);
  const payments: BillPayment[] = [];
  for (const share of shares) {
    const amount = Math.min(cents(share.amount), owed(left, share.from, share.to));
    if (amount <= 0) continue;
    setOwed(left, share.from, share.to, owed(left, share.from, share.to) - amount);
    payments.push({
      expenseId: share.expenseId,
      from: share.from,
      to: share.to,
      amount: amount / 100,
    });
  }
  return payments;
}

/** The payments for as much of `most` (in cents) as fit in `maxRows`: all of it when it fits. */
function asMuchAsFits(
  most: number,
  paymentsFor: (amount: number) => BillPayment[],
  maxRows: number,
): BillPayment[] {
  const all = paymentsFor(most);
  if (all.length <= maxRows) return all;
  // More money never takes fewer bills, so the most that fits is found by halving.
  let fits: BillPayment[] = [];
  for (let low = 0, high = most - 1; low < high; ) {
    const middle = Math.ceil((low + high) / 2);
    const payments = paymentsFor(middle);
    if (payments.length <= maxRows) {
      low = middle;
      fits = payments;
    } else {
      high = middle - 1;
    }
  }
  return fits;
}

/**
 * `debt.from` paying `debt.to` up to `debt.amount`, as payments on the
 * group's bills: along the bills its simplified debt was planned on
 * (`planDebts`), through the members in between, whose own books come out
 * even, and never more than that debt. Circles of what nobody has to pay that
 * run along the bills just paid close with it (`closeAlong`). Empty when the
 * two have no such debt.
 *
 * With `simplified` off the album lists each pair's own net, so the money
 * moves only along the debts between the two, and only the two's debts to
 * each other are set off: nobody else's line changes.
 *
 * At most `maxRows` payments: past that, as much of it as fits, and the rest
 * is paid by another act (the planner takes `MAX_WRITE_ROWS` rows at once).
 * What it pays is what the payer's payments come to (`paidFrom`).
 */
export function settleDebt(
  open: readonly OpenShare[],
  debt: GroupDebt,
  { simplified = true, maxRows = Infinity }: { simplified?: boolean; maxRows?: number } = {},
): BillPayment[] {
  const shares = open.filter((share) => share.currency === debt.currency);
  const want = cents(debt.amount);
  if (!(want > 0)) return [];
  if (simplified) {
    const plan = planDebts(shares);
    const planned = plan.debts.find((item) => item.from === debt.from && item.to === debt.to);
    if (!planned) return [];
    const paidFor = (amount: number, close: boolean) => {
      const paid = partOf(planned.route, debt.from, debt.to, amount);
      if (close) closeAlong(copyGraph(plan.circles), paid);
      return onBillsOf(shares, paid);
    };
    const most = Math.min(want, planned.amount);
    const closed = paidFor(most, true);
    return closed.length <= maxRows
      ? closed
      : asMuchAsFits(most, (amount) => paidFor(amount, false), maxRows);
  }
  const onBills = owedOnBills(shares);
  const most = Math.min(want, owed(onBills, debt.from, debt.to));
  if (most <= 0) return [];
  const paidFor = (amount: number, close: boolean) => {
    const paid: Graph = new Map();
    // The two's debts to each other set off: what is then owed both ways closes.
    const back = close
      ? Math.min(owed(onBills, debt.from, debt.to) - amount, owed(onBills, debt.to, debt.from))
      : 0;
    setOwed(paid, debt.from, debt.to, amount + back);
    setOwed(paid, debt.to, debt.from, back);
    return onBillsOf(shares, paid);
  };
  const closed = paidFor(most, true);
  return closed.length <= maxRows
    ? closed
    : asMuchAsFits(most, (amount) => paidFor(amount, false), maxRows);
}

/** What `member` paid out, less what they got, over `payments`: what an act of theirs paid. */
export function paidFrom(
  payments: readonly { from: string; to: string; amount: number }[],
  member: string,
): number {
  const total = payments.reduce(
    (sum, payment) =>
      sum +
      (payment.from === member ? cents(payment.amount) : 0) -
      (payment.to === member ? cents(payment.amount) : 0),
    0,
  );
  return total / 100;
}

/**
 * A group where nobody owes anything on balance (`simplifyDebts` lists
 * nothing) has nothing left to pay: what is still open on its bills only goes
 * round in circles. These close it: every open share, or, past `maxRows`, as
 * many whole circles as fit (the rest closes with the next call, and the
 * group stays even in between). Empty when nothing is open.
 */
export function evenPayments(open: readonly OpenShare[], maxRows = Infinity): OpenShare[] {
  if (open.length <= maxRows) return open.map((share) => ({ ...share }));
  const closing: OpenShare[] = [];
  for (const [currency, shares] of [...byCurrency(open)].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const left = owedOnBills(shares);
    let paid: Graph = new Map();
    let payments: BillPayment[] = [];
    let full = false;
    for (let circle = findCircle(left); circle; circle = findCircle(left)) {
      const amount = leastAlong(left, circle);
      const next = copyGraph(paid);
      addAlong(next, circle, amount);
      const nextPayments = onBillsOf(shares, next);
      if (closing.length + nextPayments.length > maxRows) {
        if (!payments.length && !closing.length) {
          // One circle alone is too long: as much of it as fits.
          const base = paid;
          const ring = circle;
          payments = asMuchAsFits(
            amount,
            (part) => {
              const some = copyGraph(base);
              addAlong(some, ring, part);
              return onBillsOf(shares, some);
            },
            maxRows,
          );
        }
        full = true;
        break;
      }
      paid = next;
      payments = nextPayments;
      addAlong(left, circle, -amount);
    }
    closing.push(...payments.map((payment) => ({ ...payment, currency })));
    if (full) break;
  }
  return closing;
}
