/**
 * The Web Dashboard's link protocol, the browser's side. It mirrors the app's
 * services/webDashboardLink.ts (the message flow is described there): the
 * phone and this browser meet in a room on the web-dashboard relay Worker,
 * which forwards messages and stores nothing. A socket joins a room by
 * offering the subprotocols `m2t-v1, <token>`, and everything between the two
 * devices is sealed with the link key.
 *
 * Edits (the app's services/webDashboardEdits.ts has the rules): while the
 * phone is here, this browser may send one sealed `edit` at a time, carrying
 * the single-use `editToken` the phone sent with the data on screen. The
 * phone checks it, saves it, answers with a sealed `edited`, and sends the
 * changed data.
 *
 * The phone answers a request it skips (nothing new, or asked again too
 * soon) with a sealed `unchanged`, so the page stops waiting for it.
 *
 * Patches: each request names the transfer whose data this browser holds
 * (`have`). While the phone still has that copy (from this visit to its Web
 * Dashboard screen, or kept from an earlier one), it answers with only what
 * changed since (`meta.base` names that transfer; patch.ts applies it). If
 * it cannot be applied, `requestRepair` asks for everything.
 */

import {
  createLinkOffer,
  decodeIvPrefix,
  decryptChunk,
  deriveLink,
  importDataKey,
  linkQrText,
  openMessage,
  randomBytes,
  sealMessage,
  toBase64Url,
  type DerivedLink,
  type LinkOffer,
  type Sealed,
} from "./crypto";
import { PHONE_ERRORS, type EditError, type EditOp, type EditResult, type ProFeature } from "./edits";

const RELAY_URL = (
  process.env.NEXT_PUBLIC_WEB_DASHBOARD_RELAY_URL || "https://workers-web-dashboard.money2time.com"
).replace(/\/$/, "");
const PROTOCOL = "m2t-v1";
/**
 * What this page can show beyond the first version, named in every `want`
 * (the app's `WANT_FEATURES`). A phone sends a page only what it names:
 * - `budget-currencies`: monthly budgets in another currency than the main one.
 */
const WANT_FEATURES = ["budget-currencies"];

/** A QR code is good for this long before a fresh one replaces it. */
const OFFER_TTL_MS = 2 * 60 * 1000;
const RECONNECT_MS = [1000, 2000, 5000, 10_000, 30_000];
const HEARTBEAT_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;
/** A transfer that sends nothing for this long has stalled. */
const STALL_MS = 30_000;
/**
 * How long a request waits for the phone to begin its answer. The phone builds
 * its export first, which takes a few seconds on a large one; past this, it is
 * not coming and the page stops saying it is.
 */
const BEGIN_WAIT_MS = 60_000;
/** Matches the app: the largest transfer it ever sends. */
const MAX_TRANSFER_BYTES = 128 * 1024 * 1024;
/** Requests this browser made that a transfer may still answer. */
const MAX_OPEN_REQUESTS = 4;
/** Failed attempts before the QR screen says it cannot reach the relay. */
const OFFLINE_AFTER = 3;

export type TransferMeta = {
  id: string;
  exportedAt: string | null;
  appVersion: string | null;
  deviceName: string | null;
  /** The phone's IANA time zone, so dates read the way they do on the phone. */
  timeZone: string | null;
  pro: boolean;
  /**
   * The app's pseudonymous analytics ID (`m2t_<uuid>`), so this browser's
   * dashboard events count as the same person as the phone's. Absent from an
   * app that predates it, whose browser stays anonymous.
   */
  analyticsId?: unknown;
  size: number;
  count: number;
  /**
   * What this browser's next edit must carry. Absent from a phone whose app
   * predates editing from the web, so its data stays read only here.
   */
  editToken?: string | null;
  /** The phone's data version this copy was made at; a saved change raises it. */
  version?: number;
  /** Set on a patch: the id of the transfer whose data it changes. */
  base?: string;
  /**
   * What the phone handles beyond the first version (the app's
   * `WANT_FEATURES`): `budget-currencies` means a budget edit may name its
   * currency; `credit-due-days-after` that an account edit may set
   * `creditDueDaysAfterStatement`. Absent from an older app, which refuses a
   * field it does not know.
   *
   * This page does not name `credit-due-days-after` in its `want`: it changes
   * nothing in what the phone sends, only what the phone takes.
   */
  features?: unknown;
};

