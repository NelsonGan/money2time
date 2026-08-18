import type { GoalPace, GoalProgress, RecurringTransactionRule } from '~/types';
import { dayKeyFromIsoLocal } from '~/utils/formatters';
import { DAYS_PER_MONTH, monthlyEquivalentInflowRate } from '~/utils/recurringRates';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface GoalMathInput {
  /** Current account balance in the goal's currency (may be negative). */
  balance: number;
  /** Balance the goal was created with; anchors the expected pace line. */
  startingBalance: number;
  /** Goal target amount, > 0. */
  target: number;
  /** Account createdAt (ISO). */
  createdAt: string;
  /** Optional deadline (YYYY-MM-DD). */
  targetDate: string | null;
  /** Persisted achievement stamp; treated as achieved regardless of balance. */
  achievedAt: string | null;
  /** Monthly-equivalent auto-save rate in the goal currency, or null. */
  monthlyRate: number | null;
  /** The evaluation date (YYYY-MM-DD or ISO); injected so the math stays pure. */
  todayIso: string;
}

function toUtcDayMs(dateIso: string): number {
  // Normalize both bare day keys and full ISO stamps to a UTC day boundary so
  // elapsed/total ratios never wobble with the device timezone.
  const dayKey = dateIso.length > 10 ? dayKeyFromIsoLocal(dateIso) : dateIso;
  return Date.parse(`${dayKey}T00:00:00Z`);
}

function addDaysAsDayKey(fromMs: number, days: number): string {
  // Stay in UTC end-to-end (toUtcDayMs anchors at UTC midnight) so the
  // rendered day never shifts with the device timezone.
  const date = new Date(fromMs + Math.ceil(days) * MS_PER_DAY);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/**
 * Monthly-equivalent auto-save rate paying into the goal, in the goal's
 * currency. Thin alias over the shared inflow helper, which loans use too.
 */
export function monthlyEquivalentRate(
  rules: RecurringTransactionRule[],
  goalAccountId: string,
): number | null {
  return monthlyEquivalentInflowRate(rules, goalAccountId);
}

/** Whether the goal counts as achieved: stamped, or balance at/over target. */
export function isGoalAchieved(input: Pick<GoalMathInput, 'balance' | 'target' | 'achievedAt'>) {
  // A non-positive target (unreachable via the editor, but possible in
  // hand-imported data) must not read as trivially achieved.
  return input.achievedAt != null || (input.target > 0 && input.balance >= input.target);
}

/**
 * Pace against the target date. The expected line is starting-balance
 * adjusted so a goal created part-funded is not scored as ahead:
 * expected(t) = S + (T - S) * elapsed(created -> t) / total(created -> date).
 */
function computePace(input: GoalMathInput): GoalPace | null {
  if (isGoalAchieved(input)) return 'achieved';
  if (!input.targetDate) return null;

  const createdMs = toUtcDayMs(input.createdAt);
  const targetMs = toUtcDayMs(input.targetDate);
  const todayMs = toUtcDayMs(input.todayIso);
  const total = targetMs - createdMs;
  // A window that never existed (date at/before creation) or has fully passed
  // without achievement is behind by definition.
  if (total <= 0 || todayMs >= targetMs) return 'behind';

  const elapsed = Math.min(Math.max(todayMs - createdMs, 0), total);
  const expected =
    input.startingBalance + (input.target - input.startingBalance) * (elapsed / total);
  return input.balance >= expected ? 'onTrack' : 'behind';
}

export function computeGoalProgress(input: GoalMathInput): GoalProgress {
  const target = input.target;
  const ratio = target > 0 ? Math.max(0, input.balance) / target : 0;
  const achieved = isGoalAchieved(input);
  const remaining = target - input.balance;

  let projectedDate: string | null = null;
  if (!achieved && input.monthlyRate != null && input.monthlyRate > 0 && remaining > 0) {
    const daysLeft = (remaining / input.monthlyRate) * DAYS_PER_MONTH;
    projectedDate = addDaysAsDayKey(toUtcDayMs(input.todayIso), daysLeft);
  }

  let requiredMonthly: number | null = null;
  if (!achieved && input.targetDate && remaining > 0) {
    const monthsRemaining =
      (toUtcDayMs(input.targetDate) - toUtcDayMs(input.todayIso)) / MS_PER_DAY / DAYS_PER_MONTH;
    // With no time left, the required pace is simply everything that remains.
    requiredMonthly = monthsRemaining > 0 ? remaining / monthsRemaining : remaining;
  }

  return {
    saved: input.balance,
    target,
    ratio,
    pace: computePace(input),
    monthlyRate: input.monthlyRate,
    projectedDate,
    requiredMonthly,
  };
}
