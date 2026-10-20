/** Types and constants shared by the native Web Dashboard service and its stub. */

import type { EditLookup, EditPlan } from './webDashboardEdits';

export const WEB_DASHBOARD_URL = 'https://app.money2time.com';
/** Browsers one phone may link. Each is a key in the keychain. */
export const MAX_LINKED_BROWSERS = 8;

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
  /** Whether this browser may make changes while the screen is open. */
  edits: boolean;
};

/**
 * How changes from a linked browser are saved: the screen hands this to the
 * connections while it is open, built on AppContext.
 */
export type WebDashboardEditor = {
  /** Accounts, categories and the main currency as the app holds them now. */
  lookup: () => Omit<EditLookup, 'transactions'>;
  /** Saves a checked plan; resolves once it is in the database. */
  apply: (plan: EditPlan) => Promise<void>;
  /** A batch was saved, with how many entries it changed. */
  onApplied?: (count: number) => void;
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