/** Whether the phone that sent `meta` takes a credit card due some days after its statement. */
export function phoneTakesCreditDueDaysAfter(meta: { features?: unknown } | null | undefined): boolean {
  return Array.isArray(meta?.features) && meta.features.includes("credit-due-days-after");
}

/** Whether the phone that sent `meta` takes a budget's currency in an edit. */
export function phoneTakesBudgetCurrencies(meta: { features?: unknown } | null | undefined): boolean {
  return Array.isArray(meta?.features) && meta.features.includes("budget-currencies");
}

/** Matches the app: the size of each chunk of a transfer. */
export const CHUNK_BYTES = 256 * 1024;

/** A transfer as received: still encrypted under its own key, plus the gzipped export (or patch) it opens to. */
export type Received = {
  meta: TransferMeta;
  dataKey: CryptoKey;
  ivPrefix: Uint8Array<ArrayBuffer>;
  frames: Uint8Array<ArrayBuffer>[];
  gzipped: Uint8Array<ArrayBuffer>;
};

export type LinkedPhone = { roomId: string; key: CryptoKey; phoneName: string | null };

function roomSocket(token: string): WebSocket {
  const ws = new WebSocket(`${RELAY_URL.replace(/^http/, "ws")}/v1/room?role=browser`, [PROTOCOL, token]);
  ws.binaryType = "arraybuffer";
  return ws;
}

