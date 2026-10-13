/**
 * Session replay privacy marker for PostHog's native recorder.
 *
 * Replays mask every text and input (the user's amounts, notes and names are
 * text), but show images, so icons, logos and illustrations stay readable.
 * Pictures the user supplied are their information, not app chrome: spread
 * `REPLAY_PRIVATE` onto any image or view that shows one (receipts, the profile
 * photo, album and goal covers, uploaded logos and icons, payment QR codes, the
 * camera) and the recorder paints over it. Charts get it too: their shapes are
 * the user's money.
 *
 * The recorder looks for `ph-no-capture` in the view's accessibility identifier
 * on iOS and its tag on Android, and `testID` sets both. It is not an
 * accessibility label, so screen readers never announce it. A view that needs
 * its own `testID` would replace the marker: wrap it in a `View` carrying the
 * marker instead.
 */
export const REPLAY_PRIVATE = { testID: 'ph-no-capture' } as const;
