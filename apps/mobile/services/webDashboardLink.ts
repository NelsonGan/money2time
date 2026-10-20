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
 *             browser → sealed {type:'paired', name}
 *             phone → sealed {type:'paired', name}
 *   refresh:  browser → sealed {type:'want', force?}   (when the phone arrives)
 *             phone → sealed {type:'begin', meta}, then binary chunks
 *                     [u32 index][bytes], at most WINDOW ahead of
 *             browser → {t:'ack', n}
 *             phone → sealed {type:'end'};  browser → sealed {type:'done', ok}
 *   either:   sealed {type:'unlink'}
 */

import {
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
const DONE_TIMEOUT_MS = 60_000;
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
  /** How long linking waits for the browser's answer. */
  pairTimeoutMs?: number;
};

export class LinkError extends Error {
  readonly code: 'invalid_qr' | 'timeout' | 'offline' | 'rejected' | 'closed';

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

/**
 * Links the browser whose QR code was scanned. Resolves with the record to
 * keep once both sides have proved they hold the same key.
 */
export function linkBrowser(
  qrText: string,
  phoneName: string | null,
  deps: LinkDeps,
): Promise<LinkRecord> {
  const qr = parsePairQr(qrText);
  if (!qr) return Promise.reject(new LinkError('invalid_qr'));
  const pair = linkKeyPair(deps.random);
  const derived = deriveLink(pair.secretKey, qr.publicKey, qr.secret);
  return new Promise((resolve, reject) => {
    const socket = socketFor(deps, roomUrl(deps.relayUrl, qr.roomId));
    let settled = false;
    const finish = (error: LinkError | null, record?: LinkRecord) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve(record!);
    };
    const timer = setTimeout(
      () => finish(new LinkError('timeout')),
      deps.pairTimeoutMs ?? PAIR_TIMEOUT_MS,
    );
    let sentPair = false;
    socket.onerror = () => finish(new LinkError('offline'));
    socket.onclose = () => finish(new LinkError('closed'));
    socket.onmessage = (event) => {
      const message = parse(event.data);
      if (!message) return;
      if (message.t === 'peer' && message.present && !sentPair) {
        sentPair = true;
        socket.send(JSON.stringify({ t: 'pair', pk: toBase64Url(pair.publicKey) }));
        return;
      }
      if (message.t === 'peer' && !message.present && sentPair) {
        finish(new LinkError('closed'));
        return;
      }
      if (message.t !== 'e') return;
      const inner = openMessage<{ type: string; name?: string }>(derived.key, message as Sealed);
      if (inner?.type !== 'paired') return;
      // The browser could only seal this with the key from our public key
      // and its own private key: the link is genuine.
      socket.send(
        JSON.stringify(sealMessage(derived.key, { type: 'paired', name: phoneName }, deps.random)),
      );
      finish(null, {
        roomId: derived.roomId,
        key: toBase64Url(derived.key),
        name: typeof inner.name === 'string' ? inner.name.slice(0, 80) : null,
        createdAt: Date.now(),
        lastSentAt: null,
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
 * open. It reconnects on its own until `close`.
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
  private acked = 0;
  private ackWaiter: (() => void) | null = null;
  private doneWaiter: ((ok: boolean) => void) | null = null;

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

  private connect() {
    if (this.closed) return;
    this.setState('connecting');
    const socket = socketFor(this.deps, roomUrl(this.deps.relayUrl, this.link.roomId));
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      this.setState('waiting');
    };
    socket.onmessage = (event) => this.receive(event.data);
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.ackWaiter?.();
      this.doneWaiter?.(false);
      if (this.closed) return;
      this.setState('connecting');
      const delay = RECONNECT_MS[Math.min(this.attempt++, RECONNECT_MS.length - 1)];
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private receive(data: unknown) {
    const message = parse(data);
    if (!message) return;
    if (message.t === 'peer') {
      if (this.state !== 'sending') this.setState(message.present ? 'online' : 'waiting');
      return;
    }
    if (message.t === 'ack' && typeof message.n === 'number') {
      this.acked = Math.max(this.acked, message.n);
      this.ackWaiter?.();
      return;
    }
    if (message.t !== 'e') return;
    const inner = openMessage<{ type: string; force?: boolean; ok?: boolean }>(
      this.key,
      message as Sealed,
    );
    if (!inner) return;
    if (inner.type === 'want') {
      if (this.state === 'waiting') this.setState('online');
      this.events.onWant?.(Boolean(inner.force));
    } else if (inner.type === 'done') {
      this.doneWaiter?.(inner.ok === true);
    } else if (inner.type === 'unlink') {
      this.events.onUnlinked?.();
      this.close();
    }
  }

  private sendSealed(message: unknown) {
    this.socket?.send(JSON.stringify(sealMessage(this.key, message, this.deps.random)));
  }

  /**
   * Sends fresh data to the browser. `build` runs only once the browser is
   * there, so an absent browser costs nothing. Resolves when the browser has
   * checked and opened it.
   */
  async send(build: () => Promise<Outgoing>): Promise<void> {
    if (this.state !== 'online' || !this.socket) throw new LinkError('closed');
    this.setState('sending');
    try {
      const { data, meta } = await build();
      const chunks = Math.max(1, Math.ceil(data.length / CHUNK_BYTES));
      const full: TransferMeta = {
        ...meta,
        id: toBase64Url(this.deps.random(12)),
        size: data.length,
        sha256: this.deps.sha256Hex(data),
        chunks,
      };
      this.acked = 0;
      const done = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), DONE_TIMEOUT_MS + chunks * 2000);
        this.doneWaiter = (ok) => {
          clearTimeout(timer);
          this.doneWaiter = null;
          resolve(ok);
        };
      });
      this.sendSealed({ type: 'begin', meta: full });
      for (let index = 0; index < chunks; index++) {
        while (index - this.acked >= WINDOW) {
          if (!this.socket) throw new LinkError('closed');
          await new Promise<void>((resolve) => {
            this.ackWaiter = () => {
              this.ackWaiter = null;
              resolve();
            };
          });
        }
        if (!this.socket) throw new LinkError('closed');
        const slice = data.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
        const frame = new Uint8Array(4 + slice.length);
        new DataView(frame.buffer).setUint32(0, index);
        frame.set(slice, 4);
        this.socket.send(frame.buffer);
        this.events.onProgress?.((index + 1) / chunks);
      }
      this.sendSealed({ type: 'end' });
      if (!(await done)) throw new LinkError('rejected');
    } finally {
      this.ackWaiter = null;
      this.doneWaiter = null;
      if (!this.closed) this.setState(this.socket ? 'online' : 'connecting');
    }
  }

  /** Tells the browser to forget this link (it clears its copy), then leaves. */
  unlink() {
    if (this.socket?.readyState === 1) this.sendSealed({ type: 'unlink' });
    this.close();
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.ackWaiter?.();
    this.doneWaiter?.(false);
    this.setState('closed');
  }
}
