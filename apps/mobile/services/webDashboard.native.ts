/**
 * Web Dashboard, the phone's half. The phone sends its data straight to the
 * browsers it linked by QR code, live, end-to-end encrypted, through a relay
 * that stores nothing (apps/cloudflare/workers/web-dashboard). Nothing is
 * kept online: a browser shows the last copy it received, and gets a fresh
 * one whenever this phone opens the Web Dashboard screen while the browser is
 * open. The phone stays the source of truth: a browser may also send changes,
 * but only while this phone is connected to it, and the phone checks each
 * batch against its own data and saves it the way its own editor would
 * (webDashboardEdits.ts), then sends the browser the result.
 *
 * After the first copy, a browser is sent only what changed since the copy
 * it holds (webDashboardPatch.ts); a change saved from the browser comes back
 * as a few rows instead of the whole export. The copy each browser holds is
 * also kept on disk, as a hash per row, so the next visit to the screen (back
 * from the background, or after a relaunch) patches it too instead of
 * starting again with everything.
 *
 * Each link is a key in the keychain (webDashboardLink.ts has the protocol).
 * An unlinked browser stays in a second list until it has heard about it, so
 * a browser that was closed at the time still forgets its copy.
 */

import { sha256 } from '@noble/hashes/sha2.js';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import { Directory, File, Paths } from 'expo-file-system/next';
import { Gzip, strToU8 } from 'fflate';

import { transactionsRepository } from '~/lib/repositories/transactionsRepository';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { buildBackupData, yieldToEventLoop } from '~/services/dataManagementService';
import type { UserAssetReadCache } from '~/services/userAssets';

import {
  type BrowserConnection,
  type LinkedBrowser,
  MAX_LINKED_BROWSERS,
  type PendingBrowser,
  type WebDashboardEditor,
  WebDashboardError,
  type WebDashboardStatus,
} from './webDashboard.shared';
import { toBase64Url } from './webDashboardCrypto';
import {
  type EditRefusal,
  editTransactionIds,
  planEdit,
  planKind,
  type ProFeature,
  readEditRequest,
} from './webDashboardEdits';
import {
  type LinkDeps,
  LinkError,
  type LinkRecord,
  PhoneSession,
  type PreparedTransfer,
  prepareTransfer,
  startLink,
  type WantRequest,
} from './webDashboardLink';
import {
  type BackupIndex,
  diffBackup,
  exportJson,
  hashIndex,
  indexBackup,
  readIndex,
  sameFormat,
  writeIndex,
} from './webDashboardPatch';

export * from './webDashboard.shared';

const LINKS_KEY = 'money2time_web_dashboard_links';
/** Browsers unlinked here that have not yet heard about it. */
const UNLINKS_KEY = 'money2time_web_dashboard_unlinks';
/** An unlink nobody collects in this long is dropped: that browser's data is long stale. */
const UNLINK_TTL_MS = 180 * 24 * 60 * 60 * 1000;
const RELAY_DEFAULT_URL = 'https://workers-web-dashboard.money2time.com';
/** A browser that just got data is not sent it again for this long unless it asks with Refresh. */
const RESEND_AFTER_MS = 60_000;
/** Refresh and Send now each send at most this often per browser. */
const FORCED_SEND_GAP_MS = 10_000;
/** Edits that may wait for the phone at once, across browsers. */
const MAX_QUEUED_EDITS = 4;
/**
 * The user-asset folders the dashboard shows: logos, icons and covers.
 * Receipts, payment QR codes, the avatar and card designs stay on the phone.
 */
const DASHBOARD_ASSET_FOLDERS = [
  'account-logos/',
  'subscription-logos/',
  'album-covers/',
  'goal-covers/',
  'item-icons/',
  'category-icons/',
];
const GZIP_SLICE_BYTES = 1024 * 1024;
/** Copies kept to patch against: one per browser in step, plus the one before. */
const MAX_SNAPSHOTS = 3;
/** Where each browser's copy waits for the next visit, as hashes (in the cache: the system may clear it). */
const SNAPSHOT_FOLDER = 'web-dashboard-copies';

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
  // `EXPO_PUBLIC_MONEY2TIME_WORKERS_WEB_DASHBOARD` points a dev build at a local relay.
  const relayUrl =
    process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_WEB_DASHBOARD?.trim() || RELAY_DEFAULT_URL;
  return { relayUrl: relayUrl.replace(/\/+$/, ''), random: randomBytes };
}

