/**
 * The cron pass: decide what to push, what to end, and what to forget.
 *
 * Split out of `index.ts` so it depends on nothing Worker-global. D1 is taken
 * as a structural interface and `now` as an argument, which makes the whole
 * pass deterministic and lets the app's own test suite import and drive it
 * (`__tests__/services/liveEarningsCron.test.ts`) - the Worker's decisions are
 * the part with real user-visible consequences, and they are worth pinning
 * somewhere that runs on every commit.
 */

import {
  type ApnsCredentials,
  type ApnsEnvironment,
  isTerminalPushFailure,
  pushLiveActivity,
} from './apns';
import { earnedByNow, type EarningsSession, formatMoney, isSessionOver } from './earnings';

/**
 * How long a finished session's row survives.
 *
 * The last push is the `end` event, and the row has to go afterwards - but not
 * instantly: a cron tick landing a few seconds before `ends_at` would otherwise
 * leave the card on its second-to-last figure forever.
 */
export const REAP_GRACE_MS = 2 * 60 * 1000;

/** Rows handled per tick. Bounds a single invocation's D1 and APNs work. */
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

export async function pushDueSessions(
  store: SessionStore,
  credentials: ApnsCredentials | null,
  now: number,
): Promise<void> {
  if (!credentials) {
    // Not configured yet (no APNs secrets). Say so once per tick rather than
    // failing every row: registration still works, the cards just stay frozen,
    // and nothing is pruned because the sessions are all still running.
    console.warn('live-earnings: APNs credentials are not configured; skipping push');
    return;
  }

  const { results } = await store
    .prepare(
      `SELECT push_token, app_user_id, environment, started_at, ends_at, hourly_rate,
              currency_symbol, last_pushed_text
         FROM live_activity_sessions
        WHERE ends_at > ?1
        ORDER BY ends_at ASC
        LIMIT ?2`,
    )
    .bind(now - REAP_GRACE_MS, CRON_BATCH_SIZE)
    .all<SessionRow>();

  const rows = results ?? [];
  const doomed: string[] = [];

  await Promise.all(
    rows.map(async (row) => {
      const session: EarningsSession = {
        startedAt: row.started_at,
        endsAt: row.ends_at,
        hourlyRate: row.hourly_rate,
      };
      const over = isSessionOver(session, now);
      const earned = earnedByNow(session, now);
      const earnedText = formatMoney(earned, row.currency_symbol);

      // Nothing to say: the figure has not moved since the last push. Late in a
      // session at a modest rate that is most minutes, and every skipped push
      // is one not taken out of the delivery budget.
      if (!over && earnedText === row.last_pushed_text) return;

      const result = await pushLiveActivity({
        credentials,
        environment: row.environment,
        pushToken: row.push_token,
        state: { earnedText, earned, asOf: Math.floor(now / 1000) },
        staleAt: Math.floor(row.ends_at / 1000),
        event: over ? 'end' : 'update',
        now,
      });

      if (over || isTerminalPushFailure(result)) {
        doomed.push(row.push_token);
        return;
      }
      if (!result.ok) {
        // Transient (429, 5xx, a rejected provider token). Leave the row for
        // the next minute rather than dropping a card that is still running.
        console.warn(
          `live-earnings: push failed status=${result.status} reason=${result.reason ?? 'unknown'}`,
        );
        return;
      }
      await store
        .prepare(
          'UPDATE live_activity_sessions SET last_pushed_text = ?1, updated_at = ?2 WHERE push_token = ?3',
        )
        .bind(earnedText, now, row.push_token)
        .run();
    }),
  );

  // Everything finished or unreachable, plus anything that slipped past the
  // grace window without a tick ever seeing it run (app deleted mid-session).
  await store
    .prepare(
      `DELETE FROM live_activity_sessions
        WHERE ends_at <= ?1
           OR push_token IN (SELECT value FROM json_each(?2))`,
    )
    .bind(now - REAP_GRACE_MS, JSON.stringify(doomed))
    .run();
}
