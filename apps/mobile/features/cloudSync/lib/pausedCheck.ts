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
