/**
 * When a scheduled shift next begins, in the user's own wall-clock time.
 *
 * The whole point of the auto-start schedule is that it fires while the app is
 * not running, so the app cannot be the one to work out when "Monday at 09:00"
 * is. The device's IANA time zone is registered along with the schedule and the
 * arithmetic happens here.
 *
 * Wall-clock, not a fixed offset: a schedule that says 09:00 has to stay 09:00
 * across a daylight-saving change, and the offset either side of one differs.
 * So the next occurrence is found by walking forward in *local calendar days*
 * and converting each candidate back to an instant, rather than by adding
 * multiples of 24 hours to an epoch.
 *
 * Nothing here touches Date.now(): every entry point takes the instant to
 * measure from, which is what lets the app's test suite drive it.
 */

export interface ScheduleTiming {
  /** Weekdays the schedule fires on, 0 = Sunday. Empty means it never fires. */
  days: number[];
  /** Local wall-clock hour, 0-23. */
  hour: number;
  /** Local wall-clock minute, 0-59. */
  minute: number;
  /** IANA zone the two above are read in, e.g. "Asia/Kuala_Lumpur". */
  timeZone: string;
}

/** How far ahead to look for the next occurrence. A week plus slack for DST. */
const MAX_LOOKAHEAD_DAYS = 9;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A zone we can actually format in. An unknown or malformed IANA name makes
 * `Intl.DateTimeFormat` throw, and a schedule is not worth a 500: falling back
 * to UTC fires it at the wrong local time, which the user can see and fix,
 * where a crashed cron silently starts nothing for everyone.
 */
function safeZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone }).format(0);
    return timeZone;
  } catch {
    return 'UTC';
  }
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** The local calendar reading of an instant in `timeZone`. */
export function localPartsAt(at: number, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    // h23 rather than hour12:false: some engines render midnight as "24" under
    // the latter, which would push every date calculation a day out.
    hourCycle: 'h23',
  }).formatToParts(new Date(at));

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
  };
}

/** The zone's offset from UTC at `at`, in ms (positive east of Greenwich). */
export function zoneOffsetMs(at: number, timeZone: string): number {
  const local = localPartsAt(at, timeZone);
  // Read the local parts back as if they were UTC: the difference between that
  // and the real instant IS the offset, whatever the zone's history.
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  // The instant carries seconds and ms the parts above dropped, so compare
  // against the same resolution rather than letting them show up as offset.
  return asUtc - Math.floor(at / 60_000) * 60_000;
}

/**
 * The instant at which a local wall-clock time occurs.
 *
 * Two passes, because the offset to apply depends on the very instant being
 * solved for. The first pass guesses with the offset in force at the naive
 * UTC reading, the second corrects it using the offset actually in force at
 * the guess - which is what makes the hour either side of a DST change land on
 * the right instant.
 *
 * The two passes disagree only for a local time that does not exist - the hour
 * a spring-forward skips - where they settle on the same reading of the clock
 * an hour before the jump. So a 02:30 schedule fires at 02:30 standard time on
 * that one morning, an hour earlier than the wall clock would suggest. A time
 * that happens twice (a fall-back) resolves to its first occurrence. Neither is
 * worth more code: shifts do not start in the small hours of a Sunday, and both
 * readings are an hour out once a year rather than wrong every day.
 */
export function wallClockToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  let instant = naive - zoneOffsetMs(naive, timeZone);
  instant = naive - zoneOffsetMs(instant, timeZone);
  return instant;
}

function isValidDay(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6;
}

/**
 * The next instant the schedule fires at, strictly after `from`, or null when
 * it can never fire (no days selected).
 *
 * Strictly after is deliberate: the register endpoint recomputes this on every
 * app foreground, and "at or after" would re-arm an occurrence that has just
 * fired, starting a second card a minute after the first.
 */
export function nextScheduledStart(schedule: ScheduleTiming, from: number): number | null {
  const days = schedule.days.filter(isValidDay);
  if (days.length === 0) return null;
  if (!Number.isFinite(from)) return null;

  const zone = safeZone(schedule.timeZone);
  const hour = clampInt(schedule.hour, 0, 23);
  const minute = clampInt(schedule.minute, 0, 59);
  const today = localPartsAt(from, zone);

  for (let offset = 0; offset <= MAX_LOOKAHEAD_DAYS; offset += 1) {
    // Walk the local calendar, not the epoch: stepping a UTC day at a time and
    // re-reading the local date is what keeps the walk honest across a DST
    // change, where two local days can be 23 or 25 hours apart.
    const cursor = new Date(Date.UTC(today.year, today.month - 1, today.day) + offset * MS_PER_DAY);
    const weekday = cursor.getUTCDay();
    if (!days.includes(weekday)) continue;

    const candidate = wallClockToInstant(
      cursor.getUTCFullYear(),
      cursor.getUTCMonth() + 1,
      cursor.getUTCDate(),
      hour,
      minute,
      zone,
    );
    if (candidate > from) return candidate;
  }
  return null;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