type Unlink = LinkRecord & { unlinkedAt: number };

/**
 * The stored lists as last read or written, so an edit or a send does not
 * read the keychain each time. Every write goes through `updateList`, which
 * refreshes the entry; `cacheEpoch` keeps a read that started before a write
 * from putting the older list back.
 */
const listCache = new Map<string, unknown[]>();
let cacheEpoch = 0;

async function readList<T extends { roomId: string }>(key: string): Promise<T[]> {
  const cached = listCache.get(key);
  if (cached) return cached as T[];
  const epoch = cacheEpoch;
  const items = await readStoredList<T>(key);
  if (items && epoch === cacheEpoch) listCache.set(key, items);
  return items ?? [];
}

/** The list in the keychain; null when it could not be read (not cached then). */
async function readStoredList<T extends { roomId: string }>(key: string): Promise<T[] | null> {
  const native = await loadNative();
  let raw: string | null | undefined;
  try {
    raw = await native?.secureStore.getItemAsync(key);
  } catch {
    // Android can fail to decrypt an entry restored onto another device;
    // the links were for this phone only, so start again.
    return null;
  }
  if (!native) return null;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.roomId === 'string')
      : [];
  } catch {
    return [];
  }
}

const readLinks = () => readList<LinkRecord>(LINKS_KEY);
const readUnlinks = async () =>
  (await readList<Unlink>(UNLINKS_KEY)).filter(
    (unlink) => Date.now() - unlink.unlinkedAt < UNLINK_TTL_MS,
  );

let keychainWrites: Promise<unknown> = Promise.resolve();

/**
 * Changes a stored list, one change at a time and always on a fresh read,
 * so an entry made or removed meanwhile is never written back over.
 */
