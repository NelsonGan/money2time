/**
 * Session replay privacy markers for PostHog's native recorder.
 *
 * Replays mask every text and input (the user's amounts, notes and names are
 * text), but show images, so icons, logos and illustrations stay readable.
 * Pictures the user supplied are their information, not app chrome: spread
 * `REPLAY_PRIVATE` onto any image or view that shows one (receipts, the profile
 * photo, album and goal covers, uploaded logos and icons, payment QR codes, the
 * camera) and the recorder paints over it.
 *
 * The token is what `PostHogMaskView` uses, read from the view's own
 * accessibility label on iOS and content description on Android.
 * `importantForAccessibility: 'no'` keeps TalkBack from announcing it, and
 * VoiceOver never reads it because these views are not accessibility elements.
 * Spread it before any real `accessibilityLabel`, which would replace it: wrap
 * such a view in a `View` carrying the marker instead.
 */
export const REPLAY_PRIVATE = {
  accessibilityLabel: 'ph-no-capture',
  importantForAccessibility: 'no',
} as const;
