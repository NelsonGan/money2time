// The item icon picker hands its result back through an `onSelect` callback and
// receives the currently-selected id. The callback is non-serializable, so
// passing it as a navigation param would trip React Navigation's
// non-serializable-state warning and churn the navigation state (causing
// re-renders/flashes). The hand-off rides this module-level bridge instead and
// the route carries no params (mirroring categoryAllocationBridge).
export interface ItemIconPickerSession {
  selectedIconId: string | null;
  onSelect: (iconId: string | null) => void;
}

let pending: ItemIconPickerSession | null = null;

/** Stash the hand-off right before navigating to the icon picker. */
export function setPendingItemIconPicker(session: ItemIconPickerSession) {
  pending = session;
}

/** Reads and clears the pending hand-off (null after a cold state restore). */
export function consumePendingItemIconPicker(): ItemIconPickerSession | null {
  const session = pending;
  pending = null;
  return session;
}
