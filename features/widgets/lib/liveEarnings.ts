/**
 * Math behind the live-earnings session: money accrues linearly from the
 * moment the user starts the activity, at their true hourly rate, and stops
 * accruing at the session end.
 *
 * Kept pure and free of Date.now() so both the in-app preview (which ticks
 * every frame) and the Live Activity payload builder read from one place, and
 * so the edges are testable.
 */

export const MS_PER_HOUR = 60 * 60 * 1000;

export const LIVE_EARNINGS_MIN_HOURS = 1;

/**
 * iOS force-ends a Live Activity 8 hours after it starts, whatever the app
 * asked for, so offering more than 8 would only promise something the OS then
 * takes away.
 */
export const LIVE_EARNINGS_MAX_HOURS = 8;

/** Every duration the wheel offers: one entry per hour up to the iOS ceiling. */
export const LIVE_EARNINGS_HOUR_OPTIONS: number[] = Array.from(
  { length: LIVE_EARNINGS_MAX_HOURS - LIVE_EARNINGS_MIN_HOURS + 1 },
  (_, index) => LIVE_EARNINGS_MIN_HOURS + index,
);

export interface LiveEarningsSession {
  /** Epoch ms the session started accruing at. */
  startedAt: number;
  /** Epoch ms the session stops accruing at. */
  endsAt: number;
  /** True hourly rate the session accrues at, in the reporting currency. */
  hourlyRate: number;
}

export function clampSessionHours(hours: number): number {
  if (!Number.isFinite(hours)) return LIVE_EARNINGS_MIN_HOURS;
  return Math.min(LIVE_EARNINGS_MAX_HOURS, Math.max(LIVE_EARNINGS_MIN_HOURS, Math.round(hours)));
}

export function sessionEndFor(startedAt: number, hours: number): number {
  return startedAt + clampSessionHours(hours) * MS_PER_HOUR;
}

/** Milliseconds actually accrued: clamped to the session on both ends. */
export function elapsedMs(session: LiveEarningsSession, now: number): number {
  const { startedAt, endsAt } = session;
  if (!Number.isFinite(startedAt) || !Number.isFinite(endsAt) || endsAt <= startedAt) return 0;
  const capped = Math.min(Math.max(now, startedAt), endsAt);
  return capped - startedAt;
}

/** Money earned so far. Never negative, never past the session's full value. */
export function earnedByNow(session: LiveEarningsSession, now: number): number {
  const rate = session.hourlyRate;
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  return (elapsedMs(session, now) / MS_PER_HOUR) * rate;
}

/** 0 at the start, 1 at the end. Used for the progress bar. */
export function sessionProgress(session: LiveEarningsSession, now: number): number {
  const span = session.endsAt - session.startedAt;
  if (!Number.isFinite(span) || span <= 0) return 0;
  return elapsedMs(session, now) / span;
}

export function isSessionOver(session: LiveEarningsSession, now: number): boolean {
  return now >= session.endsAt;
}

/** Elapsed session time as "H:MM:SS", matching the activity's live clock. */
export function formatElapsedClock(session: LiveEarningsSession, now: number): string {
  const totalSeconds = Math.floor(elapsedMs(session, now) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${hours}:${pad(minutes)}:${pad(seconds)}`;
}
