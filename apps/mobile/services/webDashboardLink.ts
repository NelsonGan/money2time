/**
 * The Web Dashboard's link protocol, the phone's side. Plain TypeScript over
 * an injected WebSocket and randomness, so it runs in the app and in tests
 * against the website's half (src/lib/cloud/relay.ts in the website repo).
 *
 * The phone and the browser meet in a relay room (the web-dashboard Worker)
 * that forwards messages and stores nothing. Every message between them is
 * sealed with the link key (webDashboardCrypto.ts) except the first one of a
 * link, which carries only the phone's public key, and flow-control acks.
 *
 *   link:     phone → {t:'pair', pk}            (in the QR's one-off room)
 *             browser → sealed {type:'hello', name}; both screens show the code
 *             (the person confirms on the phone)
 *             phone → sealed {type:'paired', name};  browser → sealed {type:'linked'}
 *   refresh:  browser → sealed {type:'want', nonce, force}   (when the phone arrives)
 *             phone → sealed {type:'begin', nonce, meta}, then binary chunks
 *                     [u32 index][bytes], at most WINDOW ahead of
 *             browser → {t:'ack', n}
 *             phone → sealed {type:'end', id};  browser → sealed {type:'done', id, ok}
 *   either:   sealed {type:'unlink'}
 *
 * Sealed messages carry their direction in the AAD, and a transfer must echo
 * the nonce of a request the browser made, so a relay cannot reflect or
 * replay one. Both sides send "ping" every 25 s; the relay answers "pong".
 */

import {
  type DerivedLink,
  deriveLink,
  fromBase64Url,
  linkKeyPair,
  openMessage,
  type RandomBytes,
  type Sealed,
  sealMessage,
  toBase64Url,
} from './webDashboardCrypto';

export const CHUNK_BYTES = 256 * 1024;
export const WINDOW = 8;
const PAIR_TIMEOUT_MS = 30_000;
const CONFIRM_TIMEOUT_MS = 15_000;
const ACK_TIMEOUT_MS = 20_000;
const DONE_TIMEOUT_MS = 60_000;
const HEARTBEAT_MS = 25_000;
const RECONNECT_MS = [1000, 2000, 5000, 10_000];

/** A browser this phone has linked. `key` is the link key, base64url. */
export type LinkRecord = {
  roomId: string;
  key: string;
  name: string | null;
  createdAt: number;
  lastSentAt: number | null;
};

export type TransferMeta = {
  id: string;
  exportedAt: string | null;
  appVersion: string | null;
  deviceName: string | null;
  /** Money2Time Pro on this phone, so the dashboard can unlock Pro views. */
  pro: boolean;
  size: number;
  sha256: string;
  chunks: number;
};

/** What the phone sends: the encrypted data and the facts about it. */
export type Outgoing = {
  data: Uint8Array;
  meta: Omit<TransferMeta, 'id' | 'size' | 'sha256' | 'chunks'>;
};

export type LinkDeps = {
  /** The relay's base URL, e.g. https://workers-web-dashboard.money2time.com */
  relayUrl: string;
  random: RandomBytes;
  sha256Hex: (data: Uint8Array) => string;
  createSocket?: (url: string) => WebSocket;
  /** How long linking waits for the browser's first answer. */
  pairTimeoutMs?: number;
};

export class LinkError extends Error {
  readonly code: 'invalid_qr' | 'timeout' | 'offline' | 'rejected' | 'closed' | 'cancelled';

