/**
 * How a bill's editor turns what is entered into each person's share, as the
 * app's Split Bill does (`features/transactions/lib/splitMethods.ts`): evenly,
 * by amount, by percentage, by shares, or evenly with adjustments. Only
 * amounts are ever saved; the methods are ways of filling them in. All sums
 * are in cents, the odd cents going to the user first. Pure.
 */

import type { Share } from "./group";

export type SplitMethod = "even" | "amount" | "percent" | "shares" | "adjust";

const toCents = (value: number): number => (Number.isFinite(value) ? Math.round(value * 100) : 0);

/**
 * The number a typed value reads as; blank or invalid is 0. A lone `,` is a
 * decimal mark ("12,50"). With both marks, the last one is the decimal mark
 * and the other groups thousands ("1,234.50", "1.234,50").
 */
export function readValue(value: string | undefined): number {
  const text = (value ?? "").trim();
  const dot = text.lastIndexOf(".");
  const comma = text.lastIndexOf(",");
  const normalized = dot >= 0 && comma >= 0 ? (comma > dot ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "")) : text.replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** A number as a field shows it: at most two decimals, no trailing zeros. */
export function trimNumber(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

/** `cents` over `count` people as evenly as cents allow, the odd cents starting at `prefer`. */
function evenCents(cents: number, count: number, prefer = 0): number[] {
  if (count <= 0) return [];
  const sign = cents < 0 ? -1 : 1;
  const abs = Math.abs(cents);
  const base = Math.floor(abs / count);
  let leftover = abs - base * count;
  const result = Array.from({ length: count }, () => base);
  const order = result.map((_, i) => i).sort((a, b) => (a === prefer ? -1 : b === prefer ? 1 : a - b));
  for (const index of order) {
    if (leftover <= 0) break;
    result[index] += 1;
    leftover -= 1;
  }
  return result.map((value) => value * sign);
}

/**
 * `weights` scaled to `targetCents` in whole cents, the leftover cents going to
 * the largest remainders (ties to `prefer`, then the lower index). All zero
 * splits the target evenly (the app's `scaleToTarget`).
 */
function scaleCents(weights: readonly number[], targetCents: number, prefer = 0): number[] {
  if (targetCents < 0 || weights.length === 0) return weights.map(() => 0);
  const units = weights.map((value) => Math.max(0, toCents(value)));
  const sum = units.reduce((acc, value) => acc + value, 0);
  if (sum === 0) return evenCents(targetCents, weights.length, prefer);
  const priority = (index: number) => (index === prefer ? -1 : index);
  const exact = units.map((value) => (value * targetCents) / sum);
  const floors = exact.map(Math.floor);
  let leftover = targetCents - floors.reduce((acc, value) => acc + value, 0);
  const order = exact.map((value, index) => ({ index, frac: value - Math.floor(value) })).sort((a, b) => b.frac - a.frac || priority(a.index) - priority(b.index));
  for (const { index } of order) {
    if (leftover <= 0) break;
    floors[index] += 1;
    leftover -= 1;
  }
  return floors;
}

/** Why a split cannot be saved as entered; null when it can. Amounts are in cents. */
export type SplitProblem =
  | { kind: "nobody" }
  | { kind: "amount_left"; cents: number }
  | { kind: "amount_over"; cents: number }
  | { kind: "percent"; given: number }
  | { kind: "no_shares" }
  | { kind: "adjust_over" };

export type SplitInput = {
  method: SplitMethod;
  /** The bill's total, in cents. */
  totalCents: number;
  /** Who is on the bill, in the order they are listed. */
  people: readonly string[];
  /** What was typed per person for the method (amount, percentage, shares or adjustment). */
  values: Readonly<Record<string, string>>;
  /** The user's own member: odd cents go to them first. */
  selfId: string | null;
};

/** Each person's share in cents, in `people` order, from what was typed. */
export function splitCents({ method, totalCents, people, values, selfId }: SplitInput): number[] {
  const prefer = Math.max(0, people.indexOf(selfId ?? ""));
  const typed = people.map((id) => readValue(values[id]));
  switch (method) {
    case "even":
      return evenCents(totalCents, people.length, prefer);
    case "amount":
      return typed.map((value) => Math.max(0, toCents(value)));
    case "percent": {
      const given = typed.reduce((sum, value) => sum + toCents(value), 0);
      if (given === 10000) return scaleCents(typed, totalCents, prefer);
      return typed.map((value) => Math.max(0, Math.round((totalCents * value) / 100)));
    }
    case "shares":
      return scaleCents(typed, totalCents, prefer);
    case "adjust": {
      const adjustments = typed.map(toCents);
      const rest = totalCents - adjustments.reduce((sum, value) => sum + value, 0);
      const even = evenCents(rest, people.length, prefer);
      return adjustments.map((value, index) => value + (even[index] ?? 0));
    }
  }
}

/** The shares to save, people with nothing left out; and what stops saving, if anything. */
export function splitShares(input: SplitInput): { shares: Share[]; problem: SplitProblem | null } {
  const { method, totalCents, people, values } = input;
  if (people.length === 0) return { shares: [], problem: { kind: "nobody" } };
  const amounts = splitCents(input);
  const shares = people.flatMap((memberId, index) => (amounts[index] > 0 ? [{ memberId, amount: amounts[index] / 100 }] : []));
  let problem: SplitProblem | null = null;
  if (method === "amount") {
    const diff = totalCents - amounts.reduce((sum, value) => sum + value, 0);
    if (diff > 0) problem = { kind: "amount_left", cents: diff };
    if (diff < 0) problem = { kind: "amount_over", cents: -diff };
  } else if (method === "percent") {
    const given = people.reduce((sum, id) => sum + toCents(readValue(values[id])), 0);
    if (given !== 10000) problem = { kind: "percent", given: given / 100 };
  } else if (method === "shares") {
    if (!people.some((id) => readValue(values[id]) > 0)) problem = { kind: "no_shares" };
  } else if (method === "adjust") {
    if (amounts.some((value) => value < 0)) problem = { kind: "adjust_over" };
  }
  if (!problem && totalCents > 0 && shares.length === 0) problem = { kind: "nobody" };
  return { shares, problem };
}

/**
 * Values that keep the current split when the method changes, as far as the
 * method can: amounts as they are, percentages of the bill (adding up to
 * exactly 100), one share each, or each person's difference from an even
 * split (the app's `initialMethodValues`).
 */
export function valuesFor(method: SplitMethod, current: SplitInput): Record<string, string> {
  const { people, totalCents, selfId } = current;
  const prefer = Math.max(0, people.indexOf(selfId ?? ""));
  const amounts = splitCents(current).map((value) => Math.max(0, value));
  const out: Record<string, string> = {};
  if (method === "amount") {
    people.forEach((id, index) => (out[id] = trimNumber(amounts[index] / 100)));
  } else if (method === "percent") {
    const usable = totalCents > 0 && amounts.some((value) => value > 0);
    scaleCents(usable ? amounts : amounts.map(() => 0), 10000, prefer).forEach((value, index) => (out[people[index]] = trimNumber(value / 100)));
  } else if (method === "shares") {
    people.forEach((id) => (out[id] = "1"));
  } else if (method === "adjust") {
    const even = evenCents(totalCents, people.length, prefer);
    people.forEach((id, index) => (out[id] = trimNumber((amounts[index] - even[index]) / 100)));
  }
  return out;
}

/**
 * Amounts or percentages after one was typed for someone else: the user's own
 * row takes what is left of the bill (or of 100%), never below 0, as in the
 * app. Typing the user's own changes nothing else.
 */
export function balanceSelf(input: SplitInput, changedId: string): Record<string, string> {
  const { method, people, values, selfId, totalCents } = input;
  if ((method !== "amount" && method !== "percent") || !selfId || changedId === selfId || !people.includes(selfId)) return { ...values };
  const whole = method === "amount" ? totalCents : 10000;
  const others = people.filter((id) => id !== selfId).reduce((sum, id) => sum + Math.max(0, toCents(readValue(values[id]))), 0);
  return { ...values, [selfId]: trimNumber(Math.max(0, whole - others) / 100) };
}

/** A bill's shares as values for the editor: even when they are (to a cent), else amounts. */
export function methodOf(shares: readonly Share[]): SplitMethod {
  const amounts = shares.map((share) => toCents(share.amount));
  return amounts.length > 0 && Math.max(...amounts) - Math.min(...amounts) <= 1 ? "even" : "amount";
}
