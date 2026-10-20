/** Types and constants shared by the native Web Dashboard service and its stub. */

export const WEB_DASHBOARD_URL = 'https://app.money2time.com';
export const WEB_DASHBOARD_RELAY_DEFAULT_URL = 'https://workers-web-dashboard.money2time.com';
/** Browsers one phone may link. Each is a key in the keychain. */
export const MAX_LINKED_BROWSERS = 8;
/** A browser that just got data is not sent it again for this long unless it asks with Refresh. */
export const RESEND_AFTER_MS = 60_000;

/** The relay's base URL; `EXPO_PUBLIC_MONEY2TIME_WORKERS_WEB_DASHBOARD` overrides production. */
export function webDashboardRelayUrl(): string {
  const raw = process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_WEB_DASHBOARD?.trim();
  return (raw || WEB_DASHBOARD_RELAY_DEFAULT_URL).replace(/\/+$/, '');
}

/** A browser that answered a scanned QR, waiting for the person to confirm. */
export type PendingBrowser = {
  browserName: string | null;
  /** Six digits, shown on both screens. */
  code: string;
  confirm: () => Promise<LinkedBrowser>;
  cancel: () => void;
};

/** A linked browser as the screen shows it. */
export type LinkedBrowser = {
  roomId: string;
  name: string | null;
  createdAt: number;
  lastSentAt: number | null;
};

export type BrowserConnection = 'connecting' | 'waiting' | 'online' | 'sending' | 'closed';

/** Each linked browser's connection while the Web Dashboard screen is open, by room id. */
export type WebDashboardStatus = Record<
  string,
  { state: BrowserConnection; progress: number | null }
>;

export type WebDashboardErrorCode =
  | 'unavailable'
  | 'invalid_qr'
  | 'timeout'
  | 'offline'
  | 'rejected'
  | 'closed'
  | 'too_many'
  | 'too_large'
  /** Anything unexpected, such as the keychain refusing a write. */
  | 'failed';

export class WebDashboardError extends Error {
  readonly code: WebDashboardErrorCode;

  constructor(code: WebDashboardErrorCode) {
    super(code);
    this.code = code;
  }
}
