import type { GoalDeadlineStatus, GoalStats } from '~/types';
import { amountToHoursByRate } from '~/utils/formatters';

const MS_PER_DAY = 86_400_000;

/**
 * Whole-day count between two `YYYY-MM-DD` day keys (`end − start`). Uses UTC so
 * daylight-saving transitions never shift the count. Returns 0 for invalid or
 * inverted ranges.
 */
export function daysBetweenDayKeys(startKey: string, endKey: string): number {
  const start = Date.parse(`${startKey}T00:00:00Z`);
  const end = Date.parse(`${endKey}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  const diff = Math.round((end - start) / MS_PER_DAY);
  return diff > 0 ? diff : 0;
}

/** Returns the `YYYY-MM-DD` day key `days` after `key` (UTC, `days` may be negative). */
export function addDaysToDayKey(key: string, days: number): string {
  const base = Date.parse(`${key}T00:00:00Z`);
  if (Number.isNaN(base)) return key;
  const next = new Date(base + days * MS_PER_DAY);
  const year = next.getUTCFullYear();
  const month = String(next.getUTCMonth() + 1).padStart(2, '0');
  const day = String(next.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** A single contribution reduced to what pace/saved math needs. */
export interface GoalContributionPoint {
  /** `YYYY-MM-DD` day key. */
  date: string;
  /** Signed amount in the reporting currency. */
  reportingAmount: number;
}

export interface GoalStatsInput {
  /** Goal target in the reporting currency (frozen `targetReportingAmount`). */
  targetReportingAmount: number;
  /** Amount saved at creation, already converted to the reporting currency. */
  startingReportingAmount: number;
  /** Signed contributions in the reporting currency, any order. */
  contributions: GoalContributionPoint[];
  /** Day the goal was created (bounds the pace window for young goals). */
  createdAtDayKey: string;
  /** Optional deadline day key. */
  deadline: string | null;
  /** Today's day key (injected so the calculation stays pure/testable). */
  todayDayKey: string;
  /** True hourly rate in the reporting currency; ≤ 0 means no wage configured. */
  hourlyRate: number;
  /** Trailing window used to average pace, in days (default 28). */
  paceWindowDays?: number;
}

const DEFAULT_PACE_WINDOW_DAYS = 28;

/**
 * Derives a goal's progress, pace and forecast. All monetary inputs/outputs are
 * in the reporting currency so `saved` and `target` compare like-for-like and
 * never drift with live rates. Pure: `todayDayKey` is injected, not read from
 * the clock.
 */
export function computeGoalStats(input: GoalStatsInput): GoalStats {
  const {
    targetReportingAmount,
    startingReportingAmount,
    contributions,
    createdAtDayKey,
    deadline,
    todayDayKey,
    hourlyRate,
    paceWindowDays = DEFAULT_PACE_WINDOW_DAYS,
  } = input;

  const contributionsToDate = contributions.filter((c) => c.date <= todayDayKey);
  const contributionsTotal = contributionsToDate.reduce((sum, c) => sum + c.reportingAmount, 0);
  const savedAmount = startingReportingAmount + contributionsTotal;
  const savedPositive = Math.max(0, savedAmount);

  const remainingAmount = Math.max(0, targetReportingAmount - savedPositive);
  const percentComplete = targetReportingAmount > 0 ? savedPositive / targetReportingAmount : 0;
  const isComplete = targetReportingAmount > 0 && savedAmount >= targetReportingAmount;

  // Pace: net contributions inside the trailing window, annualized to a weekly
  // rate. The window starts at the later of (today − windowDays) and creation,
  // so a goal younger than the window isn't diluted by days it didn't exist.
  const windowStartCandidate = addDaysToDayKey(todayDayKey, -paceWindowDays);
  const windowStart =
    windowStartCandidate < createdAtDayKey ? createdAtDayKey : windowStartCandidate;
  const effectiveWindowDays = Math.max(1, daysBetweenDayKeys(windowStart, todayDayKey));
  const windowSum = contributionsToDate
    .filter((c) => c.date >= windowStart)
    .reduce((sum, c) => sum + c.reportingAmount, 0);
  const weeklyPace = (windowSum * 7) / effectiveWindowDays;

  let forecastDate: string | null = null;
  if (!isComplete && remainingAmount > 0 && weeklyPace > 0) {
    const daysNeeded = Math.ceil((remainingAmount / weeklyPace) * 7);
    forecastDate = addDaysToDayKey(todayDayKey, daysNeeded);
  }

  let requiredWeeklyRate: number | null = null;
  if (deadline && !isComplete && remainingAmount > 0) {
    const daysUntilDeadline = daysBetweenDayKeys(todayDayKey, deadline);
    if (daysUntilDeadline > 0) {
      requiredWeeklyRate = remainingAmount / (daysUntilDeadline / 7);
    }
  }

  const deadlineStatus = resolveDeadlineStatus({
    deadline,
    isComplete,
    forecastDate,
    todayDayKey,
  });

  const savedHours = hourlyRate > 0 ? amountToHoursByRate(savedPositive, hourlyRate) : null;
  const remainingHours = hourlyRate > 0 ? amountToHoursByRate(remainingAmount, hourlyRate) : null;

  return {
    savedAmount,
    remainingAmount,
    percentComplete,
    isComplete,
    contributionCount: contributionsToDate.length,
    weeklyPace,
    forecastDate,
    requiredWeeklyRate,
    deadlineStatus,
    savedHours,
    remainingHours,
  };
}

function resolveDeadlineStatus(args: {
  deadline: string | null;
  isComplete: boolean;
  forecastDate: string | null;
  todayDayKey: string;
}): GoalDeadlineStatus {
  const { deadline, isComplete, forecastDate, todayDayKey } = args;
  if (!deadline) return 'none';
  if (isComplete) return 'met';
  if (deadline < todayDayKey) return 'pastDue';
  // Future deadline, not yet met: without forward pace we can't reach it.
  if (!forecastDate) return 'behind';
  return forecastDate <= deadline ? 'onTrack' : 'behind';
}
