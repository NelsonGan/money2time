/**
 * Web Dashboard, the phone's half. The phone sends its data straight to the
 * browsers it linked by QR code, live, end-to-end encrypted, through a relay
 * that stores nothing (apps/cloudflare/workers/web-dashboard). Nothing is
 * kept online: a browser shows the last copy it received, and gets a fresh
 * one whenever this phone opens the Web Dashboard screen while the browser is
 * open. The phone stays the source of truth; the browser only reads.
 *
 * Each link is a key in the keychain (webDashboardLink.ts has the protocol).
 */

import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { gzipSync, strToU8 } from 'fflate';
import { sha256 } from 'js-sha256';

import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { buildBackupJson, yieldToEventLoop } from '~/services/dataManagementService';

import {
  type BrowserConnection,
  type LinkedBrowser,
  MAX_LINKED_BROWSERS,
  type PendingBrowser,
  RESEND_AFTER_MS,
  WebDashboardError,
  webDashboardRelayUrl,
  type WebDashboardStatus,
} from './webDashboard.shared';
import { encryptBackup, fromBase64Url } from './webDashboardCrypto';
import {
  type LinkDeps,
  LinkError,
  type LinkRecord,
  PhoneSession,
  startLink,
} from './webDashboardLink';

export * from './webDashboard.shared';

const LINKS_KEY = 'money2time_web_dashboard_links';

type Native = typeof import('./webDashboardNative');

let nativeModule: Promise<Native | null> | null = null;

/** The keychain and randomness, or null on a build without those native modules. */
function loadNative(): Promise<Native | null> {
  nativeModule ??= import('./webDashboardNative').catch(() => null);
  return nativeModule;
}

async function requireNative(): Promise<Native> {
  const native = await loadNative();
  if (!native) throw new WebDashboardError('unavailable');
  return native;
}

async function deps(): Promise<LinkDeps> {
  const { randomBytes } = await requireNative();
  return {
    relayUrl: webDashboardRelayUrl(),
    random: randomBytes,
    sha256Hex: (data) => sha256.hex(data),
  };
}

async function readLinks(): Promise<LinkRecord[]> {
  const native = await loadNative();
  const raw = await native?.secureStore.getItemAsync(LINKS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as LinkRecord[];
    return Array.isArray(parsed)
      ? parsed.filter((link) => link && typeof link.roomId === 'string')
      : [];
  } catch {
    return [];
  }
}

let linkWrites: Promise<unknown> = Promise.resolve();

/**
 * Changes the stored links, one change at a time and always on a fresh read,
 * so a link made or removed meanwhile is never written back over.
 */
