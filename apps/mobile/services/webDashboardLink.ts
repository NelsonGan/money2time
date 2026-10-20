/**
 * The Web Dashboard's link protocol, the phone's side. Plain TypeScript over
 * the platform WebSocket and injected randomness; the browser's half is
 * src/lib/cloud/relay.ts in the website repo.
 *
 * The phone and the browser meet in a relay room (the web-dashboard Worker)
 * that forwards messages and stores nothing. A socket joins a room by
 * offering the subprotocols `m2t-v1, <token>`; the relay keeps only a hash
 * of the token. Every message between the two is sealed with the link key
 * (webDashboardCrypto.ts), its direction in the AAD, except the first one of
 * a link, which carries only the phone's public key, and flow-control acks.
 *
 *   link:     phone → {t:'pair', pk}            (in the QR's one-off room)
 *             browser → sealed {type:'hello', name}; both screens show the code
 *             phone → sealed {type:'paired', name}   (the person confirmed on the phone)
 *             browser → sealed {type:'linked'}       (…and on the computer)
 *   refresh:  browser → sealed {type:'want', nonce, force}   (when the phone arrives,
 *             on Refresh, or answering the phone's sealed {type:'offer'})
 *             phone → sealed {type:'begin', nonce, meta, key, iv}, then binary
 *                     chunks [u32 index][AES-GCM under the transfer key],
 *                     at most WINDOW ahead of
 *             browser → {t:'ack', id, n}
 *             phone → sealed {type:'end', id};  browser → sealed {type:'done', id, ok}
 *   edit:     browser → sealed {type:'edit', id, token, ops}  (webDashboardEdits.ts)
 *             phone → sealed {type:'offer'} to every browser here, so each asks for
 *                     the changed data, and to this one a sealed
 *                     {type:'edited', id, ok, count, version | error, feature?}
 *   unlink:   either → sealed {type:'unlink'};  the other → sealed {type:'unlinked'}
 *             (repeated whenever they meet until acknowledged, so an unlink
 *             made while the other side is closed still arrives)
 *
 * A transfer must echo the nonce of a request the browser made, each nonce
 * is answered once, and every chunk is bound to its transfer, index and count,
 * so a relay cannot reflect, replay, reorder or truncate anything. An edit
 * must carry the single-use token sent with the browser's latest data
 * (`meta.editToken`, per browser), so it is made against the phone's current
 * copy and cannot be replayed. Both sides
 * send "ping" every 25 s; the relay answers "pong" without waking, and a
 * missing pong means the socket is dead.
 */

import {
  type DerivedLink,
  deriveLink,
  encryptChunk,
  fromBase64Url,
  linkKeyPair,
  openMessage,
  type RandomBytes,
  type Sealed,
  sealMessage,
  toBase64Url,
} from './webDashboardCrypto';

const RELAY_PROTOCOL = 'm2t-v1';
export const CHUNK_BYTES = 256 * 1024;
export const WINDOW = 8;
/** The largest gzipped export that is sent; past this the phone says so. */
export const MAX_TRANSFER_BYTES = 128 * 1024 * 1024;
const PAIR_TIMEOUT_MS = 30_000;
/** The browser asks the person too, so its answer can take a while. */
const CONFIRM_TIMEOUT_MS = 120_000;
const ACK_TIMEOUT_MS = 20_000;
const DONE_TIMEOUT_MS = 60_000;
const HEARTBEAT_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
const RECONNECT_MS = [1000, 2000, 5000, 10_000, 20_000];
const SEEN_NONCES = 64;

/** A browser this phone has linked. `roomId` is the room token, `key` the link key (base64url). */
export type LinkRecord = {
  roomId: string;
  key: string;
  name: string | null;
  createdAt: number;
  lastSentAt: number | null;
  /**
   * The person allowed this browser to make changes. Set when a link is
   * confirmed; links made before web edits existed lack it until allowed.
   */
  edits?: boolean;
};

type TransferMeta = {
  id: string;
  exportedAt: string | null;
  appVersion: string | null;
  deviceName: string | null;
  /** The phone's IANA time zone, so the web reads dates as the phone does. */
  timeZone: string | null;
  /** Money2Time Pro on this phone, so the dashboard can unlock Pro views. */
  pro: boolean;
  /**
   * The single-use token this browser's next edit must carry; set per browser
   * when it is sent. Its presence also tells the browser this phone takes edits.
   */
  editToken?: string | null;
  /** The phone's data version this copy was made at; a saved change raises it. */
  version?: number;
  /** Gzipped bytes in all. */
  size: number;
  count: number;
};

