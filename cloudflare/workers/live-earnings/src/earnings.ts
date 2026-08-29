/**
 * The session maths, ported from the app.
 *
 * Deliberately a PORT rather than a shared package: the Worker is a separate
 * TypeScript project with its own tsconfig (the app's excludes `cloudflare/`),
 * and wiring a shared build for four small functions would cost more than it
 * saves. What keeps the two honest is a contract test in the app's suite -
 * `__tests__/services/liveEarningsPushContract.test.ts` imports THIS file and
 * the app's own helpers and asserts they agree, so a change to either side
 * that drifts fails `npm test`.
 *
 * Nothing here touches Date.now() or any Worker API, which is what lets that
 * test import it at all.
 *
 * Mirrors:
 *   formatMoney  <- utils/formatters.ts            formatCurrency
 *   earnedByNow  <- features/widgets/lib/liveEarnings.ts  earnedByNow
 */

export const MS_PER_HOUR = 60 * 60 * 1000;

export interface EarningsSession {
  /** Epoch ms the session started accruing at. */
  startedAt: number;
  /** Epoch ms the session stops accruing at. */
  endsAt: number;
  /** True hourly rate, in the reporting currency. */
  hourlyRate: number;
}

/** Milliseconds accrued by `now`, clamped to the session's own bounds. */
function elapsedMs(session: EarningsSession, now: number): number {
  const { startedAt, endsAt } = session;
  if (!Number.isFinite(startedAt) || !Number.isFinite(endsAt) || endsAt <= startedAt) return 0;
  const capped = Math.min(Math.max(now, startedAt), endsAt);
  return capped - startedAt;
}

/** Money earned so far. Never negative, never past the session's full value. */
export function earnedByNow(session: EarningsSession, now: number): number {
  const rate = session.hourlyRate;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return (elapsedMs(session, now) / MS_PER_HOUR) * rate;
}

export function isSessionOver(session: EarningsSession, now: number): boolean {
  return now >= session.endsAt;
}

/**
 * "RM1,234.56". Thousands-grouped, always two decimals, symbol prefixed.
 *
 * The card's amount has to be formatted somewhere, and it cannot be here-or-
 * there: the app formats the figure it pushes on foreground, the Worker
 * formats the ones it pushes in between, and a user must never see the number
 * change shape depending on which one got there last. Hence the port and the
 * contract test.
 */
export function formatMoney(amount: number, currencySymbol = '$'): string {
  const [intPart, decPart] = Math.abs(amount).toFixed(2).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currencySymbol}${grouped}.${decPart}`;
}
