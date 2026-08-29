/**
 * The live-earnings home/Lock Screen widget's payload.
 *
 * A widget is the one iOS surface with a *timeline*: you hand the system a
 * list of future entries and it renders each at its date, with no app process,
 * no network and no push. Money accruing at a fixed rate is entirely
 * predictable, so every figure the widget will ever show is already known the
 * moment the session starts, and the whole session can be precomputed into one
 * timeline. That is what makes the number tick up on its own, which the Live
 * Activity itself cannot do: ActivityKit only repaints time-derived views.
 *
 * The amounts are formatted here, in the app, for the same reason the snapshot
 * widgets carry preformatted labels: the extension has no access to the user's
 * currency settings or the i18n catalog.
 */

import {
  earnedByNow,
  type LiveEarningsSession,
  MS_PER_MINUTE,
  sessionProgress,
} from './liveEarnings';
import type { LiveEarningsAccent } from './liveEarningsAccent';

/** One precomputed frame of the widget's timeline. */
export interface LiveEarningsTick {
  /** Epoch ms the widget starts showing this figure at. */
  at: number;
  /** The amount, formatted by the app (e.g. "RM91.66"). */
  label: string;
  /** The same figure unformatted, for the widget's ring. */
  value: number;
  /** 0 at the session start, 1 at its end. */
  progress: number;
}

export interface LiveEarningsWidgetPayload extends LiveEarningsAccent {
  /** False when no session is running: the widget then shows `idleText`. */
  active: boolean;
  /** Epoch ms. Both are 0 when idle. */
  startedAt: number;
  endsAt: number;
  /** "RM45.00/hr". */
  rateText: string;
  /** "RM180.00": what the session is worth if it runs to the end. */
  totalText: string;
  /** "Ends 1:10 PM". */
  endsText: string;
  /** Stands in for the amount when nothing is running. */
  idleText: string;
  /** Deep link the widget opens on tap. */
  openUrl: string;
  ticks: LiveEarningsTick[];
}

/**
 * Minute by minute for the first hour, then every five.
 *
 * The fine window covers the stretch someone actually watches; past it a
 * five-minute step keeps a whole 8-hour session inside one timeline. Spending
 * the entry budget evenly instead would either run out mid-shift or move in
 * visible jumps from the start.
 */
export const LIVE_EARNINGS_FINE_STEP_MINUTES = 1;
export const LIVE_EARNINGS_FINE_WINDOW_MINUTES = 60;
export const LIVE_EARNINGS_COARSE_STEP_MINUTES = 5;

/**
 * WidgetKit starts misbehaving somewhere past a couple of hundred entries, so
 * the schedule above is bounded rather than trusted to stay small.
 */
export const LIVE_EARNINGS_MAX_TICKS = 180;

/**
 * Every figure the widget will show, from `from` to the end of the session.
 *
 * The first tick is `from` itself so the widget is right the instant it is
 * written, and the last is the session end, which means the timeline never
 * "runs out" into a stale number: once a session is over its final tick is the
 * true total and stays correct forever.
 */
export function buildLiveEarningsTicks(
  session: LiveEarningsSession,
  formatAmount: (value: number) => string,
  from: number,
): LiveEarningsTick[] {
  const tickAt = (at: number): LiveEarningsTick => {
    const value = earnedByNow(session, at);
    return { at, label: formatAmount(value), value, progress: sessionProgress(session, at) };
  };

  if (from >= session.endsAt) return [tickAt(session.endsAt)];

  const ticks: LiveEarningsTick[] = [];
  let at = from;
  // One slot is held back for the closing tick at the session end.
  while (at < session.endsAt && ticks.length < LIVE_EARNINGS_MAX_TICKS - 1) {
    ticks.push(tickAt(at));
    const elapsed = (at - from) / MS_PER_MINUTE;
    const step =
      elapsed < LIVE_EARNINGS_FINE_WINDOW_MINUTES
        ? LIVE_EARNINGS_FINE_STEP_MINUTES
        : LIVE_EARNINGS_COARSE_STEP_MINUTES;
    at += step * MS_PER_MINUTE;
  }
  ticks.push(tickAt(session.endsAt));
  return ticks;
}

export interface LiveEarningsWidgetCopy {
  rateText: string;
  endsText: string;
  idleText: string;
}

/** Opens the Live earnings screen; a plain open never starts a session. */
export const LIVE_EARNINGS_WIDGET_URL = 'money2time://live-earnings';

/**
 * The whole widget payload. `session` is null when nothing is running, which
 * is written just as deliberately as an active one: the widget has to be told
 * a session ended, or it goes on rendering a timeline that is no longer true.
 */
export function buildLiveEarningsWidgetPayload({
  session,
  copy,
  accent,
  formatAmount,
  now,
}: {
  session: LiveEarningsSession | null;
  copy: LiveEarningsWidgetCopy;
  accent: LiveEarningsAccent;
  formatAmount: (value: number) => string;
  now: number;
}): LiveEarningsWidgetPayload {
  if (!session) {
    return {
      active: false,
      startedAt: 0,
      endsAt: 0,
      rateText: '',
      totalText: '',
      endsText: '',
      idleText: copy.idleText,
      openUrl: LIVE_EARNINGS_WIDGET_URL,
      ...accent,
      ticks: [],
    };
  }

  const ticks = buildLiveEarningsTicks(session, formatAmount, now);
  return {
    active: true,
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    rateText: copy.rateText,
    totalText: formatAmount(earnedByNow(session, session.endsAt)),
    endsText: copy.endsText,
    idleText: copy.idleText,
    openUrl: LIVE_EARNINGS_WIDGET_URL,
    ...accent,
    ticks,
  };
}
