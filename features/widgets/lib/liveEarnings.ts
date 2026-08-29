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

export const MS_PER_MINUTE = 60 * 1000;

/**
 * How far back a session may be backdated, in minutes.
 *
 * Bounded by the session itself: backdating the full duration would start a
 * session that is already over, so the bound stops one minute short. The
 * iOS 8-hour ceiling is measured from the moment the activity is *requested*,
 * so backdating never risks it, it only ever brings the end nearer.
 */
export function maxStartedMinutesAgo(hours: number): number {
  return clampSessionHours(hours) * 60 - 1;
}

export function clampStartedMinutesAgo(minutes: number, hours: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.min(maxStartedMinutesAgo(hours), Math.round(minutes));
}

/** Epoch ms of the top of the minute `ms` falls in. */
export function floorToMinute(ms: number): number {
  return Math.floor(ms / MS_PER_MINUTE) * MS_PER_MINUTE;
}

/**
 * The span of wall-clock times a start may be picked from: from the furthest
 * back the session allows, up to the current minute. Both ends are whole
 * minutes, since that is the finest the picker (and the card) speak in.
 */
export function startWindowFor(now: number, hours: number): { earliest: number; latest: number } {
  const latest = floorToMinute(now);
  return { earliest: latest - maxStartedMinutesAgo(hours) * MS_PER_MINUTE, latest };
}

/** A picked start pulled back inside the window, e.g. after a shorter duration. */
export function clampStartAt(startedAt: number, now: number, hours: number): number {
  const { earliest, latest } = startWindowFor(now, hours);
  if (!Number.isFinite(startedAt)) return latest;
  return Math.min(latest, Math.max(earliest, floorToMinute(startedAt)));
}

/** How long ago a picked start was, in whole minutes. Never negative. */
export function startedMinutesAgoFor(startedAt: number, now: number): number {
  return Math.max(0, Math.round((floorToMinute(now) - floorToMinute(startedAt)) / MS_PER_MINUTE));
}

/**
 * Every wall-clock hour a start may sit in, earliest first, given as the epoch
 * ms of the top of that hour rather than an 0-23 number: a DST fall-back
 * repeats an hour, and two columns keyed on the label would then be ambiguous.
 */
export function startHourBucketsFor(now: number, hours: number): number[] {
  const { earliest, latest } = startWindowFor(now, hours);
  const first = new Date(earliest);
  first.setMinutes(0, 0, 0);
  const buckets: number[] = [];
  for (let at = first.getTime(); at <= latest; at += MS_PER_HOUR) buckets.push(at);
  return buckets;
}

/**
 * The minutes selectable within one hour of the wheel. Partial at both ends:
 * the earliest hour starts part-way through and the current one stops at the
 * present minute, since a session cannot have started in the future.
 */
export function startMinuteOptionsFor(now: number, hours: number, hourBucket: number): number[] {
  const { earliest, latest } = startWindowFor(now, hours);
  const minutes: number[] = [];
  for (let minute = 0; minute < 60; minute += 1) {
    const at = hourBucket + minute * MS_PER_MINUTE;
    if (at >= earliest && at <= latest) minutes.push(minute);
  }
  return minutes;
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