function updateList<T extends { roomId: string }>(
  key: string,
  change: (items: T[]) => T[],
): Promise<void> {
  const next = keychainWrites.then(async () => {
    const { secureStore } = await requireNative();
    const items = change((await readStoredList<T>(key)) ?? []);
    cacheEpoch++;
    listCache.delete(key);
    // Only on this device, and not into iCloud Keychain backups of other ones.
    await secureStore.setItemAsync(key, JSON.stringify(items), {
      keychainAccessible: secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    cacheEpoch++;
    listCache.set(key, items);
  });
  keychainWrites = next.catch(() => undefined);
  return next;
}

const updateLinks = (change: (links: LinkRecord[]) => LinkRecord[]) =>
  updateList<LinkRecord>(LINKS_KEY, change);
const updateUnlinks = (change: (unlinks: Unlink[]) => Unlink[]) =>
  updateList<Unlink>(UNLINKS_KEY, change);

const publicLink = ({ roomId, name, createdAt, lastSentAt, edits }: LinkRecord): LinkedBrowser => ({
  roomId,
  name,
  createdAt,
  lastSentAt,
  edits: edits === true,
});

/** One file per browser, named after its room token's hash, so no file name shows a token. */
function snapshotFile(roomId: string): File {
  const name = toBase64Url(sha256(strToU8(roomId))).slice(0, 22);
  return new File(Paths.cache, SNAPSHOT_FOLDER, `${name}.txt`);
}

/**
 * A copy to patch against: its index, and its hashes once made (and their
 * file text, made once for every browser that holds it). A copy loaded from
 * disk is hashes only, so both are the same hashed index.
 */
type Snapshot = { index: BackupIndex; hashes?: BackupIndex; text?: string };

/**
 * Copies to write, by room: the latest one each browser accepted. They
 * outlive the screen's connections, so a copy sent just before the app went
 * to the background is still found when it comes back.
 */
const unstored = new Map<string, { id: string; snapshot: Snapshot }>();
let storing = false;

/** Keeps the copy a browser now holds for the screen's next visit; written in the background. */
function storeSnapshot(roomId: string, id: string, snapshot: Snapshot) {
  unstored.set(roomId, { id, snapshot });
  if (!storing) void writeSnapshots();
}

async function writeSnapshots() {
  storing = true;
  try {
    while (unstored.size) {
      const [roomId, entry] = unstored.entries().next().value!;
      // A patch comes with its hashes. A whole export is hashed here, once
      // for every browser it went to, and its patches carry them on.
      entry.snapshot.hashes ??= await hashIndex(entry.snapshot.index, yieldToEventLoop);
      // Never on the send's own turn: writing a large copy takes a moment.
      await yieldToEventLoop();
      // A newer copy for this browser came meanwhile: that one is written instead.
      if (unstored.get(roomId) !== entry) continue;
      unstored.delete(roomId);
      try {
        new Directory(Paths.cache, SNAPSHOT_FOLDER).create({
          intermediates: true,
          idempotent: true,
        });
        entry.snapshot.text ??= writeIndex(entry.snapshot.hashes);
        snapshotFile(roomId).write(`${entry.id}\n${entry.snapshot.text}`);
      } catch {
        // Only a quicker next visit is lost: it starts with the whole export.
      }
    }
  } finally {
    storing = false;
  }
}

/** The copy `id` kept for this browser from an earlier visit, or null when that is not the one kept. */
async function loadSnapshot(roomId: string, id: string): Promise<Snapshot | null> {
  const pending = unstored.get(roomId);
  if (pending?.id === id) return pending.snapshot;
  try {
    const file = snapshotFile(roomId);
    if (!file.exists) return null;
    const text = await file.text();
    const newline = text.indexOf('\n');
    if (newline < 0 || text.slice(0, newline) !== id) return null;
    const index = readIndex(text.slice(newline + 1));
    return index ? { index, hashes: index } : null;
  } catch {
    return null;
  }
}

/** An unlinked browser's copy goes with it. */
function forgetSnapshot(roomId: string) {
  unstored.delete(roomId);
  try {
    const file = snapshotFile(roomId);
    if (file.exists) file.delete();
  } catch {
    // Hashes only, and the system clears its cache in time.
  }
}

/**
 * Goes up with every change a browser saves, and travels with each transfer,
 * so a browser can tell data made before its change from data made after, and
 * a transfer already on its way when a change was saved hands out no token.
 * Started from the clock so it keeps rising across launches.
 */
let dataVersion = Date.now();

/** Lets a linked browser make changes, or takes that away. */
export async function setBrowserEdits(roomId: string, allowed: boolean): Promise<void> {
  await updateLinks((links) =>
    links.map((link) => (link.roomId === roomId ? { ...link, edits: allowed } : link)),
  );
}

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
  return new WebDashboardError('failed');
}

/**
 * Starts linking the browser whose QR code was just scanned. Resolves once
 * that browser answers, with the code both screens show; it is linked only
 * when the person confirms on both.
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
        // The person agreed to this browser's changes when they confirmed the link.
        record = { ...record, edits: true };
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

const includeDashboardAsset = (path: string) =>
  DASHBOARD_ASSET_FOLDERS.some((folder) => path.startsWith(folder));

/** Gzips a slice at a time, so the screen keeps moving on a large export. */
async function gzipJson(json: string): Promise<Uint8Array> {
  const bytes = strToU8(json);
  await yieldToEventLoop();
  const parts: Uint8Array[] = [];
  const gzip = new Gzip({ level: 6 }, (chunk) => parts.push(chunk));
  for (let offset = 0; offset < bytes.length; offset += GZIP_SLICE_BYTES) {
    const end = Math.min(offset + GZIP_SLICE_BYTES, bytes.length);
    gzip.push(bytes.subarray(offset, end), end === bytes.length);
    await yieldToEventLoop();
  }
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const gzipped = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    gzipped.set(part, offset);
    offset += part.length;
  }
  return gzipped;
}

/** A transfer ready to send, and the copy it carries, which the next patch is made against. */
type Built = { prepared: PreparedTransfer; snapshot: Snapshot };

/**
 * One transfer's data, gzipped and encrypted, and shared by every browser
 * that asks within a few seconds: the JSON without the photos the dashboard
 * does not show, or, with a `base` copy, only what changed since it.
 */