function parse(data: unknown): Record<string, unknown> | null {
  if (typeof data !== "string") return null;
  try {
    const value = JSON.parse(data) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function backoff(attempt: number): number {
  const base = RECONNECT_MS[Math.min(attempt, RECONNECT_MS.length - 1)];
  return base / 2 + Math.random() * base;
}

/**
 * A short, human name for this browser, shown in the phone's list. The phone
 * shows only names of exactly this shape.
 */
function browserName(): string {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Firefox\//.test(ua)
      ? "Firefox"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os =
    /Mac OS X/.test(ua) && !/Mobile/.test(ua)
      ? "Mac"
      : /Windows/.test(ua)
        ? "Windows"
        : /CrOS/.test(ua)
          ? "ChromeOS"
          : /Android/.test(ua)
            ? "Android"
            : /iPhone|iPad/.test(ua)
              ? "iOS"
              : /Linux/.test(ua)
                ? "Linux"
                : "";
  return os ? `${browser} on ${os}` : browser;
}

/** A phone that scanned the QR and confirmed on its side; this browser decides now. */
export type PhoneCandidate = {
  phoneName: string | null;
  code: string;
  accept: () => void;
  reject: () => void;
};

type PairingHandlers = {
  /** Each QR text in turn; null while there is none to show (between codes, or offline). */
  onOffer: (qrText: string | null) => void;
  /** The code a phone that scanned the QR shows too; null when there is none. */
  onCode: (code: string | null) => void;
  /** A phone confirmed; null when it went away or another one interfered. */
  onCandidate: (candidate: PhoneCandidate | null) => void;
  /** Whether the relay can be reached. */
  onReachable: (reachable: boolean) => void;
};

/**
 * Shows a QR offer and waits for a phone to scan it and both people (one on
 * each device) to confirm. A fresh QR replaces the old one every two minutes,
 * and at once if a second phone answers the same QR: only one may be on it.
 * In a hidden tab nobody can scan it, so a QR that runs out there is not
 * replaced (each one is a relay connection) until the tab is seen again.
 * The promise settles with the link once this browser accepts. `signal` stops it.
 */
export function waitForPhone(handlers: PairingHandlers, signal: AbortSignal, name = browserName()): Promise<LinkedPhone> {
  return new Promise((resolve, reject) => {
    let socket: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let settled = false;
    let failures = 0;
    /** The QR ran out (or the relay dropped) while the tab was hidden: a fresh one waits for it to be seen. */
    let paused = false;

    const hidden = () => document.hidden;
    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!hidden()) {
          void open();
          return;
        }
        stop();
        handlers.onOffer(null);
        handlers.onCode(null);
        handlers.onCandidate(null);
        paused = true;
      }, ms);
    };
    const onVisibility = () => {
      if (!paused || hidden() || signal.aborted || settled) return;
      paused = false;
      void open();
    };
    document.addEventListener("visibilitychange", onVisibility);
    const stop = () => {
      if (timer) clearTimeout(timer);
      if (heartbeat) clearInterval(heartbeat);
      timer = null;
      heartbeat = null;
      const current = socket;
      socket = null;
      current?.close();
    };
    signal.addEventListener("abort", () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      if (!settled) reject(new DOMException("aborted", "AbortError"));
    });

    const open = async () => {
      stop();
      paused = false;
      handlers.onOffer(null);
      handlers.onCode(null);
      handlers.onCandidate(null);
      if (signal.aborted || settled) return;
      let offer: LinkOffer;
      try {
        offer = await createLinkOffer();
      } catch {
        reject(new Error("unsupported"));
        return;
      }
      // Aborted while the key pair was being made: show nothing.
      if (signal.aborted) return;
      const ws = roomSocket(offer.roomId);
      socket = ws;
      let candidate: DerivedLink | null = null;
      let answered = false;
      ws.onopen = () => {
        failures = 0;
        handlers.onReachable(true);
        handlers.onOffer(linkQrText(offer));
        heartbeat = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send("ping"), HEARTBEAT_MS);
      };
      ws.onclose = () => {
        if (socket !== ws || signal.aborted || settled) return;
        // The relay restarted or the network dropped: this QR is dead.
        handlers.onOffer(null);
        if (++failures >= OFFLINE_AFTER) handlers.onReachable(false);
        schedule(backoff(failures));
      };
      ws.onmessage = async (event) => {
        const message = parse(event.data);
        if (!message || socket !== ws) return;
        if (message.t === "peer" && !message.present && candidate) {
          // The phone left before both had confirmed.
          void open();
          return;
        }
        if (message.t === "pair" && typeof message.pk === "string") {
          // One phone per QR. A second answer means someone else has it too
          // (a photo, a screen share): start again with a code only this
          // screen has seen.
          if (answered) {
            void open();
            return;
          }
          answered = true;
          let derived: DerivedLink;
          try {
            derived = await deriveLink(offer, message.pk);
          } catch {
            answered = false;
            return;
          }
          if (socket !== ws) return;
          candidate = derived;
          handlers.onCode(derived.code);
          // The person is comparing codes: give them time instead of rotating.
          schedule(OFFER_TTL_MS);
          ws.send(JSON.stringify(await sealMessage(derived.key, { type: "hello", name }, "b2p")));
          return;
        }
        if (message.t !== "e" || !candidate) return;
        const linked = candidate;
        const inner = await openMessage<{ type: string; name?: string | null }>(linked.key, message as unknown as Sealed, "p2b");
        if (inner?.type !== "paired" || socket !== ws) return;
        const phoneName = typeof inner.name === "string" ? inner.name.slice(0, 80) : null;
        handlers.onCandidate({
          phoneName,
          code: linked.code,
          accept: () => {
            if (socket !== ws || settled) return;
            // The phone is gone: it never saved this link, so neither may this browser.
            if (ws.readyState !== WebSocket.OPEN) {
              void open();
              return;
            }
            settled = true;
            if (timer) clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisibility);
            void sealMessage(linked.key, { type: "linked" }, "b2p").then((sealed) => {
              if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(sealed));
              // Let the message leave before the socket closes.
              setTimeout(stop, 500);
              resolve({ roomId: linked.roomId, key: linked.key, phoneName });
            });
          },
          reject: () => void open(),
        });
      };
      schedule(OFFER_TTL_MS);
    };
    void open();
  });
}

/**
 * `receiving` covers a whole answer from the phone: from this browser's
 * request (the phone building its export, `onProgress` not yet called) to the
 * transfer's last chunk.
 */
export type BrowserState = "connecting" | "waiting" | "phone" | "receiving" | "elsewhere";

