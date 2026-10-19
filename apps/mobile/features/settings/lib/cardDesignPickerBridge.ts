import type { AccountType } from '~/types';

// Same arrangement as accountLogoPickerBridge: the picker's onSelect callback
// is not serializable, so the hand-off rides this module rather than route
// params, and the route carries none.
export interface CardDesignPickerSession {
  selectedDesign: string | null;
  onSelect: (design: string | null) => void;
  /** What the preview card shows, so the design is judged with real text on it. */
  accountName: string;
  logoId: string | null;
  accountType: AccountType;
  /** The account's place in its stack section, for its plain colour. */
  stackIndex: number;
}

let pending: CardDesignPickerSession | null = null;

/** Stash the hand-off right before navigating to the card design picker. */
export function setPendingCardDesignPicker(session: CardDesignPickerSession) {
  pending = session;
}

/** Reads and clears the pending hand-off (null after a cold state restore). */
export function consumePendingCardDesignPicker(): CardDesignPickerSession | null {
  const session = pending;
  pending = null;
  return session;
}
