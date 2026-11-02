import { LEDGER_COPY_NEEDS, type LedgerCopyPart } from '~/lib/db/ledgerCopy';
import type { MonthCycle } from '~/types';

/**
 * What the New ledger editor chooses to copy, as pure rules: the screen draws
 * them and `createLedger` gets their result, so the two cannot disagree. The
 * counts come from `readLedgerCopySource`.
 */

/** What a new ledger would get from copying a ledger, for the editor's captions. */
export interface LedgerCopySource {
  /**
   * What each part would copy. Recurring is the most it can be: a rule comes
   * along only with the accounts it names (`copiedCount`).
   */
  counts: Record<LedgerCopyPart, number>;
  /** The parts each copyable recurring rule needs (accounts, goals, loans). */
  recurringNeeds: readonly (readonly LedgerCopyPart[])[];
  /** The source's month cycle: its start day and customized months. */
  monthCycle: MonthCycle;
  /** The source's currency: an "Everything" copy keeps it. */
  currency: { code: string; symbol: string };
}

/** What a new ledger copies unless the user says otherwise: today's setup, no plans. */
export const DEFAULT_COPY_PARTS: readonly LedgerCopyPart[] = ['accounts', 'categories'];

/** Parts that start with the starter set rather than nothing when not copied. */
export const PARTS_WITH_STARTERS: ReadonlySet<LedgerCopyPart> = new Set(['accounts', 'categories']);

/** `parts` with `part` turned on (with what it needs) or off (with what needs it). */
export function toggleCopyPart(
  parts: ReadonlySet<LedgerCopyPart>,
  part: LedgerCopyPart,
  on: boolean,
): ReadonlySet<LedgerCopyPart> {
  const next = new Set(parts);
  if (on) {
    next.add(part);
    for (const need of LEDGER_COPY_NEEDS[part] ?? []) next.add(need);
    return next;
  }
  next.delete(part);
  for (const [other, needs] of Object.entries(LEDGER_COPY_NEEDS)) {
    if (needs.includes(part)) next.delete(other as LedgerCopyPart);
  }
  return next;
}

/** How many rows `part` copies with `parts` chosen: a rule needs its accounts along. */
export function copiedCount(
  part: LedgerCopyPart,
  source: LedgerCopySource,
  parts: ReadonlySet<LedgerCopyPart>,
): number {
  if (part !== 'recurring') return source.counts[part];
  return source.recurringNeeds.filter((needs) => needs.every((need) => parts.has(need))).length;
}

/** One row of the editor's Start with card. */
export interface CopyPartRow {
  /** The switch: on while the part is chosen and the source has some. */
  on: boolean;
  /** Greyed out: covered by Everything, or the source has none. */
  disabled: boolean;
  /** How many rows the caption names. */
  count: number;
  /**
   * The caption: `copy` names the count, `noneCopied` a chosen recurring part
   * whose rules all need parts left out, `noneInSource` a source without any,
   * `starters` the starter set, `empty` a part left out.
   */
  caption: 'copy' | 'noneCopied' | 'noneInSource' | 'starters' | 'empty';
}

export function copyPartRow(
  part: LedgerCopyPart,
  source: LedgerCopySource | null,
  parts: ReadonlySet<LedgerCopyPart>,
  everything: boolean,
): CopyPartRow {
  const available = source?.counts[part] ?? 0;
  if (everything) {
    return {
      on: true,
      disabled: true,
      count: available,
      caption: available > 0 ? 'copy' : 'noneInSource',
    };
  }
  const on = parts.has(part) && available > 0;
  const count = on && source ? copiedCount(part, source, parts) : available;
  const offCaption = PARTS_WITH_STARTERS.has(part)
    ? 'starters'
    : available > 0
      ? 'empty'
      : 'noneInSource';
  return {
    on,
    disabled: available === 0,
    count,
    caption: on ? (count > 0 ? 'copy' : 'noneCopied') : offCaption,
  };
}

/** The parts to copy: the chosen ones that would copy something. */
export function partsToCopy(
  parts: ReadonlySet<LedgerCopyPart>,
  source: LedgerCopySource | null,
): LedgerCopyPart[] {
  if (!source) return [];
  return [...parts].filter((part) => copyPartRow(part, source, parts, false).count > 0);
}
