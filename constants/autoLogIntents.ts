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