type BrowserEvents = {
  onState: (state: BrowserState) => void;
  onProgress: (ratio: number) => void;
  onReceived: (received: Received) => void;
  /** The link is over: the phone unlinked this browser, or acknowledged this browser's unlink. */
  onUnlinked: () => void;
  onError: (code: "incomplete") => void;
  /** The id of the transfer whose data this browser holds (or is opening), for the phone to patch. */
  have?: () => string | null;
  /** The phone has nothing newer and this browser holds its last copy: that copy's edit token is good. */
  onCurrent?: () => void;
};

type Incoming = {
  meta: TransferMeta;
  dataKey: CryptoKey;
  ivPrefix: Uint8Array<ArrayBuffer>;
  frames: (Uint8Array<ArrayBuffer> | undefined)[];
  parts: (Uint8Array<ArrayBuffer> | undefined)[];
  received: number;
  stall: ReturnType<typeof setTimeout> | null;
};

function validMeta(meta: unknown): meta is TransferMeta {
  if (!meta || typeof meta !== "object") return false;
  const m = meta as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    /^[\w-]{16}$/.test(m.id) &&
    Number.isInteger(m.size) &&
    Number.isInteger(m.count) &&
    (m.size as number) >= 0 &&
    (m.size as number) <= MAX_TRANSFER_BYTES &&
    m.count === Math.max(1, Math.ceil((m.size as number) / CHUNK_BYTES)) &&
    (m.editToken === undefined || m.editToken === null || (typeof m.editToken === "string" && /^[\w-]{16,64}$/.test(m.editToken))) &&
    (m.version === undefined || (typeof m.version === "number" && Number.isFinite(m.version))) &&
    (m.base === undefined || (typeof m.base === "string" && /^[\w-]{16}$/.test(m.base)))
  );
}

/** The phone saves within a few seconds; past this, its answer is lost. */
const EDIT_TIMEOUT_MS = 30_000;
/** The relay's largest text frame is 64K characters; a sealed edit must fit with room to spare. */
const MAX_EDIT_CHARS = 60_000;


/**
 * This browser's seat in its link's room: it asks the phone for fresh data
 * whenever the phone shows up, receives it, and reconnects on its own until
 * `close`. Opened with `unlinking`, it only tells the phone this browser was
 * unlinked, each time the phone is there, until the phone acknowledges it.
 */
export class BrowserSession {
  state: BrowserState = "connecting";
  readonly unlinking: boolean;
  private readonly link: LinkedPhone;
  private readonly events: BrowserEvents;
  private socket: WebSocket | null = null;
  private closed = false;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private incoming: Incoming | null = null;
  /** Set while a request waits for the phone's `begin`. */
  private beginWait: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();
  /** Nonces of this browser's own requests; a transfer must echo one. */
  private requests: string[] = [];
  /** The edit waiting for the phone's answer, if any. */
  private pendingEdit: { id: string; settle: (result: EditResult) => void; timer: ReturnType<typeof setTimeout>; sent: boolean } | null = null;
  // Back online: reconnect, unless another tab holds the seat.
  private readonly onOnline = () => {
    if (this.state !== "elsewhere") this.reconnect();
  };

  /**
   * `standby` starts it without a seat, as if another tab held it (which it
   * does, when this tab learns of a link made there): `reconnect` takes it.
   */
  constructor(link: LinkedPhone, events: BrowserEvents, opts: { unlinking?: boolean; standby?: boolean } = {}) {
    this.link = link;
    this.events = events;
    this.unlinking = Boolean(opts.unlinking);
    if (typeof window !== "undefined") window.addEventListener("online", this.onOnline);
    if (opts.standby) this.state = "elsewhere";
    else this.connect();
  }

  private setState(state: BrowserState) {
    if (this.state === state) return;
    this.state = state;
    this.events.onState(state);
  }

