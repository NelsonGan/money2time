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
 * How long a finished session's row survives.
 *
 * The last push is the `end` event, and the row has to go afterwards - but not
 * instantly: a window that closes a few seconds before `ends_at` would
 * otherwise leave the card on its second-to-last figure forever.
 */
export const REAP_GRACE_MS = 2 * 60 * 1000;

/** Rows handled per window. Bounds a single invocation's D1 and APNs work. */
export const CRON_BATCH_SIZE = 500;

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
    await prune(store, startedAt, []);
    return;
  }

  const doomed = new Set<string>();
  // What each row has actually been sent, carried across the window in memory
  // so the six ticks cost one D1 write per session rather than six.
  const pushedText = new Map(rows.map((row) => [row.push_token, row.last_pushed_text]));

  for (let tick = 0; tick < TICKS_PER_WINDOW; tick += 1) {
    const at = now();
    // Only the first push of the window is metered. See the note above: making
    // all six metered is what gets an app's budget revoked for a day.
    const metered = tick === 0;

    await Promise.all(
      rows
        .filter((row) => !doomed.has(row.push_token))
        .map((row) => pushOne({ row, credentials, at, metered, pushedText, doomed })),
    );

    if (tick < TICKS_PER_WINDOW - 1) await sleep(TICK_INTERVAL_MS);
  }

  await persist(store, rows, pushedText, doomed, now());
  await prune(store, now(), [...doomed]);
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

  if (over || isTerminalPushFailure(result)) {
    // A terminal failure drops the row, so without a line here the session
    // simply vanishes and there is nothing to explain why a card stopped
    // updating. `Unregistered` / `BadDeviceToken` is the expected, healthy
    // outcome for a card the user swiped away - a sudden run of them is not.
    if (!over) {
      console.warn(
        `live-earnings: dropping token after terminal failure status=${result.status} reason=${result.reason ?? 'unknown'}`,
      );
    }
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
