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

/**
 * Takes a bank or e-wallet app notification from a Notification automation
 * and queues it without opening the app. Spending is logged automatically
 * when the app next runs.
 */
export const LOG_NOTIFICATION_INTENT_NAME = 'Log Notification';

// Ready-made iCloud share links for the two shortcuts a user can install as-is,
// so the tutorial only has to cover the trigger (Back Tap / automation) rather
// than walking them through building the shortcut by hand. Before iOS 27 a
// Transaction *automation* can't be packaged into a shareable shortcut, so Log
// Card Payment stays fully manual there.
export const NEW_TRANSACTION_SHORTCUT_URL =
  'https://www.icloud.com/shortcuts/90b01863119d42929db64150bff172b8';
export const SCAN_SCREENSHOT_SHORTCUT_URL =
  'https://www.icloud.com/shortcuts/50f20a5f88084dda95718f5b6e56e927';

// iOS 27 shares a shortcut together with its automation trigger, so this one
// installs the whole Wallet automation. Its only Import Question is the card:
// asking for the Money2Time Account there leaves Shortcuts' Add Shortcut button
// dead on iOS 27, so the guide has the user set the account afterwards. On iOS
// 27.0.1 a link install can also arrive with its Money2Time action missing (the
// long-standing New Transaction link does the same), which is why the guide
// keeps the step-by-step build right after the link.
export const LOG_CARD_PAYMENT_AUTOMATION_URL =
  'https://www.icloud.com/shortcuts/9e3d3157b1d94fa9a01e4c0295073f33';

// Video walkthroughs, one per automation type, linked from the top-right of each
// tutorial. Keep R2 object paths versioned so cached videos never change in place.
export const AUTO_LOG_VIDEO_URLS = {
  logPayment: 'https://youtube.com/shorts/RPDvP40KdFE',
  newTransaction: 'https://youtube.com/shorts/_ywgy40eVxo',
  logScreenshot: 'https://youtube.com/shorts/MEK2AyOQh6w',
  paymentAlertsIos: 'https://media.money2time.com/tutorials/ios/notifications/setup-2026-10-07.mp4',
} as const;

/** iOS 27 walkthroughs, replacing the ones above where the iOS 27 screens differ. */
export const AUTO_LOG_VIDEO_URLS_IOS27: Partial<Record<keyof typeof AUTO_LOG_VIDEO_URLS, string>> =
  {
    logPayment:
      'https://media.money2time.com/tutorials/ios27/log-card-payment/setup-2026-10-09.mp4',
    newTransaction:
      'https://media.money2time.com/tutorials/ios27/new-transaction/setup-2026-10-09.mp4',
    logScreenshot:
      'https://media.money2time.com/tutorials/ios27/log-screenshot/setup-2026-10-09.mp4',
  };
