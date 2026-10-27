import type { BudgetPeriod } from '~/types';

/** Outermost first: the year, then the month, then the week. */
export const RING_ORDER: BudgetPeriod[] = ['year', 'month', 'week'];
export const RING_STROKE = 17;
const RING_GAP = 3;

/** The radius of the ring at `index` (0 = outermost) in a `size`-wide drawing. */
export function ringRadius(index: number, size: number): number {
  return size / 2 - RING_STROKE / 2 - index * (RING_STROKE + RING_GAP);
}

/**
 * The period whose ring a tap `distance` from the centre lands on, among the
 * periods drawn, or null between or inside the rings. Each ring takes its
 * stroke plus half the gap on either side.
 */
export function ringAtDistance(
  distance: number,
  size: number,
  drawn: BudgetPeriod[],
): BudgetPeriod | null {
  for (const [index, period] of RING_ORDER.entries()) {
    if (!drawn.includes(period)) continue;
    if (Math.abs(distance - ringRadius(index, size)) <= (RING_STROKE + RING_GAP) / 2) {
      return period;
    }
  }
  return null;
}
