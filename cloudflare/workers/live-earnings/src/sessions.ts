/**
 * The push window: what to send, at what priority, and what to forget.
 *
 * Split out of `index.ts` so it depends on nothing Worker-global. D1 is taken
 * as a structural interface, and the clock and the sleep are injected, which
 * makes the whole pass deterministic and lets the app's own test suite drive it
 * (`__tests__/services/liveEarningsCron.test.ts`).
 *
 * ## Why a window rather than a tick
 *
 * Cloudflare's cron floor is one minute and the card is worth updating more
 * often than that, so one invocation covers the whole minute: it reads the
 * running sessions once, then pushes every ten seconds until the next
 * invocation takes over. A Cron Trigger may run for 15 minutes of wall clock,
 * and sleeping costs no CPU, so a 60-second window is comfortably inside both
 * limits.
 *
 * ## Why the priorities differ within that window
 *
 * Apple meters `apns-priority: 10` against a per-device budget it does not
 * publish, and blowing it is not a soft failure: a developer sending ~8 pushes
 * a minute with `NSSupportsLiveActivitiesFrequentUpdates` set had the activity
 * stop updating altogether, and an Apple engineer confirmed the budget can take
 * **up to 24 hours** to come back with no way to override it. Six a minute at
 * priority 10 sits squarely in that range.
 *
 * `apns-priority: 5` is unmetered - it is delivered opportunistically, when the
 * system feels like it - and Apple's own advice in that thread is to use it
 * more liberally. So the window sends exactly one metered push, at the top of
 * the minute, and the five in between unmetered:
 *
 *   - the metered push is the floor: the card is never more than a minute stale,
 *     at exactly the budget cost of the old once-a-minute design;
 *   - the unmetered ones are free extra resolution, delivered when the device is
 *     awake enough to take them, which is when someone is looking at it.
 *
 * The one thing this must never become is six metered pushes a minute. That
 * trades a card that is a few seconds stale for a card that is dead until
 * tomorrow.
 */

import {
  type ApnsCredentials,
  type ApnsEnvironment,
  isTerminalPushFailure,
  pushLiveActivity,
} from './apns';
import { earnedByNow, type EarningsSession, formatMoney, isSessionOver } from './earnings';

/** How often the card is pushed, within the minute one invocation owns. */
export const TICK_INTERVAL_MS = 10_000;

/** Ticks per window. The last one lands just before the next cron invocation. */
export const TICKS_PER_WINDOW = 6;

/**
 * When to stop starting new ticks, so a slow window cannot overlap the next
 * cron invocation.
 *
 * Two overlapping windows would double every push, which on the metered tick
 * means burning the delivery budget twice as fast for no extra freshness. The
 * six ticks nominally finish at t+50s; this leaves five seconds of slack for a
 * slow APNs round trip before the window gives up the remaining ticks.
 */
export const WINDOW_DEADLINE_MS = 55_000;

/**
 * The most pushes one invocation may send, across all sessions and all ticks.
 *
 * A Worker invocation is capped on external subrequests - 10,000 on paid plans
 * (raisable via `limits.subrequests` in wrangler.toml), but only **50** on the
 * free plan. Exceeding it throws part-way through, which would leave an
 * arbitrary subset of users pushed and the rest silently skipped.
 *
 * So the work is scaled to fit the budget rather than assumed to: the tick rate
 * drops as concurrent sessions rise, and every session still gets its one
 * guaranteed metered push a minute. 900 keeps a paid account an order of
 * magnitude clear of the ceiling; a free-plan deployment must lower it.
 */
export const MAX_PUSHES_PER_WINDOW = 900;

/**
 * How often to sweep for expired rows when nothing is running.
 *
 * The reaper has to run even with no live sessions, because a row whose end has
 * passed is no longer SELECTed - but running it every minute of every idle day
 * is ~43,000 pointless D1 writes a month to delete nothing. Sweeping every
 * tenth minute costs an hour of stale rows at worst, which nothing reads.
 */
export const IDLE_SWEEP_EVERY_MINUTES = 10;

/**
 * How long a finished session's row survives.
 *
 * The last push is the `end` event, and the row has to go afterwards - but not
 * instantly: a window that closes a few seconds before `ends_at` would
 * otherwise leave the card on its second-to-last figure forever.
 */
