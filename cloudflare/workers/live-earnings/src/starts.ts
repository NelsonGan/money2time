/**
 * The scheduled-start pass: raising the Live Activity at the start of a shift,
 * on a phone that is not running the app.
 *
 * `Activity.request()` is foreground-only - nothing an app schedules locally
 * can put a card on the Lock Screen by itself - so the schedule used to be a
 * notification the user had to tap. A **push-to-start** token (iOS 17.2+)
 * removes the tap: the device hands the app a token for the activity *type*,
 * the app registers it here with the shift it wants, and this pass sends the
 * start push at the right local minute.
 *
 * Split out of `index.ts` for the same reason as `sessions.ts`: it depends on
 * nothing Worker-global, so the app's own suite can drive a whole day of
 * schedules deterministically (`__tests__/services/liveEarningsStarts.test.ts`).
 */

import {
  type ApnsCredentials,
  type ApnsEnvironment,
  isTerminalPushFailure,
  type LiveActivityAttributesPayload,
  startLiveActivity,
} from './apns';
import { nextScheduledStart } from './schedule';
import type { SessionStore } from './sessions';

/**
 * How late a start may be and still be worth sending.
 *
 * A card that says a shift began at 09:00 and ends at 17:00 is a lie if it is
 * raised at 11:30, and the phone that was off all morning is exactly the one
 * that gets the push the moment it comes back. So a missed start is skipped
 * rather than fired late, and the schedule rolls on to the next day. Five
 * minutes covers a cron that ran long or an APNs retry, and nothing else.
 */
export const START_GRACE_MS = 5 * 60 * 1000;

/** Rows examined per minute. Far above any real load; a bound, not a limit. */
export const MAX_STARTS_PER_WINDOW = 500;

/** Devices started at once, so a busy minute does not run into the next one. */
export const START_CONCURRENCY = 25;

/**
 * How long a schedule survives without the app confirming it.
 *
 * The app re-registers on every foreground, so a row that has gone quiet for
 * this long belongs to an install that is gone - deleted, or restored onto a
 * device that minted a new token. APNs reports most of those as terminal and
 * they are dropped on the spot; this catches the rest, so a dead schedule
 * cannot push at someone's phone forever.
 */
export const SCHEDULE_STALE_MS = 45 * 24 * 60 * 60 * 1000;

export interface ScheduleRow {
  push_to_start_token: string;
  app_user_id: string;
  environment: ApnsEnvironment;
  time_zone: string;
  /** JSON array of weekday numbers, 0 = Sunday. */
  days: string;
  hour: number;
  minute: number;
  duration_minutes: number;
  hourly_rate: number;
  currency_symbol: string;
  title_text: string;
  rate_text: string;
  ends_text: string;
  total_text: string;
  refresh_text: string;
  /** The formatted zero the card opens at, e.g. "RM0.00". */
  zero_text: string;
  alert_title: string;
  alert_body: string;
  accent_light: number;
  accent_dark: number;
  next_start_at: number;
}

export interface StartsPassDeps {
  store: SessionStore;
  credentials: ApnsCredentials | null;
  /** Epoch ms. */
  now: () => number;
}

export async function runScheduledStarts(deps: StartsPassDeps): Promise<void> {
  const { store, credentials, now } = deps;
  const at = now();

  // Before the early return below: the rows this drops are by definition ones
  // that never come due again, so a pass that finds nothing to start is
  // exactly when there is time to sweep them.
  if (isSweepMinute(at)) await pruneStaleSchedules(store, at);

  const { results } = await store
    .prepare(
      `SELECT push_to_start_token, app_user_id, environment, time_zone, days, hour, minute,
              duration_minutes, hourly_rate, currency_symbol, title_text, rate_text, ends_text,
              total_text, refresh_text, zero_text, alert_title, alert_body, accent_light,
              accent_dark, next_start_at
         FROM live_activity_schedules
        WHERE next_start_at > 0 AND next_start_at <= ?1
        ORDER BY next_start_at ASC
        LIMIT ?2`,
    )
    .bind(at, MAX_STARTS_PER_WINDOW)
    .all<ScheduleRow>();

  const due = results ?? [];
  if (due.length === 0) return;

  if (!credentials) {
    // Not configured (no APNs secrets). Say so once and leave every row armed,
    // rather than rolling schedules forward past a start that never went out.
    console.warn('live-earnings: APNs credentials are not configured; skipping scheduled starts');
    return;
  }

  const busy = await usersWithRunningSessions(store, due, at);

  // Chunked rather than serial: a popular start time is many devices at the
  // same minute, and 500 APNs round trips end to end would run into the push
  // window that follows. Chunked rather than all at once for the same reason
  // the window has a budget - a Worker invocation is capped on subrequests.
  for (let index = 0; index < due.length; index += START_CONCURRENCY) {
    await Promise.all(
      due
        .slice(index, index + START_CONCURRENCY)
        .map((row) => startOne({ store, credentials, row, at, busy })),
    );
  }
}

