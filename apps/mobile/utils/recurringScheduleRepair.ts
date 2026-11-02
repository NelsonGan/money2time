// Repairs the schedule of a recurring rule saved before rules had an anchor
// day (`recurring_rules.anchor_day`, migration 077).
//
// Until then the runner stepped run dates in UTC and kept only the next date,
// so two things went wrong and stuck:
// - A rule on the 29th, 30th or 31st moved to the 28th after February and
//   stayed there, since each step started from the shortened date.
// - East of UTC a local midnight is the previous day in UTC, so a rule on the
//   1st was a "31st" in UTC and moved to the 29th the same way.
//
// The day a rule was meant for is recovered from its own run history: the
// first run from which the old arithmetic, replayed, lands exactly on the
// stored next run date is where the current schedule started (an edit to the
// date starts a new one). That run's day is the anchor, and the next run date
// is recomputed from it with the new arithmetic, the same number of steps on.

import type { RecurrencePattern } from '~/types';
import { dayKeyFromIsoLocal } from '~/utils/formatters';
import { isAnchorDay, nextRunAfter, runDayKeyOf, runDayOf } from '~/utils/recurringRules';

/** Runaway guard on one replay, as the runner's own. */
const MAX_REPLAY_STEPS = 5_000;

/**
 * The run date arithmetic every version before migration 077 used, frozen
 * here only to replay what those versions wrote. Nothing else may call it.
 */
export function legacyNextRunAfter(
  dateIso: string,
  pattern: RecurrencePattern,
  interval: number,
): string | null {
  const base = new Date(dateIso);
  if (Number.isNaN(base.getTime())) return null;
  const safeInterval = Math.max(1, Math.trunc(interval) || 1);
  const addDays = (days: number) => {
    const next = new Date(base);
    next.setUTCDate(next.getUTCDate() + days);
    return next.toISOString();
  };
  const addMonths = (months: number) => {
    const next = new Date(base);
    const day = next.getUTCDate();
    next.setUTCDate(1);
    next.setUTCMonth(next.getUTCMonth() + months);
    const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
    next.setUTCDate(Math.min(day, last));
    return next.toISOString();
  };
  switch (pattern) {
    case 'daily':
      return addDays(safeInterval);
    case 'weekly':
      return addDays(safeInterval * 7);
    case 'monthly':
      return addMonths(safeInterval);
    case 'yearly':
      return addMonths(safeInterval * 12);
    default:
      return null;
  }
}

export interface ScheduleRepairInput {
  nextRunDate: string;
  recurrencePattern: RecurrencePattern;
  recurrenceInterval: number;
  /** The run dates the rule's own runs were written with, in any order. */
  runDates: readonly string[];
  /**
   * The day of the month the rule was meant for, when something else records
   * it: a loan's payment day, or the day a goal's auto-save was set up. Used
   * only when the schedule's first date is that day, or the last day of a
   * month too short for it.
   */
  intendedDay?: number | null;
}

export interface RepairedSchedule {
  anchorDay: number;
  nextRunDate: string;
}

/**
 * `dateText` as local midnight of the day it stands for, when an older
 * version left it as a different day read locally (the UTC midnight of a
 * stepped day key, or a midnight an hour off): otherwise the screen and the
 * run it writes would show the day before. Anything else is kept as it is.
 */
function onItsOwnDay(dateText: string): string {
  const day = runDayOf(dateText);
  if (!day || runDayKeyOf(dateText) === dayKeyFromIsoLocal(dateText)) return dateText;
  return new Date(day.year, day.month, day.day).toISOString();
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function timeOf(dateText: string): number {
  return new Date(dateText).getTime();
}

/** Steps from `start` with the old arithmetic until `target`; null if it never lands on it. */
function legacyStepsTo(
  start: string,
  target: string,
  pattern: RecurrencePattern,
  interval: number,
): number | null {
  const targetTime = timeOf(target);
  let cursor: string | null = start;
  for (let step = 1; step <= MAX_REPLAY_STEPS; step += 1) {
    cursor = legacyNextRunAfter(cursor, pattern, interval);
    if (!cursor) return null;
    if (cursor === target) return step;
    if (timeOf(cursor) > targetTime) return null;
  }
  return null;
}

/**
 * The anchor day and next run date a rule saved before anchor days should
 * have, or null when its next run date is not a date (it is left alone).
 */
export function repairRecurringSchedule(input: ScheduleRepairInput): RepairedSchedule | null {
  const { nextRunDate, recurrencePattern: pattern, recurrenceInterval: interval } = input;
  const current = runDayOf(nextRunDate);
  if (!current) return null;
  if (pattern !== 'monthly' && pattern !== 'yearly') {
    // Only months have a day to keep; the anchor just marks the rule as done.
    return { anchorDay: current.day, nextRunDate: onItsOwnDay(nextRunDate) };
  }

  const runs = input.runDates
    .filter((date) => !Number.isNaN(timeOf(date)) && timeOf(date) < timeOf(nextRunDate))
    .sort((a, b) => timeOf(a) - timeOf(b));
  let start = nextRunDate;
  let steps = 0;
  for (const run of runs) {
    const found = legacyStepsTo(run, nextRunDate, pattern, interval);
    if (found !== null) {
      start = run;
      steps = found;
      break;
    }
  }

  const first = runDayOf(start);
  if (!first) return null;
  const intended = input.intendedDay;
  const anchorDay =
    isAnchorDay(intended) &&
    intended !== first.day &&
    Math.min(intended, daysInMonth(first.year, first.month)) === first.day
      ? intended
      : first.day;

  // No run leads here: the date was picked (or edited) and has not run since,
  // so it is what the user chose and stays on its day.
  if (steps === 0) return { anchorDay, nextRunDate: onItsOwnDay(nextRunDate) };
  let repaired: string | null = start;
  for (let step = 0; step < steps && repaired; step += 1) {
    repaired = nextRunAfter(repaired, pattern, interval, anchorDay);
  }
  return { anchorDay, nextRunDate: repaired ?? nextRunDate };
}