  constructor(code: LinkError['code']) {
    super(code);
    this.code = code;
  }
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

function roomUrl(relayUrl: string, roomId: string): string {
  return `${relayUrl.replace(/^http/, 'ws').replace(/\/+$/, '')}/v1/rooms/${roomId}?role=phone`;
}

function socketFor(deps: LinkDeps, url: string): WebSocket {
  const socket = deps.createSocket ? deps.createSocket(url) : new WebSocket(url);
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

/** A browser that answered the scanned QR, waiting for the person to confirm. */
export type PendingLink = {
  browserName: string | null;
  /** Six digits the browser shows too; the person checks they match. */
  code: string;
  /** Links it: resolves with the record to keep once the browser accepts. */
  confirm: () => Promise<LinkRecord>;
  cancel: () => void;
};

/**
 * Starts linking the browser whose QR code was scanned. Resolves once that
 * browser has answered (proving it holds the QR's private key), with the code
 * to show; nothing is linked until `confirm`.
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
  const socket = socketFor(deps, roomUrl(deps.relayUrl, qr.roomId));
  const heartbeat = setInterval(() => socket.readyState === 1 && socket.send('ping'), HEARTBEAT_MS);
  const finish = () => {
    clearInterval(heartbeat);
    socket.close();
  };
  let onLinked: ((ok: boolean) => void) | null = null;
  let onGone: (() => void) | null = null;

  return new Promise<PendingLink>((resolve, reject) => {
    let answered = false;
    const fail = (error: LinkError) => {
      onGone?.();
      if (answered) return;
      answered = true;
      clearTimeout(timer);
      finish();
      reject(error);
    };
    const timer = setTimeout(
      () => fail(new LinkError('timeout')),
      deps.pairTimeoutMs ?? PAIR_TIMEOUT_MS,
    );
    let sentPair = false;
    socket.onerror = () => fail(new LinkError('offline'));
    socket.onclose = () => fail(new LinkError('closed'));
    socket.onmessage = (event) => {
      const message = parse(event.data);
      if (!message) return;
      if (message.t === 'peer') {
        if (message.present && !sentPair) {
          sentPair = true;
          socket.send(JSON.stringify({ t: 'pair', pk: toBase64Url(pair.publicKey) }));
        } else if (!message.present && sentPair) {
          fail(new LinkError('closed'));
        }
        return;
      }
      if (message.t !== 'e') return;
      const inner = openMessage<{ type: string; name?: string }>(
        derived.key,
        message as Sealed,
        'b2p',
      );
      if (!inner) return;
      if (inner.type === 'linked') {
        onLinked?.(true);
        return;
      }
      if (inner.type !== 'hello' || answered) return;
      // Only the browser holding the QR's private key could seal this.
      answered = true;
      clearTimeout(timer);
      const browserName = typeof inner.name === 'string' ? inner.name.slice(0, 80) : null;
      resolve({
        browserName,
        code: derived.code,
        confirm: () =>
          new Promise<LinkRecord>((done, refuse) => {
            if (socket.readyState !== 1) {
              refuse(new LinkError('closed'));
              return;
            }
            const wait = setTimeout(() => {
              finish();
              refuse(new LinkError('timeout'));
            }, CONFIRM_TIMEOUT_MS);
            onGone = () => {
              clearTimeout(wait);
              refuse(new LinkError('closed'));
            };
            onLinked = () => {
              clearTimeout(wait);
              onGone = null;
              finish();
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
        cancel: finish,
      });
    };
  });
}

export type SessionState = 'connecting' | 'waiting' | 'online' | 'sending' | 'closed';

export type SessionEvents = {
  onState?: (state: SessionState) => void;
  /** The browser asked for fresh data (it just opened, or Refresh was pressed). */
  onWant?: (force: boolean) => void;
  onProgress?: (ratio: number) => void;
  /** The browser unlinked itself; forget this link. */
  onUnlinked?: () => void;
};

/**
 * The phone's seat in one link's room while the Web Dashboard screen is
 * open. It reconnects on its own until `close`, or until another seat for
 * the same link replaces it.
 */
export class PhoneSession {
  readonly link: LinkRecord;
  state: SessionState = 'connecting';
  private readonly key: Uint8Array;
  private readonly deps: LinkDeps;
  private readonly events: SessionEvents;
  private socket: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private browserHere = false;
  /** The browser's latest request; a transfer must echo it. */
  private nonce: string | null = null;
  private sending = false;
  private transfer: {
    id: string;
    acked: number;
    aborted: boolean;
    wake: (() => void) | null;
    done: ((ok: boolean) => void) | null;
  } | null = null;