async function buildTransfer(
  isPro: boolean,
  assetCache: UserAssetReadCache,
  base: { id: string; snapshot: Snapshot } | null,
): Promise<Built> {
  // The version the data is read at: a change saved while this export is
  // built is not in it, so the copy must not claim that change's version.
  const version = dataVersion;
  const { randomBytes } = await requireNative();
  const data = await buildBackupData({ includeAsset: includeDashboardAsset, assetCache });
  await yieldToEventLoop();
  // A copy from before an app update that changed the backup's format is
  // not patched. Either way every row is serialized once, and that index is
  // what the next patch to this browser is made against.
  const from = base && sameFormat(base.snapshot.index, data) ? base : null;
  let json: string;
  let snapshot: Snapshot;
  if (from) {
    const { index: before, hashes: beforeHashes } = from.snapshot;
    let diff: ReturnType<typeof diffBackup>;
    if (before.hashed) {
      // A copy kept from an earlier visit: every row is hashed to compare, a slice at a time.
      const index = indexBackup(data);
      diff = diffBackup(before, data, { index, hashes: await hashIndex(index, yieldToEventLoop) });
    } else {
      diff = diffBackup(before, data, { baseHashes: beforeHashes });
    }
    json = JSON.stringify(diff.patch);
    snapshot = { index: diff.index, hashes: diff.hashes };
  } else {
    const index = indexBackup(data);
    json = exportJson(data, index);
    snapshot = { index };
  }
  await yieldToEventLoop();
  const gzipped = await gzipJson(json);
  let timeZone: string | null = null;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    timeZone = null;
  }
  const prepared = await prepareTransfer(
    gzipped,
    {
      exportedAt: data.exportedAt ?? null,
      appVersion: Application.nativeApplicationVersion ?? null,
      deviceName: phoneName(),
      timeZone,
      pro: isPro,
      version,
      ...(from ? { base: from.id } : {}),
    },
    randomBytes,
    yieldToEventLoop,
  );
  return { prepared, snapshot };
}

type Trigger = 'browser_opened' | 'refresh' | 'manual' | 'edit';

/**
 * While the Web Dashboard screen is open: a seat in every linked browser's
 * room. A browser that is open asks for data as soon as the phone arrives and
 * gets it; `sendNow` pushes to every browser that is there. Unlinked browsers
 * that have not heard yet get a seat that only tells them. With an `editor`,
 * a browser that is here may also send changes, which are checked and saved
 * one batch at a time.
 */
export class WebDashboardConnections {
  private sessions = new Map<string, PhoneSession>();
  private unlinkSessions = new Map<string, PhoneSession>();
  private status: WebDashboardStatus = {};
  private readonly onChange: (status: WebDashboardStatus) => void;
  private readonly onLinksChanged: () => void;
  private readonly onSendFailed: (error: WebDashboardError) => void;
  private readonly editor: WebDashboardEditor | null;
  private isPro: boolean;
  private closed = false;
  /** Rooms being unlinked right now, so a concurrent `sync` does not reopen them. */
  private removing = new Set<string>();
  /** Rooms whose next request answers a Send now. */
  private offered = new Set<string>();
  /** Rooms whose next request answers a saved edit. */
  private editOffered = new Set<string>();
  /** Rooms that were busy when fresh data was due: offered it once their send ends. */
  private owed = new Set<string>();
  /**
   * Each browser's single-use edit token: the one sent with the data it has.
   * Only for this visit to the screen; a browser holding an older one is sent
   * fresh data (and a new token) as soon as it is here.
   */
  private editTokens = new Map<string, string>();
  /** Edits are saved one batch at a time, whichever browser sent them. */
  private editQueue: Promise<unknown> = Promise.resolve();
  /** Edits waiting in the queue; a browser that floods it is told to wait. */
  private queued = 0;
  /** Each browser's last copy: which, its data version and when, so a resend of the same data waits. */
  private lastSent = new Map<string, { id: string; version: number; at: number }>();
  private lastForced = new Map<string, number>();
  /** Each browser's sends, one after another: two quick requests must not share a send. */
  private sends = new Map<string, Promise<void>>();
  /** Builds shared within a refresh, by the copy they patch ('' for a whole export). */
  private prepared = new Map<string, { at: number; version: number; promise: Promise<Built> }>();
  /** The data each recent transfer carried, by transfer id, to patch against. */
  private snapshots = new Map<string, Snapshot>();
  /** Files read for the last export, reused while unchanged. */
  private assetCache: UserAssetReadCache = new Map();
  /** Rooms last sent a patch: one request for everything is answered at once if it fails. */
  private patched = new Set<string>();

