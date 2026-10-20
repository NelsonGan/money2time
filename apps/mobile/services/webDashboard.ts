/**
 * Web / unsupported-platform fallback for the Web Dashboard. The app ships on
 * iOS and Android only; Metro and TypeScript resolve `~/services/webDashboard`
 * here outside `.native.ts` targets. Everything is a safe no-op with the
 * native module's shapes.
 */

import {
  type LinkedBrowser,
  type PendingBrowser,
  WebDashboardError,
  type WebDashboardStatus,
} from './webDashboard.shared';

export * from './webDashboard.shared';

export async function isWebDashboardAvailable(): Promise<boolean> {
  return false;
}

export async function listLinkedBrowsers(): Promise<LinkedBrowser[]> {
  return [];
}

export async function beginLink(_qrText: string): Promise<PendingBrowser> {
  throw new WebDashboardError('unavailable');
}

export class WebDashboardConnections {
  constructor(opts: {
    isPro: boolean;
    onChange: (status: WebDashboardStatus) => void;
    onLinksChanged: () => void;
    onSendFailed?: (error: WebDashboardError) => void;
  }) {
    void opts;
  }

  setPro(_isPro: boolean) {}

  async sync(): Promise<void> {}

  sendNow(): number {
    return 0;
  }

  async unlink(_roomId: string): Promise<void> {}

  close() {}
}

export async function unlinkBrowserOffline(_roomId: string): Promise<void> {
  throw new WebDashboardError('unavailable');
}
