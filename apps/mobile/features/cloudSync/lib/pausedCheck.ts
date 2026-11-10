/**
 * Whether a paused phone (Cloud Sync status `notPro`) should ask the Worker
 * for sync credentials after this account-status answer. Both come from the
 * same Pro check (`phoneProStatus`), so a definite "not Pro" (or "past the
 * phone limit") would only be refused again. The exception is a phone not
 * linked yet whose own purchase is active: its status call does not send its
 * install's id, so only the credentials request counts that purchase. No
 * answer (offline, an older Worker) asks, as before.
 */
export function shouldAskForCredentials(
  answer: { isPro: boolean } | null,
  linked: boolean,
  ownPurchase: boolean,
): boolean {
  if (!answer || answer.isPro) return true;
  return !linked && ownPurchase;
}

/** How long a "not Pro" answer holds back credentials requests; after it they are asked again. */
export const NOT_PRO_ANSWER_HOLDS_MS = 15 * 60_000;

/** The Worker's last answer about this phone's Pro, and when it came. */
export interface KnownProAnswer {
  isPro: boolean;
  limited: boolean;
  at: number;
}

/**
 * Whether a credentials request would only be refused, by the last answer
 * (an account status, or a credentials request) when it is recent. Checked
 * before every credentials request, whichever path makes it.
 */
export function credentialsWouldBeRefused(
  known: KnownProAnswer | null,
  now: number,
  linked: boolean,
  ownPurchase: boolean,
): boolean {
  if (!known || known.at > now || now - known.at >= NOT_PRO_ANSWER_HOLDS_MS) return false;
  return !shouldAskForCredentials(known, linked, ownPurchase);
}