export const REAP_GRACE_MS = 2 * 60 * 1000;

/**
 * Rows read per window. Equal to the push budget, because at the busiest the
 * window degrades to one push per session - so this is the point past which
 * sessions would be dropped entirely rather than merely pushed less often.
 * Reaching it is logged, never silent.
 */
export const CRON_BATCH_SIZE = MAX_PUSHES_PER_WINDOW;

export interface SessionRow {
  push_token: string;
  app_user_id: string;
  environment: ApnsEnvironment;
  started_at: number;
  ends_at: number;
  hourly_rate: number;
  currency_symbol: string;
  last_pushed_text: string | null;
}

/** The slice of D1 this module uses. */
export interface SessionStore {
  prepare(sql: string): {
    bind(...args: unknown[]): {
      all<T = unknown>(): Promise<{ results?: T[] }>;
      run(): Promise<unknown>;
    };
  };
}

export interface PushWindowDeps {
  store: SessionStore;
  credentials: ApnsCredentials | null;
  /** Epoch ms. Read per tick, so the window follows the real clock. */
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export async function runPushWindow(deps: PushWindowDeps): Promise<void> {
  const { store, credentials, now, sleep } = deps;

  if (!credentials) {
    // Not configured yet (no APNs secrets). Say so once per window rather than
    // failing every row: registration still works, the cards just stay frozen,
    // and nothing is pruned because the sessions are all still running.
    console.warn('live-earnings: APNs credentials are not configured; skipping push');
    return;
  }

  const startedAt = now();
  const { results } = await store
    .prepare(
      `SELECT push_token, app_user_id, environment, started_at, ends_at, hourly_rate,
              currency_symbol, last_pushed_text
         FROM live_activity_sessions
        WHERE ends_at > ?1
        ORDER BY ends_at ASC
        LIMIT ?2`,
    )
    .bind(startedAt - REAP_GRACE_MS, CRON_BATCH_SIZE)
    .all<SessionRow>();

  const rows = results ?? [];
  if (rows.length === 0) {
    // Nothing running. The reaper still has to catch rows whose end has passed
    // (they are no longer SELECTed), but not every minute of every idle day.
    if (isSweepMinute(startedAt)) await prune(store, startedAt, []);
    return;
  }

  if (rows.length >= CRON_BATCH_SIZE) {
    // Past this point sessions are not merely pushed less often, they are not
    // pushed at all. Never let that be silent.
    console.error(
      `live-earnings: ${rows.length} sessions hit the per-window cap; some are not being pushed. Raise MAX_PUSHES_PER_WINDOW (and limits.subrequests) or shard the cron.`,
    );
  }

  // Scale the tick rate to what the invocation's subrequest budget allows.
  // Every session keeps its one metered push a minute; only the free extra
  // resolution in between is given up, and only under load.
  const ticks = Math.min(
    TICKS_PER_WINDOW,
    Math.max(1, Math.floor(MAX_PUSHES_PER_WINDOW / rows.length)),
  );
  if (ticks < TICKS_PER_WINDOW) {
    console.warn(
      `live-earnings: ${rows.length} sessions this window; dropping to ${ticks} tick(s) to stay inside the subrequest budget`,
    );
  }

  const doomed = new Set<string>();
  // What each row has actually been sent, carried across the window in memory
  // so the ticks cost one D1 write per session rather than one each.
  const pushedText = new Map(rows.map((row) => [row.push_token, row.last_pushed_text]));

  for (let tick = 0; tick < ticks; tick += 1) {
    const at = now();
    // Only the first push of the window is metered. See the note above: making
    // them all metered is what gets an app's budget revoked for a day.
    const metered = tick === 0;

    await Promise.all(
      rows
        .filter((row) => !doomed.has(row.push_token))
        .map((row) => pushOne({ row, credentials, at, metered, pushedText, doomed })),
    );

    // Give up the remaining ticks rather than run into the next invocation.
    if (tick >= ticks - 1) break;
    if (now() - startedAt + TICK_INTERVAL_MS > WINDOW_DEADLINE_MS) {
      console.warn('live-earnings: window ran long; skipping its remaining ticks');
      break;
    }
    await sleep(TICK_INTERVAL_MS);
  }

  await persist(store, rows, pushedText, doomed, now());
  await prune(store, now(), [...doomed]);
}

/** Spreads the idle reaper over one minute in ten. */
function isSweepMinute(at: number): boolean {
  return Math.floor(at / 60_000) % IDLE_SWEEP_EVERY_MINUTES === 0;
}

async function pushOne(args: {
  row: SessionRow;
  credentials: ApnsCredentials;
  at: number;
  metered: boolean;
  pushedText: Map<string, string | null>;
  doomed: Set<string>;
}): Promise<void> {
  const { row, credentials, at, metered, pushedText, doomed } = args;
  const session: EarningsSession = {
    startedAt: row.started_at,
    endsAt: row.ends_at,
    hourlyRate: row.hourly_rate,
  };
  const over = isSessionOver(session, at);
  const earned = earnedByNow(session, at);
  const earnedText = formatMoney(earned, row.currency_symbol);

  // Nothing to say: the figure has not moved since the last push. At a low
  // hourly rate that is most ten-second ticks, and every skipped push is one
  // the device does not have to wake for.
  if (!over && earnedText === pushedText.get(row.push_token)) return;

  const result = await pushLiveActivity({
    credentials,
    environment: row.environment,
    pushToken: row.push_token,
    state: { earnedText, earned, asOfMillis: at },
    staleAt: Math.floor(row.ends_at / 1000),
    event: over ? 'end' : 'update',
    priority: metered ? 10 : 5,
    now: at,
  });

  if (over) {
    // The session is finished either way, but only forget it once the `end`
    // actually landed (or the token is provably dead). Dropping the row on a
    // transient failure would strand the card on its second-to-last figure
    // until iOS reaped it hours later. A retry costs one push, and the
    // ends_at-based prune is the backstop if it never succeeds.
    if (result.ok || isTerminalPushFailure(result)) doomed.add(row.push_token);
    else {
      console.warn(
        `live-earnings: end push failed status=${result.status} reason=${result.reason ?? 'unknown'}; retrying next window`,
      );
    }
    return;
  }
  if (isTerminalPushFailure(result)) {
    // A terminal failure drops the row, so without a line here the session
    // simply vanishes and there is nothing to explain why a card stopped
    // updating. `Unregistered` / `BadDeviceToken` is the expected, healthy
    // outcome for a card the user swiped away - a sudden run of them is not.
    console.warn(
      `live-earnings: dropping token after terminal failure status=${result.status} reason=${result.reason ?? 'unknown'}`,
    );
    doomed.add(row.push_token);
    return;
  }
  if (!result.ok) {
    // Transient (429, 5xx, a rejected provider token). Leave the row for the
    // next window rather than dropping a card that is still running.
    console.warn(
      `live-earnings: push failed status=${result.status} reason=${result.reason ?? 'unknown'}`,
    );
    return;
  }
  pushedText.set(row.push_token, earnedText);
}

/** One write per session that actually moved, at the end of the window. */
async function persist(
  store: SessionStore,
  rows: SessionRow[],
  pushedText: Map<string, string | null>,
  doomed: Set<string>,
  at: number,
): Promise<void> {
  await Promise.all(
    rows
      .filter((row) => !doomed.has(row.push_token))
      .filter((row) => pushedText.get(row.push_token) !== row.last_pushed_text)
      .map((row) =>
        store
          .prepare(
            'UPDATE live_activity_sessions SET last_pushed_text = ?1, updated_at = ?2 WHERE push_token = ?3',
          )
          .bind(pushedText.get(row.push_token), at, row.push_token)
          .run(),
      ),
  );
}

/**
 * Everything finished or unreachable, plus anything that slipped past the grace
 * window without a tick ever seeing it run (app deleted mid-session).
 */
async function prune(store: SessionStore, at: number, doomed: string[]): Promise<void> {
  await store
    .prepare(
      `DELETE FROM live_activity_sessions
        WHERE ends_at <= ?1
           OR push_token IN (SELECT value FROM json_each(?2))`,
    )
    .bind(at - REAP_GRACE_MS, JSON.stringify(doomed))
    .run();
}