  private connect() {
    if (this.closed) return;
    this.setState("connecting");
    const ws = roomSocket(this.link.roomId);
    this.socket = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.setState("waiting");
    };
    // In order: a chunk must not be handled before the `begin` sealed ahead of it.
    ws.onmessage = (event) => {
      this.queue = this.queue.then(() => this.receive(event.data)).catch(() => undefined);
    };
    ws.onclose = (event) => {
      if (this.socket !== ws) return;
      this.socket = null;
      this.dropIncoming();
      // Sent, but the answer is lost: it may have been saved.
      this.abandonEdit();
      if (this.pongTimer) clearTimeout(this.pongTimer);
      if (this.closed) return;
      // 4000: another tab of this browser took the seat. It keeps it until
      // this tab takes it back (`reconnect`).
      if (event.code === 4000) {
        this.setState("elsewhere");
        return;
      }
      this.setState("connecting");
      this.reconnectTimer = setTimeout(() => this.connect(), backoff(this.attempt++));
    };
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => this.ping(), HEARTBEAT_MS);
  }

  private ping() {
    const ws = this.socket;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send("ping");
    if (this.pongTimer) clearTimeout(this.pongTimer);
    // No pong: the laptop slept or the network went without closing the socket.
    this.pongTimer = setTimeout(() => {
      if (this.socket === ws) ws.close();
    }, PONG_TIMEOUT_MS);
  }

  private dropIncoming() {
    if (this.incoming?.stall) clearTimeout(this.incoming.stall);
    this.incoming = null;
    this.stopBeginWait();
  }

  private stopBeginWait() {
    if (this.beginWait) clearTimeout(this.beginWait);
    this.beginWait = null;
  }

  private async sendSealed(message: unknown) {
    const sealed = await sealMessage(this.link.key, message, "b2p");
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(sealed));
  }

  private async ask(force: boolean, repair = false) {
    // A closed session must not change the page's state, nor ask.
    if (this.closed) return;
    const nonce = toBase64Url(randomBytes(12));
    this.requests = [...this.requests.slice(-(MAX_OPEN_REQUESTS - 1)), nonce];
    const have = repair ? null : (this.events.have?.() ?? null);
    await this.sendSealed({ type: "want", nonce, force, ...(have ? { have } : {}), ...(repair ? { repair: true } : {}), features: WANT_FEATURES });
    // The phone answers every request, after building its export: say so from
    // now, not only once the first chunk is here. A transfer already under way
    // keeps its own progress.
    if (this.incoming || this.state !== "phone") return;
    this.stopBeginWait();
    this.beginWait = setTimeout(() => {
      this.beginWait = null;
      if (!this.incoming && this.state === "receiving") this.setState("phone");
    }, BEGIN_WAIT_MS);
    this.setState("receiving");
  }

  /** The phone sent nothing for a while mid-transfer: give up on it and say so. */
  private armStall(incoming: Incoming) {
    if (incoming.stall) clearTimeout(incoming.stall);
    incoming.stall = setTimeout(() => {
      if (this.incoming !== incoming) return;
      this.dropIncoming();
      this.setState(this.socket ? "phone" : "connecting");
      void this.sendSealed({ type: "done", id: incoming.meta.id, ok: false });
      this.events.onError("incomplete");
    }, STALL_MS);
  }

  private async receive(data: unknown) {
    if (data === "pong") {
      if (this.pongTimer) clearTimeout(this.pongTimer);
      return;
    }
    if (data instanceof ArrayBuffer) {
      const incoming = this.incoming;
      if (!incoming || data.byteLength < 4 + 16) return;
      const index = new DataView(data).getUint32(0);
      if (index >= incoming.meta.count || incoming.parts[index]) return;
      const frame = new Uint8Array(data.slice(4));
      let plain: Uint8Array<ArrayBuffer>;
      try {
        plain = await decryptChunk(incoming.dataKey, incoming.ivPrefix, { id: incoming.meta.id, index, count: incoming.meta.count }, frame);
      } catch {
        // Not this transfer's chunk: whoever sent it did not have the key.
        return;
      }
      if (this.incoming !== incoming) return;
      incoming.parts[index] = plain;
      incoming.frames[index] = frame;
      incoming.received++;
      this.armStall(incoming);
      this.socket?.send(JSON.stringify({ t: "ack", id: incoming.meta.id, n: incoming.received }));
      this.events.onProgress(incoming.received / incoming.meta.count);
      return;
    }
    const message = parse(data);
    if (!message) return;
    if (message.t === "peer") {
      if (message.present) {
        this.setState("phone");
        if (this.unlinking) await this.sendSealed({ type: "unlink" });
        else await this.ask(false);
      } else {
        this.dropIncoming();
        this.abandonEdit();
        this.setState("waiting");
      }
      return;
    }
    if (message.t !== "e") return;
    const inner = await openMessage<{
      type: string;
      meta?: unknown;
      nonce?: string;
      id?: string;
      key?: string;
      iv?: string;
      ok?: unknown;
      count?: unknown;
      error?: unknown;
      feature?: unknown;
      version?: unknown;
      current?: unknown;
    }>(
      this.link.key,
      message as unknown as Sealed,
      "p2b",
    );
    if (!inner) return;
    if (inner.type === "unlink") {
      // The phone unlinked this browser: say it was heard, then forget everything.
      await this.sendSealed({ type: "unlinked" });
      this.close();
      this.events.onUnlinked();
      return;
    }
    if (inner.type === "unlinked") {
      if (!this.unlinking) return;
      this.close();
      this.events.onUnlinked();
      return;
    }
    if (this.unlinking) return;
    if (inner.type === "edited") {
      if (!this.pendingEdit || inner.id !== this.pendingEdit.id) return;
      if (inner.ok === true) {
        this.settleEdit({
          ok: true,
          count: typeof inner.count === "number" ? inner.count : 0,
          version: typeof inner.version === "number" ? inner.version : null,
        });
      } else {
        const error = PHONE_ERRORS.includes(inner.error as EditError) ? (inner.error as EditError) : "failed";
        const feature = typeof inner.feature === "string" ? (inner.feature as ProFeature) : undefined;
        this.settleEdit(feature ? { ok: false, error, feature } : { ok: false, error });
      }
      return;
    }
    if (inner.type === "offer") {
      await this.ask(true);
    } else if (inner.type === "unchanged") {
      // The phone has nothing new for the latest request (this browser has it
      // already, or asked again too soon): stop saying data is on its way.
      if (!inner.nonce || this.requests.at(-1) !== inner.nonce) return;
      this.requests = this.requests.filter((nonce) => nonce !== inner.nonce);
      if (inner.current === true) this.events.onCurrent?.();
      if (this.incoming || this.state !== "receiving") return;
      this.stopBeginWait();
      this.setState("phone");
    } else if (inner.type === "begin") {
      // Only an answer to a request this browser made, describing a transfer
      // this browser is willing to hold: a replay or a lie is ignored.
      if (!inner.nonce || !this.requests.includes(inner.nonce) || !validMeta(inner.meta)) return;
      if (typeof inner.key !== "string" || typeof inner.iv !== "string") return;
      let dataKey: CryptoKey;
      let ivPrefix: Uint8Array<ArrayBuffer>;
      try {
        dataKey = await importDataKey(inner.key);
        ivPrefix = decodeIvPrefix(inner.iv);
      } catch {
        return;
      }
      this.requests = this.requests.filter((nonce) => nonce !== inner.nonce);
      const meta = inner.meta;
      this.dropIncoming();
      const incoming: Incoming = {
        meta,
        dataKey,
        ivPrefix,
        frames: new Array(meta.count),
        parts: new Array(meta.count),
        received: 0,
        stall: null,
      };
      this.incoming = incoming;
      this.armStall(incoming);
      this.setState("receiving");
      this.events.onProgress(0);
    } else if (inner.type === "end" && this.incoming && inner.id === this.incoming.meta.id) {
      const { meta, parts, frames, received, dataKey, ivPrefix } = this.incoming;
      this.dropIncoming();
      this.setState("phone");
      const total = parts.reduce((sum, part) => sum + (part?.byteLength ?? 0), 0);
      if (received !== meta.count || total !== meta.size) {
        await this.sendSealed({ type: "done", id: meta.id, ok: false });
        this.events.onError("incomplete");
        return;
      }
      const gzipped = new Uint8Array(meta.size);
      let offset = 0;
      for (const part of parts) {
        gzipped.set(part!, offset);
        offset += part!.byteLength;
      }
      await this.sendSealed({ type: "done", id: meta.id, ok: true });
      this.events.onReceived({ meta, dataKey, ivPrefix, frames: frames as Uint8Array<ArrayBuffer>[], gzipped });
    }
  }

  /** Refresh: asks the phone, if it is here, to send its latest data now. */
  requestFresh(): boolean {
    if (this.unlinking) return false;
    // Already on its way.
    if (this.state === "receiving") return true;
    if (this.state !== "phone") return false;
    void this.ask(true);
    return true;
  }

  /** A patch could not be applied to the data here: asks the phone for everything. */
  requestRepair() {
    if (this.unlinking || (this.state !== "phone" && this.state !== "receiving")) return;
    void this.ask(true, true);
  }

  /** The phone went away: a batch it was sent may have been saved; one never sent was not. */
  private abandonEdit() {
    this.settleEdit({ ok: false, error: this.pendingEdit?.sent ? "unknown" : "away" });
  }

  private settleEdit(result: EditResult) {
    const pending = this.pendingEdit;
    if (!pending) return;
    this.pendingEdit = null;
    clearTimeout(pending.timer);
    pending.settle(result);
  }

  /**
   * Sends a batch of changes for the phone to save. Only while the phone is
   * here and has sent this browser an edit token; one batch at a time.
   */
  async edit(token: string, ops: EditOp[]): Promise<EditResult> {
    if (this.unlinking || this.state !== "phone") return { ok: false, error: "away" };
    if (this.pendingEdit) return { ok: false, error: "busy" };
    const id = toBase64Url(randomBytes(12));
    // Taken before anything is awaited, so a second edit in the same tick waits its turn.
    let settle: (result: EditResult) => void = () => undefined;
    const result = new Promise<EditResult>((resolve) => {
      settle = resolve;
    });
    const pending = {
      id,
      settle,
      timer: setTimeout(() => {
        if (this.pendingEdit === pending) this.abandonEdit();
      }, EDIT_TIMEOUT_MS),
      sent: false,
    };
    this.pendingEdit = pending;
    const sealed = JSON.stringify(await sealMessage(this.link.key, { type: "edit", id, token, ops }, "b2p"));
    if (this.pendingEdit !== pending) return result;
    if (sealed.length > MAX_EDIT_CHARS) {
      this.settleEdit({ ok: false, error: "too_large" });
      return result;
    }
    if (this.socket?.readyState !== WebSocket.OPEN || this.state !== "phone") {
      this.settleEdit({ ok: false, error: "away" });
      return result;
    }
    this.socket.send(sealed);
    pending.sent = true;
    return result;
  }

  /** Reconnects now: back online, or this tab taking the seat back from another. */
  reconnect() {
    if (this.closed || (this.socket && this.state !== "elsewhere")) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.attempt = 0;
    this.connect();
  }

  /** Tells the phone, if it is here, to forget this browser. Returns whether it was here to hear it. */
  async tellUnlinked(): Promise<boolean> {
    if (this.state !== "phone" && this.state !== "receiving") return false;
    await this.sendSealed({ type: "unlink" });
    return true;
  }

  close() {
    this.closed = true;
    this.abandonEdit();
    if (typeof window !== "undefined") window.removeEventListener("online", this.onOnline);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.dropIncoming();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }
}

/** Reopens a cached transfer: decrypts its chunks again into the gzipped export. */
export async function reopen(cached: {
  meta: TransferMeta;
  dataKey: CryptoKey;
  ivPrefix: Uint8Array<ArrayBuffer>;
  frames: Uint8Array<ArrayBuffer>[];
}): Promise<Uint8Array<ArrayBuffer>> {
  const { meta } = cached;
  const gzipped = new Uint8Array(meta.size);
  let offset = 0;
  for (let index = 0; index < meta.count; index++) {
    const part = await decryptChunk(cached.dataKey, cached.ivPrefix, { id: meta.id, index, count: meta.count }, cached.frames[index]);
    gzipped.set(part, offset);
    offset += part.byteLength;
  }
  return gzipped;
}