function updateLinks(change: (links: LinkRecord[]) => LinkRecord[]): Promise<void> {
  const next = linkWrites.then(async () => {
    const { secureStore } = await requireNative();
    const links = change(await readLinks());
    // Only on this device, and not into iCloud Keychain backups of other ones.
    await secureStore.setItemAsync(LINKS_KEY, JSON.stringify(links), {
      keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  });
  linkWrites = next.catch(() => undefined);
  return next;
}

const publicLink = ({ roomId, name, createdAt, lastSentAt }: LinkRecord): LinkedBrowser => ({
  roomId,
  name,
  createdAt,
  lastSentAt,
});

/** Whether this build can use the Web Dashboard (it has the native modules). */
export async function isWebDashboardAvailable(): Promise<boolean> {
  return (await loadNative()) !== null;
}

export async function listLinkedBrowsers(): Promise<LinkedBrowser[]> {
  return (await readLinks()).map(publicLink);
}

function phoneName(): string | null {
  return Device.deviceName ?? Device.modelName ?? null;
}

function errorFrom(error: unknown): WebDashboardError {
  if (error instanceof WebDashboardError) return error;
  if (error instanceof LinkError) return new WebDashboardError(error.code);
  return new WebDashboardError('offline');
}

/**
 * Starts linking the browser whose QR code was just scanned. Resolves once
 * that browser answers, with the code both screens show; it is linked only
 * when the person confirms.
 */
export async function beginLink(qrText: string): Promise<PendingBrowser> {
  if ((await readLinks()).length >= MAX_LINKED_BROWSERS) throw new WebDashboardError('too_many');
  try {
    const pending = await startLink(qrText, phoneName(), await deps());
    return {
      browserName: pending.browserName,
      code: pending.code,
      cancel: pending.cancel,
      confirm: async () => {
        let record: LinkRecord;
        try {
          record = await pending.confirm();
        } catch (error) {
          throw errorFrom(error);
        }
        await updateLinks((links) => [
          ...links.filter((link) => link.roomId !== record.roomId),
          record,
        ]);
        void trackEvent(AnalyticsEvents.WEB_DASHBOARD_LINKED);
        return publicLink(record);
      },
    };
  } catch (error) {
    throw errorFrom(error);
  }
}

function forgetLink(roomId: string): Promise<void> {
  return updateLinks((links) => links.filter((link) => link.roomId !== roomId));
}

function markSent(roomId: string, at: number): Promise<void> {
  return updateLinks((links) =>
    links.map((link) => (link.roomId === roomId ? { ...link, lastSentAt: at } : link)),
  );
}

/** The gzipped export, shared across the browsers of one refresh. */
let prepared: {
  at: number;
  promise: Promise<{ gz: Uint8Array; exportedAt: string | null }>;
} | null = null;

function preparedExport(): Promise<{ gz: Uint8Array; exportedAt: string | null }> {
  if (prepared && Date.now() - prepared.at < 30_000) return prepared.promise;
  const promise = (async () => {
    const { json, data } = await buildBackupJson();
    await yieldToEventLoop();
    const gz = gzipSync(strToU8(json), { level: 6 });
    await yieldToEventLoop();
    return { gz, exportedAt: data.exportedAt ?? null };
  })();
  prepared = { at: Date.now(), promise };
  promise.catch(() => {
    if (prepared?.promise === promise) prepared = null;
  });
  return promise;
}

/**
 * While the Web Dashboard screen is open: a seat in every linked browser's
 * room. A browser that is open asks for data as soon as the phone arrives and
 * gets it; `sendNow` pushes to every browser that is there.
 */
export class WebDashboardConnections {
  private sessions = new Map<string, PhoneSession>();
  private status: WebDashboardStatus = {};
  private readonly onChange: (status: WebDashboardStatus) => void;
  private readonly onLinksChanged: () => void;
  private isPro: boolean;
  private closed = false;

  constructor(opts: {
    isPro: boolean;
    onChange: (status: WebDashboardStatus) => void;
    onLinksChanged: () => void;
  }) {
    this.isPro = opts.isPro;
    this.onChange = opts.onChange;
    this.onLinksChanged = opts.onLinksChanged;
  }

  setPro(isPro: boolean) {
    this.isPro = isPro;
  }

  private update(roomId: string, patch: Partial<WebDashboardStatus[string]>) {
    const current = this.status[roomId] ?? {
      state: 'connecting' as BrowserConnection,
      progress: null,
    };
    this.status = { ...this.status, [roomId]: { ...current, ...patch } };
    this.onChange(this.status);
  }

  /** Opens a seat for every link not yet open, and closes those since unlinked. */
  async sync(): Promise<void> {
    if (this.closed) return;
    const links = await readLinks();
    const linkDeps = await deps();
    // The screen may have closed while the keychain was read.
    if (this.closed) return;
    const wanted = new Set(links.map((link) => link.roomId));
    for (const [roomId, session] of this.sessions) {
      if (!wanted.has(roomId)) {
        session.close();
        this.sessions.delete(roomId);
        const { [roomId]: _gone, ...rest } = this.status;
        this.status = rest;
      }
    }
    for (const link of links) {
      if (this.sessions.has(link.roomId)) continue;
      const session = new PhoneSession(link, linkDeps, {
        onState: (state) => this.update(link.roomId, { state }),
        onProgress: (ratio) => this.update(link.roomId, { progress: ratio }),
        onWant: (force) => void this.sendTo(link.roomId, force ? 'refresh' : 'browser_opened'),
        onUnlinked: () => void this.dropLink(link.roomId),
      });
      this.sessions.set(link.roomId, session);
      this.update(link.roomId, { state: session.state });
    }
    this.onChange(this.status);
  }

  private async dropLink(roomId: string) {
    this.sessions.get(roomId)?.close();
    this.sessions.delete(roomId);
    await forgetLink(roomId);
    this.onLinksChanged();
  }

  private async sendTo(
    roomId: string,
    trigger: 'browser_opened' | 'refresh' | 'manual',
  ): Promise<void> {
    const session = this.sessions.get(roomId);
    if (!session || session.state !== 'online') return;
    // A browser reconnecting a few times in a row gets one copy, not several.
    const last = (await readLinks()).find((link) => link.roomId === roomId)?.lastSentAt ?? 0;
    if (trigger === 'browser_opened' && Date.now() - last < RESEND_AFTER_MS) return;
    const key = fromBase64Url(session.link.key);
    try {
      await session.send(async () => {
        const { gz, exportedAt } = await preparedExport();
        const { randomBytes } = await requireNative();
        return {
          data: encryptBackup(key, gz, randomBytes),
          meta: {
            exportedAt,
            appVersion: Application.nativeApplicationVersion ?? null,
            deviceName: phoneName(),
            pro: this.isPro,
          },
        };
      });
      const at = Date.now();
      await markSent(roomId, at);
      this.update(roomId, { progress: null });
      this.onLinksChanged();
      void trackEvent(AnalyticsEvents.WEB_DASHBOARD_SENT, { trigger });
    } catch (error) {
      this.update(roomId, { progress: null });
      void trackEvent(AnalyticsEvents.WEB_DASHBOARD_SEND_FAILED, { reason: errorFrom(error).code });
    }
  }

  /** Sends to every linked browser that is open right now. Returns how many. */
  sendNow(): number {
    let count = 0;
    for (const [roomId, session] of this.sessions) {
      if (session.state !== 'online') continue;
      count++;
      void this.sendTo(roomId, 'manual');
    }
    return count;
  }

  /** Unlinks a browser: it is told to forget its copy if it is open, and the key goes. */
  async unlink(roomId: string): Promise<void> {
    const session = this.sessions.get(roomId);
    session?.unlink();
    this.sessions.delete(roomId);
    await forgetLink(roomId);
    void trackEvent(AnalyticsEvents.WEB_DASHBOARD_UNLINKED);
    this.onLinksChanged();
  }

  close() {
    this.closed = true;
    for (const session of this.sessions.values()) session.close();
    this.sessions.clear();
  }
}