  constructor(link: LinkRecord, deps: LinkDeps, events: SessionEvents = {}) {
    this.link = link;
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
          : this.browserHere && this.nonce
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
    const socket = socketFor(this.deps, roomUrl(this.deps.relayUrl, this.link.roomId));
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      this.settle();
    };
    socket.onmessage = (event) => this.receive(event.data);
    socket.onclose = (event) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.browserHere = false;
      this.nonce = null;
      this.abort();
      // Another seat for this link took over (this phone opened it twice):
      // that one carries on, this one stops.
      if (this.closed || event.code === 4000) {
        this.close();
        return;
      }
      this.settle();
      const delay = RECONNECT_MS[Math.min(this.attempt++, RECONNECT_MS.length - 1)];
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(
      () => this.socket?.readyState === 1 && this.socket.send('ping'),
      HEARTBEAT_MS,
    );
  }

  private receive(data: unknown) {
    const message = parse(data);
    if (!message) return;
    if (message.t === 'peer') {
      this.browserHere = Boolean(message.present);
      if (!this.browserHere) {
        this.nonce = null;
        this.abort();
      }
      this.settle();
      return;
    }
    if (message.t === 'ack' && typeof message.n === 'number' && this.transfer) {
      this.transfer.acked = Math.max(this.transfer.acked, message.n);
      this.transfer.wake?.();
      return;
    }
    if (message.t !== 'e') return;
    const inner = openMessage<{
      type: string;
      force?: boolean;
      ok?: boolean;
      nonce?: string;
      id?: string;
    }>(this.key, message as Sealed, 'b2p');
    if (!inner) return;
    if (inner.type === 'want' && typeof inner.nonce === 'string') {
      this.nonce = inner.nonce;
      this.settle();
      this.events.onWant?.(Boolean(inner.force));
    } else if (inner.type === 'done' && this.transfer && inner.id === this.transfer.id) {
      this.transfer.done?.(inner.ok === true);
    } else if (inner.type === 'unlink') {
      this.events.onUnlinked?.();
      this.close();
    }
  }

  private sendSealed(message: unknown) {
    this.socket?.send(JSON.stringify(sealMessage(this.key, message, this.deps.random, 'p2b')));
  }

  /**
   * Sends fresh data to the browser. `build` runs only once the browser is
   * there and has asked, so an absent browser costs nothing. Resolves when the
   * browser has checked and opened it.
   */
  async send(build: () => Promise<Outgoing>): Promise<void> {
    if (this.sending) throw new LinkError('rejected');
    if (this.state !== 'online' || !this.socket || !this.nonce) throw new LinkError('closed');
    this.sending = true;
    this.settle();
    const socket = this.socket;
    const nonce = this.nonce;
    try {
      const { data, meta } = await build();
      if (this.socket !== socket || !this.browserHere) throw new LinkError('closed');
      const chunks = Math.max(1, Math.ceil(data.length / CHUNK_BYTES));
      const full: TransferMeta = {
        ...meta,
        id: toBase64Url(this.deps.random(12)),
        size: data.length,
        sha256: this.deps.sha256Hex(data),
        chunks,
      };
      const transfer: NonNullable<PhoneSession['transfer']> = {
        id: full.id,
        acked: 0,
        aborted: false,
        wake: null,
        done: null,
      };
      this.transfer = transfer;
      const done = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), DONE_TIMEOUT_MS + chunks * 2000);
        transfer.done = (ok) => {
          clearTimeout(timer);
          transfer.done = null;
          resolve(ok);
        };
      });
      this.sendSealed({ type: 'begin', nonce, meta: full });
      for (let index = 0; index < chunks; index++) {
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
        const slice = data.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
        const frame = new Uint8Array(4 + slice.length);
        new DataView(frame.buffer).setUint32(0, index);
        frame.set(slice, 4);
        socket.send(frame.buffer);
        this.events.onProgress?.((index + 1) / chunks);
      }
      this.sendSealed({ type: 'end', id: full.id });
      if (!(await done)) throw new LinkError(transfer.aborted ? 'closed' : 'rejected');
    } finally {
      this.transfer = null;
      this.sending = false;
      this.settle();
    }
  }

  /** Tells the browser to forget this link (it clears its copy), then leaves. */
  unlink() {
    if (this.socket?.readyState === 1) this.sendSealed({ type: 'unlink' });
    this.close();
  }

  close() {
    if (this.closed && !this.socket) return;
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.abort();
    this.setState('closed');
  }
}