  constructor(opts: {
    isPro: boolean;
    onChange: (status: WebDashboardStatus) => void;
    onLinksChanged: () => void;
    onSendFailed?: (error: WebDashboardError) => void;
    editor?: WebDashboardEditor;
  }) {
    this.isPro = opts.isPro;
    this.onChange = opts.onChange;
    this.onLinksChanged = opts.onLinksChanged;
    this.onSendFailed = opts.onSendFailed ?? (() => undefined);
    this.editor = opts.editor ?? null;
  }

  setPro(isPro: boolean) {
    if (isPro === this.isPro) return;
    this.isPro = isPro;
    // A copy made with the old answer must not be reused.
    this.prepared.clear();
  }

  private update(roomId: string, patch: Partial<WebDashboardStatus[string]>) {
    if (this.closed) return;
    const current = this.status[roomId] ?? {
      state: 'connecting' as BrowserConnection,
      progress: null,
    };
    this.status = { ...this.status, [roomId]: { ...current, ...patch } };
    this.onChange(this.status);
  }

  /**
   * Opens a seat for every link not yet open, and one for every pending
   * unlink, and closes those no longer stored.
   */
  async sync(): Promise<void> {
    if (this.closed) return;
    const [links, unlinks, linkDeps] = await Promise.all([readLinks(), readUnlinks(), deps()]);
    // The screen may have closed while the keychain was read.
    if (this.closed) return;
    const wanted = new Set(
      links.map((link) => link.roomId).filter((roomId) => !this.removing.has(roomId)),
    );
    for (const [roomId, session] of this.sessions) {
      if (wanted.has(roomId)) continue;
      session.close();
      this.sessions.delete(roomId);
      const { [roomId]: _gone, ...rest } = this.status;
      this.status = rest;
    }
    for (const link of links) {
      if (!wanted.has(link.roomId) || this.sessions.has(link.roomId)) continue;
      const session = new PhoneSession(link, linkDeps, {
        onState: (state) => this.update(link.roomId, { state }),
        onProgress: (ratio) => this.update(link.roomId, { progress: ratio }),
        onWant: (request) => void this.answer(link.roomId, request),
        onUnlinked: () => void this.dropLink(link.roomId),
        onEdit: (message) => this.queueEdit(link.roomId, message),
      });
      this.sessions.set(link.roomId, session);
      this.update(link.roomId, { state: session.state });
    }
    const pending = new Set(unlinks.map((unlink) => unlink.roomId));
    for (const [roomId, session] of this.unlinkSessions) {
      if (pending.has(roomId)) continue;
      session.close();
      this.unlinkSessions.delete(roomId);
    }
    for (const unlink of unlinks) {
      if (this.unlinkSessions.has(unlink.roomId)) continue;
      const session = new PhoneSession(
        unlink,
        linkDeps,
        { onUnlinked: () => void this.unlinkDelivered(unlink.roomId) },
        { unlinking: true },
      );
      this.unlinkSessions.set(unlink.roomId, session);
    }
    this.onChange(this.status);
  }

  /** The browser unlinked itself and was told it was heard. */
  private async dropLink(roomId: string) {
    this.sessions.get(roomId)?.close();
    this.sessions.delete(roomId);
    forgetSnapshot(roomId);
    await updateLinks((links) => links.filter((link) => link.roomId !== roomId)).catch(
      () => undefined,
    );
    if (!this.closed) this.onLinksChanged();
  }

  private async unlinkDelivered(roomId: string) {
    this.unlinkSessions.get(roomId)?.close();
    this.unlinkSessions.delete(roomId);
    await updateUnlinks((unlinks) => unlinks.filter((unlink) => unlink.roomId !== roomId)).catch(
      () => undefined,
    );
  }

  private answer(roomId: string, request: WantRequest) {
    const { force } = request;
    const edited = this.editOffered.delete(roomId);
    const offered = this.offered.delete(roomId);
    const trigger: Trigger = edited
      ? 'edit'
      : offered
        ? 'manual'
        : force
          ? 'refresh'
          : 'browser_opened';
    const run = (this.sends.get(roomId) ?? Promise.resolve()).then(() =>
      this.sendTo(roomId, trigger, request),
    );
    const tail = run.catch(() => undefined);
    this.sends.set(roomId, tail);
    void tail.then(() => {
      if (this.sends.get(roomId) === tail) this.sends.delete(roomId);
    });
    return run;
  }

