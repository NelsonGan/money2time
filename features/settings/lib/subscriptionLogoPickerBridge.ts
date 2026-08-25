// The subscription logo picker hands its result back through an `onSelect`
// callback and receives the currently-selected id. The callback is
// non-serializable, so passing it as a navigation param would trip React
// Navigation's non-serializable-state warning and churn the navigation state
// (causing re-renders/flashes). The hand-off rides this module-level bridge
// instead and the route carries no params (mirroring accountLogoPickerBridge).
export interface SubscriptionLogoPickerSession {
  selectedLogoId: string | null;
  onSelect: (logoId: string | null) => void;
}

let pending: SubscriptionLogoPickerSession | null = null;

/** Stash the hand-off right before navigating to the logo picker. */
export function setPendingSubscriptionLogoPicker(session: SubscriptionLogoPickerSession) {
  pending = session;
}

/** Reads and clears the pending hand-off (null after a cold state restore). */
export function consumePendingSubscriptionLogoPicker(): SubscriptionLogoPickerSession | null {
  const session = pending;
  pending = null;
  return session;
}
