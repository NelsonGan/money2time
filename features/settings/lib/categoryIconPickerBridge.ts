/**
 * Hands the icon picker its current value and its onSelect callback without
 * routing them through navigation params, which would trip React Navigation's
 * non-serializable-params warning and break state restoration. Mirrors
 * features/items/lib/itemIconPickerBridge.ts.
 *
 * Read-once: the route host consumes the session on mount and clears it, so a
 * cold state-restore that lands on the picker with no pending session simply
 * goes back rather than rendering a picker whose selection goes nowhere.
 */
export interface CategoryIconPickerSession {
  /** Current stored value, in the grammar documented in constants/categoryIcons.ts. */
  selectedValue: string | null;
  /** Receives the new value, or null when the user clears the icon. */
  onSelect: (value: string | null) => void;
  /** Optional header title override (defaults to the generic "Choose icon"). */
  title?: string;
}

let pending: CategoryIconPickerSession | null = null;

export function setPendingCategoryIconPicker(session: CategoryIconPickerSession) {
  pending = session;
}

export function consumePendingCategoryIconPicker(): CategoryIconPickerSession | null {
  const session = pending;
  pending = null;
  return session;
}
