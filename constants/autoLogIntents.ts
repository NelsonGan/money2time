// Display names of the two Shortcuts actions the auto-log feature ships, spelled
// exactly as the Swift `AppIntent.title`s in plugins/withMoney2TimeAutoLog.js.
//
// Deliberately not i18n keys. Those titles are `LocalizedStringResource`s with no
// string catalog behind them, so the Shortcuts app shows these English literals
// whatever the device locale is. Settings and the setup steps name the action the
// user then has to go find in Shortcuts, so translating here would send, say, a
// Japanese user hunting for a string that does not exist on their screen.

/** Runs inside a Transaction automation; records the tap without opening the app. */
export const LOG_CARD_PAYMENT_INTENT_NAME = 'Log Card Payment';

/** Opens the app on the chosen entry screen; adds nothing on its own. */
export const NEW_TRANSACTION_INTENT_NAME = 'New Transaction';

/**
 * Takes a payment screenshot (as a Shortcuts image input — latest screenshot,
 * share sheet, etc.), queues it, and opens the app to scan and auto-log it.
 */
export const SCAN_SCREENSHOT_INTENT_NAME = 'Log Screenshot';

// Ready-made iCloud share links for the two shortcuts a user can install as-is,
// so the tutorial only has to cover the trigger (Back Tap / automation) rather
// than walking them through building the shortcut by hand. Log Card Payment has
// no link on purpose: a Transaction *automation* can't be packaged into a
// shareable shortcut, so that flow stays fully manual.
export const NEW_TRANSACTION_SHORTCUT_URL =
  'https://www.icloud.com/shortcuts/90b01863119d42929db64150bff172b8';
export const SCAN_SCREENSHOT_SHORTCUT_URL =
  'https://www.icloud.com/shortcuts/50f20a5f88084dda95718f5b6e56e927';

// YouTube Shorts walkthroughs, one per automation type, linked from the top-right
// of each tutorial.
export const AUTO_LOG_VIDEO_URLS = {
  logPayment: 'https://youtube.com/shorts/RPDvP40KdFE',
  newTransaction: 'https://youtube.com/shorts/_ywgy40eVxo',
  logScreenshot: 'https://youtube.com/shorts/MEK2AyOQh6w',
} as const;
