import { sha256 } from 'js-sha256';

import type { LiveEarningsSession } from '~/features/widgets/lib/liveEarnings';

/**
 * Registers a running live-earnings session with the push Worker, so the card's
 * amount keeps moving while the phone is locked.
 *
 * This is the whole reason the figure can tick. ActivityKit repaints only the
 * card's time-derived views on its own, and an app on the Lock Screen is
 * suspended and cannot run code, so the only thing left that can move the money
 * string is an ActivityKit push. The Worker holds (start, end, rate, symbol) and
 * pushes the current figure once a minute for the life of the session.
 *
 * Worth being clear about what this is not: an ActivityKit push shows no
 * banner, makes no sound, never reaches Notification Center, and does not need
 * notification permission - Live Activity delivery is independent of an app's
 * notification settings. Nothing here asks the user for anything.
 *
 * Every call is best-effort and swallows its own failures. A session whose
 * registration fails is not broken, it is merely back to being refreshed on
 * foreground, which is where the feature was before any of this existed.
 */

/** How long a register/unregister may take before we stop waiting on it. */
const REQUEST_TIMEOUT_MS = 8000;

/**
 * The token this process last registered, so an unregister has something to
 * name and - more to the point - so it can tell "nothing to clear" from "clear
 * whatever is there".
 *
 * Without it the refresh path fires an unregister on every single foreground
 * transition for every user, including the overwhelming majority who have never
 * started a session. That is a request per app switch, forever, to say nothing.
 */
let registeredToken: string | null = null;

function baseUrl(): string | null {
  const raw = process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_LIVE_EARNINGS?.trim();
  return raw ? raw.replace(/\/+$/, '') : null;
}

/**
 * Which APNs gateway minted the token. A token from a development build is
 * rejected outright by the production gateway and vice versa, and only the app
 * knows which kind of build it is - so it says, rather than leaving the Worker
 * to guess or to try both.
 */
function apnsEnvironment(): 'sandbox' | 'production' {
  return __DEV__ ? 'sandbox' : 'production';
}

/** Same shared-secret scheme the receipt-scanner Worker uses. */
function signingHeaders(appUserId: string): Record<string, string> {
  const key = process.env.EXPO_PUBLIC_REQUEST_SIGNING_KEY?.trim();
  if (!key) return {};
  const timestamp = Date.now().toString();
  const signature = sha256.hmac(key, `${timestamp}.${appUserId}`);
  return { 'X-Timestamp': timestamp, 'X-Signature': signature };
}

async function post(path: string, appUserId: string, body: Record<string, unknown>): Promise<void> {
  const url = baseUrl();
  if (!url) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${url}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...signingHeaders(appUserId) },
      body: JSON.stringify({ appUserId, ...body }),
      signal: controller.signal,
    });
    // Being best-effort is right in production and awful while developing: a
    // rejected registration is invisible from the app, and the only symptom is
    // a card that never ticks. (That is not hypothetical - the first cut of the
    // Worker rejected every real push token as too long, and this is what it
    // would have taken to notice.)
    if (__DEV__ && !response.ok) {
      console.warn(
        `live-earnings push ${path} rejected: ${response.status} ${await response.text()}`,
      );
    }
  } catch {
    // Offline, Worker down, request aborted. The card keeps whatever figure it
    // has and the next foreground both refreshes it and re-registers.
  } finally {
    clearTimeout(timer);
  }
}

export interface RegisterLiveEarningsPushArgs {
  appUserId: string;
  pushToken: string;
  session: LiveEarningsSession;
  currencySymbol: string;
}

/**
 * Idempotent: the Worker upserts on the push token, so calling this on every
 * foreground transition is how a rotated token gets picked up without any extra
 * bookkeeping on this side.
 *
 * In practice that transition is also where the FIRST registration happens.
 * ActivityKit mints the token per activity and asynchronously, so it does not
 * exist when `Activity.request()` returns - which is why the caller reads it
 * back from the running activity rather than taking it from the start result.
 */
export async function registerLiveEarningsPush({
  appUserId,
  pushToken,
  session,
  currencySymbol,
}: RegisterLiveEarningsPushArgs): Promise<void> {
  if (!appUserId || !pushToken) return;
  registeredToken = pushToken;
  await post('/live-earnings/register', appUserId, {
    pushToken,
    environment: apnsEnvironment(),
    startedAt: session.startedAt,
    endsAt: session.endsAt,
    hourlyRate: session.hourlyRate,
    currencySymbol,
  });
}

/**
 * Stops the pushes. Called when the user stops the clock, when the app finds a
 * session that has run out, and when it finds no activity at all.
 *
 * Skips the request entirely when there is nothing this process registered and
 * no token was named: that is the common case on every foreground transition,
 * and there is nothing on the server to clear. It is safe to skip because the
 * Worker heals itself from both ends - it reaps a row once the session's end
 * has passed, and it drops a token the moment APNs reports it dead, which is
 * exactly what a card the user swiped away produces.
 */
export async function unregisterLiveEarningsPush(
  appUserId: string,
  pushToken?: string,
): Promise<void> {
  if (!appUserId) return;
  const token = pushToken ?? registeredToken;
  if (!token) return;
  registeredToken = null;
  await post('/live-earnings/unregister', appUserId, { pushToken: token });
}
