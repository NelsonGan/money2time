/** ActivityKit's maximum active lifetime for one Live Activity. */
export const MAX_SESSION_MS = 8 * 60 * 60 * 1000;

/** The shift lengths the app offers, in minutes: one minute to the iOS ceiling. */
export const MIN_SHIFT_MINUTES = 1;
export const MAX_SHIFT_MINUTES = MAX_SESSION_MS / 60_000;