  private queueEdit(roomId: string, message: Record<string, unknown>) {
    // One browser cannot hold up the others with a stream of edits.
    if (this.queued >= MAX_QUEUED_EDITS) {
      void trackEvent(AnalyticsEvents.WEB_DASHBOARD_EDITED, { result: 'busy' });
      return Promise.resolve({ ok: false, error: 'busy' });
    }
    this.queued++;
    const run = this.editQueue
      .then(() => this.edit(roomId, message))
      .finally(() => {
        this.queued--;
      });
    this.editQueue = run.catch(() => undefined);
    return run;
  }

  /** Checks one batch from a browser, saves it, and sends every open browser the result. */
  private async edit(
    roomId: string,
    message: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const refuse = (error: EditRefusal, feature?: ProFeature) => {
      void trackEvent(AnalyticsEvents.WEB_DASHBOARD_EDITED, { result: error });
      return feature ? { ok: false, error, feature } : { ok: false, error };
    };
    let read: ReturnType<typeof readEditRequest>;
    try {
      read = readEditRequest(message);
    } catch {
      read = { kind: 'invalid' };
    }
    if (read.kind === 'invalid') return refuse('invalid');
    const editor = this.editor;
    if (!editor || this.closed) return refuse('failed');
    const link = (await readLinks()).find((item) => item.roomId === roomId);
    if (!link?.edits) return refuse('off');
    // Made against data that is no longer the phone's latest, or replayed.
    const token = this.editTokens.get(roomId);
    if (!token || read.request.token !== token) {
      this.offerFresh(roomId);
      return refuse('stale');
    }
    const ids = editTransactionIds(read.request);
    let result: ReturnType<typeof planEdit>;
    try {
      result = planEdit(read.request, {
        ...editor.lookup(read.request.ops.map((op) => op.entity)),
        transactions: ids.length ? transactionsRepository.listByIds(ids) : [],
      });
    } catch {
      return refuse('failed');
    }
    if (!result.ok) {
      // Something changed on the phone: the browser needs the latest to retry.
      if (result.error === 'conflict') this.offerFresh(roomId);
      return refuse(result.error, result.feature);
    }
    // The screen may have closed while the rows were read; nothing is saved then.
    if (this.closed) return refuse('failed');
    // Every browser's token is spent: none may edit until it has the changed data.
    this.editTokens.clear();
    dataVersion += 1;
    try {
      await editor.apply(result.plan);
    } catch {
      // Saved in steps, so a later step failing can leave earlier ones saved:
      // the browser is told it may or may not be, and gets the data to see.
      dataVersion += 1;
      this.editTokens.clear();
      this.offerAll();
      return refuse('unknown');
    }
    // Raised again once every write has landed: a copy read while they were
    // landing has the version in between, so it neither counts as the change
    // nor carries a token (one handed out while they landed is spent here).
    dataVersion += 1;
    this.editTokens.clear();
    const version = dataVersion;
    void trackEvent(AnalyticsEvents.WEB_DASHBOARD_EDITED, {
      result: 'applied',
      kind: planKind(result.plan),
      count: result.plan.count,
    });
    editor.onApplied?.(result.plan.count);
    this.offerAll();
    return { ok: true, count: result.plan.count, version };
  }

  /** Fresh data for one browser, past the usual gap; owed until its current send ends. */
  private offerFresh(roomId: string) {
    const session = this.sessions.get(roomId);
    if (!session) return;
    if (session.offer()) this.editOffered.add(roomId);
    // A browser that is not here gets fresh data when it arrives anyway.
    else if (session.state === 'sending') this.owed.add(roomId);
  }

  /** Fresh data (and a token, if it may now edit) for one browser: after its permission changed. */
  refreshBrowser(roomId: string) {
    this.lastSent.delete(roomId);
    this.offerFresh(roomId);
  }

  /** The changed data for every browser here, all from one new export. */
  private offerAll() {
    this.prepared.clear();
    for (const roomId of this.sessions.keys()) this.offerFresh(roomId);
  }

  /**
   * The copy a request names, to patch against: still in memory from this
   * visit, or kept on disk from an earlier one. Null when neither has it.
   */
  private async baseFor(
    roomId: string,
    have: string | null,
  ): Promise<{ id: string; snapshot: Snapshot } | null> {
    if (!have) return null;
    const known = this.snapshots.get(have);
    if (known) return { id: have, snapshot: known };
    const snapshot = await loadSnapshot(roomId, have);
    if (!snapshot || this.closed) return null;
    this.keepSnapshot(have, snapshot);
    return { id: have, snapshot };
  }