/** Starts (or deliberately does not start) one device's shift. */
async function startOne(args: {
  store: SessionStore;
  credentials: ApnsCredentials;
  row: ScheduleRow;
  at: number;
  busy: Set<string>;
}): Promise<void> {
  const { store, credentials, row, at, busy } = args;

  // Rearmed from `at`, not from the occurrence just handled: the next
  // occurrence is the next selected weekday after right now, which is the same
  // answer whether this start fired, was skipped, or was too late.
  const rearmed = nextScheduledStart(
    { days: parseDays(row.days), hour: row.hour, minute: row.minute, timeZone: row.time_zone },
    at,
  );

  if (at - row.next_start_at > START_GRACE_MS) {
    // The device was unreachable, or this Worker was. Either way the shift has
    // moved on; do not raise a card that misreports it.
    console.warn('live-earnings: skipping a scheduled start that is past its grace window');
    await rearm(store, row.push_to_start_token, rearmed, null);
    return;
  }

  if (busy.has(row.app_user_id)) {
    // A card is already up: the user started one by hand this morning, or a
    // long shift is still running. Starting a second would stack two "you are
    // earning" cards whose figures disagree.
    await rearm(store, row.push_to_start_token, rearmed, null);
    return;
  }

  const startedAt = row.next_start_at;
  const endsAt = startedAt + row.duration_minutes * 60_000;
  const attributes: LiveActivityAttributesPayload = {
    startedAtMillis: startedAt,
    endsAtMillis: endsAt,
    hourlyRate: row.hourly_rate,
    titleText: row.title_text,
    rateText: row.rate_text,
    endsText: row.ends_text,
    totalText: row.total_text,
    refreshText: row.refresh_text,
    accentLightHex: row.accent_light,
    accentDarkHex: row.accent_dark,
  };

  const result = await startLiveActivity({
    credentials,
    environment: row.environment,
    pushToStartToken: row.push_to_start_token,
    attributes,
    // The card opens at zero. It is backdated to the scheduled minute rather
    // than to now, so the elapsed clock reads the shift and not the delivery -
    // and within the grace window above the difference is seconds of pay.
    state: { earnedText: row.zero_text, earned: 0, asOfMillis: at },
    alert: { title: row.alert_title, body: row.alert_body },
    staleAt: Math.floor(endsAt / 1000),
    // No point delivering a start once it is too late to be true.
    expiresAt: Math.floor((row.next_start_at + START_GRACE_MS) / 1000),
    now: at,
  });

  if (result.ok) {
    await rearm(store, row.push_to_start_token, rearmed, at);
    return;
  }
  if (isTerminalPushFailure(result)) {
    // The install is gone or the token belongs to the other APNs environment.
    // Never silent: a run of these is how a broken build announces itself.
    console.warn(
      `live-earnings: dropping schedule after terminal start failure status=${result.status} reason=${result.reason ?? 'unknown'}`,
    );
    await store
      .prepare('DELETE FROM live_activity_schedules WHERE push_to_start_token = ?1')
      .bind(row.push_to_start_token)
      .run();
    return;
  }
  // Transient (429, 5xx, a rejected provider token). Leave the row armed so the
  // next minute retries, which the grace window bounds to five attempts.
  console.warn(
    `live-earnings: scheduled start failed status=${result.status} reason=${result.reason ?? 'unknown'}`,
  );
}

/**
 * Accounts that already have a Live Activity running.
 *
 * Keyed by account rather than by device because that is all the two tables
 * have in common: a session is addressed by its activity's update token and a
 * schedule by the device's push-to-start token, and neither can be derived
 * from the other. In practice one person's phone is one of each.
 */
async function usersWithRunningSessions(
  store: SessionStore,
  rows: ScheduleRow[],
  at: number,
): Promise<Set<string>> {
  const ids = [...new Set(rows.map((row) => row.app_user_id))];
  const { results } = await store
    .prepare(
      `SELECT DISTINCT app_user_id FROM live_activity_sessions
        WHERE ends_at > ?1 AND app_user_id IN (SELECT value FROM json_each(?2))`,
    )
    .bind(at, JSON.stringify(ids))
    .all<{ app_user_id: string }>();
  return new Set((results ?? []).map((entry) => entry.app_user_id));
}

/**
 * Arms the row for its next occurrence, or disarms it when there is none (a
 * schedule with every day deselected, which the app allows as an in-between
 * state while the user is choosing).
 *
 * `startedAt` is the instant a card was actually raised, or null for an
 * occurrence that was skipped. The column is diagnostic only - nothing reads
 * it to make a decision - so it must never record a start that did not happen.
 */
async function rearm(
  store: SessionStore,
  pushToStartToken: string,
  nextStartAt: number | null,
  startedAt: number | null,
): Promise<void> {
  await store
    .prepare(
      `UPDATE live_activity_schedules
          SET next_start_at = ?1, last_started_at = COALESCE(?2, last_started_at)
        WHERE push_to_start_token = ?3`,
    )
    .bind(nextStartAt ?? 0, startedAt, pushToStartToken)
    .run();
}

/** Spreads the stale-row sweep over one minute in ten, as `sessions.ts` does. */
function isSweepMinute(at: number): boolean {
  return Math.floor(at / 60_000) % 10 === 0;
}

/** Drops schedules whose app has stopped confirming them. */
export async function pruneStaleSchedules(store: SessionStore, at: number): Promise<void> {
  await store
    .prepare('DELETE FROM live_activity_schedules WHERE updated_at < ?1')
    .bind(at - SCHEDULE_STALE_MS)
    .run();
}

function parseDays(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((day) => typeof day === 'number') : [];
  } catch {
    return [];
  }
}