/** One refresh's data, encrypted once and sent to every browser that asks. */
export type PreparedTransfer = {
  meta: TransferMeta;
  dataKey: Uint8Array;
  ivPrefix: Uint8Array;
  /** `[u32 index][ciphertext]` per chunk. */
  frames: Uint8Array[];
};

export type LinkDeps = {
  /** The relay's base URL, e.g. https://workers-web-dashboard.money2time.com */
  relayUrl: string;
  random: RandomBytes;
};

export class LinkError extends Error {
  readonly code: 'invalid_qr' | 'timeout' | 'offline' | 'rejected' | 'closed' | 'too_large';

  constructor(code: LinkError['code']) {
    super(code);
    this.code = code;
  }
}

/**
 * Splits gzipped data into sealed chunks under a fresh key, yielding between
 * chunks so the phone stays responsive while a large export is encrypted.
 */
export async function prepareTransfer(
  gzipped: Uint8Array,
  meta: Omit<TransferMeta, 'id' | 'size' | 'count'>,
  random: RandomBytes,
  pause: () => Promise<void>,
): Promise<PreparedTransfer> {
  if (gzipped.length > MAX_TRANSFER_BYTES) throw new LinkError('too_large');
  const count = Math.max(1, Math.ceil(gzipped.length / CHUNK_BYTES));
  const full: TransferMeta = { ...meta, id: toBase64Url(random(12)), size: gzipped.length, count };
  const dataKey = random(32);
  const ivPrefix = random(8);
  const frames: Uint8Array[] = [];
  for (let index = 0; index < count; index++) {
    const slice = gzipped.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
    const sealed = encryptChunk(dataKey, ivPrefix, { id: full.id, index, count }, slice);
    const frame = new Uint8Array(4 + sealed.length);
    new DataView(frame.buffer).setUint32(0, index);
    frame.set(sealed, 4);
    frames.push(frame);
    await pause();
  }
  return { meta: full, dataKey, ivPrefix, frames };
}

type PairQr = { roomId: string; publicKey: Uint8Array; secret: Uint8Array };

/** Reads `money2time://pair?r=…&pk=…&s=…`, or null for anything else. */
export function parsePairQr(text: string): PairQr | null {
  const match = /^money2time:\/\/pair\?(.+)$/.exec(text.trim());
  if (!match) return null;
  const params = new Map(match[1].split('&').map((part) => part.split('=') as [string, string]));
  const roomId = params.get('r') ?? '';
  const pk = params.get('pk') ?? '';
  const secret = params.get('s') ?? '';
  if (
    !/^[A-Za-z0-9_-]{22}$/.test(roomId) ||
    !/^[A-Za-z0-9_-]{87}$/.test(pk) ||
    !/^[A-Za-z0-9_-]{22}$/.test(secret)
  ) {
    return null;
  }
  try {
    return { roomId, publicKey: fromBase64Url(pk), secret: fromBase64Url(secret) };
  } catch {
    return null;
  }
}

/**
 * The browser's name, as the website makes it ("Chrome on Mac"), or null.
 * It is shown in the confirmation the person reads before linking, so a page
 * cannot put words there of its own.
 */
export function cleanBrowserName(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  return /^(Chrome|Edge|Firefox|Safari|Browser)( on (Mac|Windows|ChromeOS|Android|iOS|Linux))?$/.test(
    name,
  )
    ? name
    : null;
}

function socketFor(deps: LinkDeps, token: string): WebSocket {
  const url = `${deps.relayUrl.replace(/^http/, 'ws').replace(/\/+$/, '')}/v1/room?role=phone`;
  const protocols = [RELAY_PROTOCOL, token];
  const socket = new WebSocket(url, protocols);
  socket.binaryType = 'arraybuffer';
  return socket;
}