  /**
   * The data for a send: a patch against `base`, the copy the browser holds,
   * otherwise the whole export. Shared within a refresh, made fresh when
   * asked for.
   */
  private transfer(
    fresh: boolean,
    base: { id: string; snapshot: Snapshot } | null,
  ): Promise<Built> {
    const key = base?.id ?? '';
    const cached = this.prepared.get(key);
    // An export from before a saved change is never reused.
    if (!fresh && cached && cached.version === dataVersion && Date.now() - cached.at < 30_000) {
      return cached.promise;
    }
    const promise = buildTransfer(this.isPro, this.assetCache, base).then((built) => {
      if (!this.closed) this.keepSnapshot(built.prepared.meta.id, built.snapshot);
      return built;
    });
    const entry = { at: Date.now(), version: dataVersion, promise };
    // Each patch has its own base, so builds past their reuse window go.
    for (const [old, item] of this.prepared) {
      if (entry.at - item.at >= 30_000) this.prepared.delete(old);
    }
    this.prepared.set(key, entry);
    promise.catch(() => {
      if (this.prepared.get(key) === entry) this.prepared.delete(key);
    });
    return promise;
  }

  private keepSnapshot(id: string, snapshot: Snapshot) {
    this.snapshots.set(id, snapshot);
    for (const old of this.snapshots.keys()) {
      if (this.snapshots.size <= MAX_SNAPSHOTS) break;
      this.snapshots.delete(old);
    }
  }

  private async sendTo(roomId: string, trigger: Trigger, request: WantRequest): Promise<void> {
    const session = this.sessions.get(roomId);
    // Answered already, or replaced by a newer request, which has its own turn.
    if (!session || session.state !== 'online' || !session.isPending(request.nonce)) return;
    const now = Date.now();
    // The browser could not apply the patch it was just sent: everything,
    // now, once. Not a loop: the next send is a whole export.
    const repair = request.repair && this.patched.delete(roomId);
    const base = repair ? null : await this.baseFor(roomId, request.have);
    if (!repair) {
      // A browser that holds a copy the phone still has costs only a patch,
      // so the limits that keep whole exports apart do not apply to it.
      const patchable = !!base;
      const last = this.lastSent.get(roomId);
      if (patchable) {
        // Nothing to limit.
      } else if (trigger === 'browser_opened') {
        // A browser reconnecting a few times in a row gets one copy, not several,
        // unless it may make changes: it needs a token from this visit to edit with.
        const link = (await readLinks()).find((item) => item.roomId === roomId);
        const editable = !!this.editor && link?.edits === true;
        if (now - (link?.lastSentAt ?? 0) < RESEND_AFTER_MS && !editable) {
          session.decline(request.nonce, false);
          return;
        }
      } else if (trigger !== 'edit') {
        // Refresh is the person's, but each one rebuilds the export: not too often.
        if (now - (this.lastForced.get(roomId) ?? 0) < FORCED_SEND_GAP_MS) {
          session.decline(request.nonce, false);
          return;
        }
        this.lastForced.set(roomId, now);
      }
      if (trigger === 'browser_opened' || trigger === 'edit') {
        // The same data again within moments, to a browser that holds a token
        // for it, is a loop (a flaky network, a stale retry), not a need. If
        // it holds that very copy, saying so lets it make changes again; if it
        // holds an older one still here, it gets the patch.
        const same = last?.version === dataVersion && now - last.at < FORCED_SEND_GAP_MS;
        const holdsLast = !!last && request.have === last.id;
        if (same && this.editTokens.has(roomId) && (holdsLast || !patchable)) {
          session.decline(request.nonce, holdsLast);
          return;
        }
      }
    }
    // A browser may change things only if the person allowed it on this phone.
    const allowed = (await readLinks()).find((link) => link.roomId === roomId)?.edits === true;
    const editToken =
      this.editor && allowed ? toBase64Url((await requireNative()).randomBytes(16)) : null;
    // A newer request came in while the link was read: it is answered instead.
    if (!session.isPending(request.nonce)) return;
    let built: Built | null = null;
    try {
      await session.send(
        async () => {
          built = await this.transfer(trigger === 'refresh', base);
          return built.prepared;
        },
        { editToken },
      );
      // Set by the callback above, which TypeScript cannot follow.
      const done = built as unknown as Built;
      const sentMeta = done.prepared.meta;
      // A token is good only for data that is still the phone's latest: data
      // made before a change saved meanwhile is followed by fresh data instead.
      const latest = sentMeta.version === dataVersion;
      if (editToken && latest) this.editTokens.set(roomId, editToken);
      else this.editTokens.delete(roomId);
      if (!latest) this.owed.add(roomId);
      if (sentMeta.version !== undefined)
        this.lastSent.set(roomId, { id: sentMeta.id, version: sentMeta.version, at: Date.now() });
      // What this browser holds now, for the next visit to patch.
      storeSnapshot(roomId, sentMeta.id, done.snapshot);
      if (sentMeta.base) this.patched.add(roomId);
      else this.patched.delete(roomId);
      await updateLinks((links) =>
        links.map((link) => (link.roomId === roomId ? { ...link, lastSentAt: Date.now() } : link)),
      ).catch(() => undefined);
      this.update(roomId, { progress: null });
      if (!this.closed) this.onLinksChanged();
      void trackEvent(AnalyticsEvents.WEB_DASHBOARD_SENT, {
        trigger,
        payload: sentMeta.base ? 'patch' : 'full',
      });
    } catch (error) {
      this.update(roomId, { progress: null });
      const failure = errorFrom(error);
      void trackEvent(AnalyticsEvents.WEB_DASHBOARD_SEND_FAILED, { reason: failure.code });
      // A send the person asked for, or one that can never work, is worth saying.
      if (!this.closed && (trigger !== 'browser_opened' || failure.code === 'too_large')) {
        this.onSendFailed(failure);
      }
    } finally {
      // Fresh data this browser was owed while it was busy.
      if (this.owed.delete(roomId) && !this.closed) this.offerFresh(roomId);
    }
  }

