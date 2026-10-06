/** Notification extraction uses the receipt worker; earlier versions were local parsers. */
export const NOTIFICATION_PARSER_VERSION = 4;
/** Structured Apple Pay entries are parsed by the Shortcut, independently of notification inference. */
export const APPLE_PAY_PARSER_VERSION = 1;
/** One scanner request can take up to 90 seconds. */
export const TEST_ALERT_TIMEOUT_MS = 100000;