function parse(data: unknown): Record<string, unknown> | null {
  if (typeof data !== 'string') return null;
  try {
    const value = JSON.parse(data) as unknown;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Reconnect delays with jitter, so many phones behind one address do not reconnect in step. */
function backoff(attempt: number): number {
  const base = RECONNECT_MS[Math.min(attempt, RECONNECT_MS.length - 1)];
  return base / 2 + Math.random() * base;
}

/** A browser that answered the scanned QR, waiting for the person to confirm. */
type PendingLink = {
  browserName: string | null;
  /** Six digits the browser shows too; the person checks they match. */
  code: string;
  /** Links it: resolves with the record to keep once the browser accepts too. */
  confirm: () => Promise<LinkRecord>;
  cancel: () => void;
};

/**
 * Starts linking the browser whose QR code was scanned. Resolves once that
 * browser has answered (proving it holds the QR's private key), with the code
 * to show; nothing is linked until `confirm`, and then not until the browser
 * confirms too.
 */
export function startLink(
  qrText: string,
  phoneName: string | null,
  deps: LinkDeps,
): Promise<PendingLink> {
  const qr = parsePairQr(qrText);
  if (!qr) return Promise.reject(new LinkError('invalid_qr'));
  const pair = linkKeyPair(deps.random);
  const derived: DerivedLink = deriveLink(pair.secretKey, qr.publicKey, qr.secret);
  const socket = socketFor(deps, qr.roomId);
  const heartbeat = setInterval(() => socket.readyState === 1 && socket.send('ping'), HEARTBEAT_MS);
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearInterval(heartbeat);
    socket.close();
  };
  // While confirming: how the browser's answer, or its going away, reaches `confirm`.
  let settleConfirm: ((outcome: 'linked' | 'closed' | 'timeout') => void) | null = null;

  return new Promise<PendingLink>((resolve, reject) => {
    let answered = false;
    const end = (error: LinkError) => {
      settleConfirm?.('closed');
      finish();
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => end(new LinkError('timeout')), PAIR_TIMEOUT_MS);
    let sentPair = false;
    socket.onerror = () => end(new LinkError('offline'));
    socket.onclose = () => end(new LinkError('closed'));
    socket.onmessage = (event) => {
      const message = parse(event.data);
      if (!message) return;
      if (message.t === 'peer') {
        if (message.present && !sentPair) {
          sentPair = true;
          socket.send(JSON.stringify({ t: 'pair', pk: toBase64Url(pair.publicKey) }));
        } else if (!message.present && sentPair) {
          end(new LinkError('closed'));
        }
        return;
      }
      if (message.t !== 'e') return;
      const inner = openMessage<{ type: string; name?: unknown }>(
        derived.key,
        message as Sealed,
        'b2p',
      );
      if (!inner) return;
      if (inner.type === 'linked') {
        settleConfirm?.('linked');
        return;
      }
      if (inner.type !== 'hello' || answered) return;
      // Only the browser holding the QR's private key could seal this.
      answered = true;
      clearTimeout(timer);
      const browserName = cleanBrowserName(inner.name);
      resolve({
        browserName,
        code: derived.code,
        cancel: finish,
        confirm: () =>
          new Promise<LinkRecord>((done, refuse) => {
            if (finished || socket.readyState !== 1) {
              finish();
              refuse(new LinkError('closed'));
              return;
            }
            const wait = setTimeout(() => settleConfirm?.('timeout'), CONFIRM_TIMEOUT_MS);
            settleConfirm = (outcome) => {
              settleConfirm = null;
              clearTimeout(wait);
              finish();
              if (outcome !== 'linked') {
                refuse(new LinkError(outcome));
                return;
              }
              done({
                roomId: derived.roomId,
                key: toBase64Url(derived.key),
                name: browserName,
                createdAt: Date.now(),
                lastSentAt: null,
              });
            };
            socket.send(
              JSON.stringify(
                sealMessage(derived.key, { type: 'paired', name: phoneName }, deps.random, 'p2b'),
              ),
            );
          }),
      });
    };
  });
}

type SessionState = 'connecting' | 'waiting' | 'online' | 'sending' | 'closed';

type SessionEvents = {
  onState?: (state: SessionState) => void;
  /** The browser asked for fresh data (it just opened, or Refresh was pressed). */
  onWant?: (force: boolean) => void;
  onProgress?: (ratio: number) => void;
  /**
   * The link is over: the browser unlinked itself, or (for a session opened
   * with `unlinking`) the browser acknowledged this phone's unlink.
   */
  onUnlinked?: () => void;
  /**
   * The browser sent changes to save. Resolves with the reply it gets; the
   * session sends it. Without a handler every edit is refused.
   */
  onEdit?: (message: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

type Transfer = {
  id: string;
  sent: number;
  acked: number;
  aborted: boolean;
  wake: (() => void) | null;
  done: ((ok: boolean) => void) | null;
};

/**
 * The phone's seat in one link's room while the Web Dashboard screen is
 * open. It reconnects on its own until `close`. Opened with `unlinking`, it
 * only delivers this phone's unlink, each time the browser is there, until
 * the browser acknowledges it.
 */
export class PhoneSession {
  readonly link: LinkRecord;
  readonly unlinking: boolean;
  state: SessionState = 'connecting';
  private readonly key: Uint8Array;
  private readonly deps: LinkDeps;
  private readonly events: SessionEvents;
  private socket: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private browserHere = false;
  /** The browser's latest request; a transfer must echo it. */
  private nonce: string | null = null;
  /** Requests already answered, so a replayed one does nothing. */
  private seen: string[] = [];
  /** Edits already handled; the edit token refuses a replay too. */
  private seenEdits: string[] = [];
  private sending = false;
  private transfer: Transfer | null = null;

  constructor(
    link: LinkRecord,
    deps: LinkDeps,
    events: SessionEvents = {},
    opts: { unlinking?: boolean } = {},
  ) {
    this.link = link;
    this.unlinking = Boolean(opts.unlinking);
    this.key = fromBase64Url(link.key);
    this.deps = deps;
    this.events = events;
    this.connect();
  }

  private setState(state: SessionState) {
    if (this.state === state) return;
    this.state = state;
    this.events.onState?.(state);
  }

  private settle() {
    if (this.closed) return;
    this.setState(
      this.sending
        ? 'sending'
        : !this.socket
          ? 'connecting'
          : this.browserHere && !this.unlinking
            ? 'online'
            : 'waiting',
    );
  }

  /** Stops a transfer in flight: the browser left or the socket changed. */
  private abort() {
    const transfer = this.transfer;
    if (!transfer) return;
    transfer.aborted = true;
    transfer.wake?.();
    transfer.done?.(false);
  }

  private connect() {
    if (this.closed) return;
    this.setState('connecting');
    const socket = socketFor(this.deps, this.link.roomId);
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      this.settle();
    };
    socket.onmessage = (event) => this.receive(event.data);
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.browserHere = false;
      this.nonce = null;
      if (this.pongTimer) clearTimeout(this.pongTimer);
      this.abort();
      if (this.closed) return;
      this.settle();
      // Even when another seat replaced this one (4000): the relay lets in only
      // holders of the room token, so that was this phone itself, and the
      // newer seat wins the next round anyway.
      this.reconnectTimer = setTimeout(() => this.connect(), backoff(this.attempt++));
    };
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);
  }

  private ping() {
    const socket = this.socket;
    if (!socket || socket.readyState !== 1) return;
    socket.send('ping');
    if (this.pongTimer) clearTimeout(this.pongTimer);
    // No pong: the network went away without closing the socket.
    this.pongTimer = setTimeout(() => {
      if (this.socket === socket) socket.close();
    }, PONG_TIMEOUT_MS);
  }

  private receive(data: unknown) {
    if (data === 'pong') {
      if (this.pongTimer) clearTimeout(this.pongTimer);
      return;
    }
    const message = parse(data);
    if (!message) return;
    if (message.t === 'peer') {
      this.browserHere = Boolean(message.present);
      if (!this.browserHere) {
        this.nonce = null;
        this.abort();
      } else if (this.unlinking) {
        this.sendSealed({ type: 'unlink' });
      }
      this.settle();
      return;
    }
    if (message.t === 'ack') {
      const transfer = this.transfer;
      const n = message.n;
      if (!transfer || message.id !== transfer.id || typeof n !== 'number' || !Number.isInteger(n))
        return;
      if (n < 0 || n > transfer.sent) return;
      transfer.acked = Math.max(transfer.acked, n);
      transfer.wake?.();
      return;
    }
    if (message.t !== 'e') return;
    const inner = openMessage<{
      type: string;
      force?: boolean;
      ok?: boolean;
      nonce?: unknown;
      id?: string;
    }>(this.key, message as Sealed, 'b2p');
    if (!inner) return;
    if (inner.type === 'unlink') {
      // The browser unlinked itself: say it was heard, then forget the link.
      this.sendSealed({ type: 'unlinked' });
      this.events.onUnlinked?.();
      this.close();
    } else if (inner.type === 'unlinked' && this.unlinking) {
      this.events.onUnlinked?.();
      this.close();
    } else if (this.unlinking) {
      // An unlinking seat answers nothing else, and asks again.
      if (inner.type === 'want') this.sendSealed({ type: 'unlink' });
    } else if (
      inner.type === 'want' &&
      typeof inner.nonce === 'string' &&
      /^[\w-]{16}$/.test(inner.nonce)
    ) {
      if (this.seen.includes(inner.nonce)) return;
      this.seen = [...this.seen.slice(-(SEEN_NONCES - 1)), inner.nonce];
      this.nonce = inner.nonce;
      this.settle();
      this.events.onWant?.(Boolean(inner.force));
    } else if (inner.type === 'done' && this.transfer && inner.id === this.transfer.id) {
      this.transfer.done?.(inner.ok === true);
    } else if (
      inner.type === 'edit' &&
      typeof inner.id === 'string' &&
      /^[\w-]{16}$/.test(inner.id)
    ) {
      const id = inner.id;
      if (this.seenEdits.includes(id)) return;
      this.seenEdits = [...this.seenEdits.slice(-(SEEN_NONCES - 1)), id];
      const socket = this.socket;
      const handle = this.events.onEdit;
      void (
        handle
          ? handle(inner as Record<string, unknown>)
          : Promise.resolve({ ok: false, error: 'invalid' })
      )
        .catch(() => ({ ok: false, error: 'failed' }))
        .then((reply) => {
          // The reply belongs to the connection the edit came on.
          if (this.socket === socket) this.sendSealed({ ...reply, type: 'edited', id });
        });
    }
  }

  /** Send now: asks the browser for a fresh request, which `onWant` then answers. */
  offer(): boolean {
    if (this.state !== 'online' || this.unlinking) return false;
    this.sendSealed({ type: 'offer' });
    return true;
  }

  private sendSealed(message: unknown) {
    if (this.socket?.readyState !== 1) return;
    this.socket.send(JSON.stringify(sealMessage(this.key, message, this.deps.random, 'p2b')));
  }

  /**
   * Sends fresh data to the browser. `prepare` runs only once the browser is
   * there and has asked, so an absent browser costs nothing. Resolves when the
   * browser has checked and opened it.
   */
  async send(
    prepare: () => Promise<PreparedTransfer>,
    opts: { editToken?: string | null } = {},
  ): Promise<void> {
    if (this.sending || this.unlinking) throw new LinkError('rejected');
    if (this.state !== 'online' || !this.socket || !this.nonce) throw new LinkError('closed');
    this.sending = true;
    this.settle();
    const socket = this.socket;
    const nonce = this.nonce;
    // Each request is answered once.
    this.nonce = null;
    try {
      const prepared = await prepare();
      if (this.socket !== socket || !this.browserHere) throw new LinkError('closed');
      const meta: TransferMeta = { ...prepared.meta, editToken: opts.editToken ?? null };
      const transfer: Transfer = {
        id: meta.id,
        sent: 0,
        acked: 0,
        aborted: false,
        wake: null,
        done: null,
      };
      this.transfer = transfer;
      const done = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), DONE_TIMEOUT_MS + meta.count * 2000);
        transfer.done = (ok) => {
          clearTimeout(timer);
          transfer.done = null;
          resolve(ok);
        };
      });
      this.sendSealed({
        type: 'begin',
        nonce,
        meta,
        key: toBase64Url(prepared.dataKey),
        iv: toBase64Url(prepared.ivPrefix),
      });
      for (let index = 0; index < meta.count; index++) {
        while (index - transfer.acked >= WINDOW && !transfer.aborted) {
          const acked = transfer.acked;
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, ACK_TIMEOUT_MS);
            transfer.wake = () => {
              clearTimeout(timer);
              transfer.wake = null;
              resolve();
            };
          });
          // No ack in time: the browser is gone without saying so.
          if (transfer.acked === acked) transfer.aborted = true;
        }
        if (transfer.aborted || this.socket !== socket) throw new LinkError('closed');
        const frame = prepared.frames[index];
        socket.send(
          frame.byteOffset === 0 && frame.buffer.byteLength === frame.byteLength
            ? frame.buffer
            : frame.slice().buffer,
        );
        transfer.sent = index + 1;
        this.events.onProgress?.((index + 1) / meta.count);
      }
      this.sendSealed({ type: 'end', id: meta.id });
      if (!(await done)) throw new LinkError(transfer.aborted ? 'closed' : 'rejected');
    } finally {
      this.transfer = null;
      this.sending = false;
      this.settle();
    }
  }

  close() {
    if (this.closed && !this.socket) return;
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.abort();
    this.setState('closed');
  }
}
