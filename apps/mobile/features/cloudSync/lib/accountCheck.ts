// How often the app asks the Worker about the account's Pro
// (`POST /v1/account/status`). README: Cloud Sync > Pro on every signed-in
// phone. Each ask is a Worker request, and the Worker keeps RevenueCat's
// answer for an hour anyway, so asking more often learns nothing sooner.

/** A routine check, made with a sync, waits this long after the last answer. */
export const ACCOUNT_CHECK_EVERY_MS = 30 * 60_000;
/**
 * A linked phone with its own purchase is Pro whatever the account says. Its
 * check only keeps the Worker's record of the phone fresh (written at most
 * daily), so once a day is enough.
 */
export const OWN_PURCHASE_CHECK_EVERY_MS = 24 * 60 * 60_000;
/** A paused phone asks whether Pro is back this often while open, and on return to the app. */
export const PAUSED_CHECK_EVERY_MS = 15 * 60_000;
/** A paused phone never asks twice within this, whatever wakes it (a return, a live nudge). */
export const PAUSED_CHECK_MIN_GAP_MS = 60_000;

/**
 * Whether a routine check is due, the last answer having come at `checkedAt`
 * (0: none yet). `ownPurchase`: this phone is linked and has its own purchase.
 * A clock set back makes it due.
 */
export function accountCheckDue(now: number, checkedAt: number, ownPurchase: boolean): boolean {
  const every = ownPurchase ? OWN_PURCHASE_CHECK_EVERY_MS : ACCOUNT_CHECK_EVERY_MS;
  return checkedAt > now || now - checkedAt >= every;
}

/** Whether a paused phone may ask again, the last answer having come at `checkedAt`. */
export function pausedCheckDue(now: number, checkedAt: number): boolean {
  return checkedAt > now || now - checkedAt >= PAUSED_CHECK_MIN_GAP_MS;
}