  /** Asks every linked browser that is open right now for a request to send to. Returns how many. */
  sendNow(): number {
    let count = 0;
    for (const [roomId, session] of this.sessions) {
      if (!session.offer()) continue;
      this.offered.add(roomId);
      count++;
    }
    // One fresh export for all of them: each browser's answer shares it.
    if (count) this.prepared.clear();
    return count;
  }

  /**
   * Unlinks a browser. The key moves to the pending-unlink list until that
   * browser has heard and forgotten its copy, however long it stays closed.
   */
  async unlink(roomId: string): Promise<void> {
    this.removing.add(roomId);
    try {
      this.sessions.get(roomId)?.close();
      this.sessions.delete(roomId);
      const { [roomId]: _gone, ...rest } = this.status;
      this.status = rest;
      await unlinkBrowserOffline(roomId);
    } finally {
      this.removing.delete(roomId);
    }
    if (this.closed) return;
    this.onChange(this.status);
    this.onLinksChanged();
    await this.sync();
  }

  close() {
    this.closed = true;
    for (const session of this.sessions.values()) session.close();
    for (const session of this.unlinkSessions.values()) session.close();
    this.sessions.clear();
    this.unlinkSessions.clear();
    this.editTokens.clear();
    this.owed.clear();
    this.lastSent.clear();
    this.patched.clear();
    // The exports and copies hold the whole database in memory; let them go.
    this.prepared.clear();
    this.snapshots.clear();
    this.assetCache.clear();
  }
}

/**
 * Unlinks a browser without a connection to it: the key moves to the
 * pending-unlink list, delivered the next time the screen and the browser are
 * both open. Also used while the screen's connections are not open yet.
 */
export async function unlinkBrowserOffline(roomId: string): Promise<void> {
  forgetSnapshot(roomId);
  const link = (await readLinks()).find((item) => item.roomId === roomId);
  if (link) {
    await updateUnlinks((unlinks) => [
      ...unlinks.filter((unlink) => unlink.roomId !== roomId),
      { ...link, unlinkedAt: Date.now() },
    ]);
  }
  await updateLinks((links) => links.filter((item) => item.roomId !== roomId));
  void trackEvent(AnalyticsEvents.WEB_DASHBOARD_UNLINKED);
}
