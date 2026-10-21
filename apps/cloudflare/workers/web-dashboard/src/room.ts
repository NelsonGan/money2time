// One relay room: at most one phone and one browser, and every message one
// sends goes straight to the other. Nothing is stored: the room has no
// storage calls at all, keeps no message after forwarding it, and forgets
// both sockets when they close. What passes through is end-to-end encrypted
// between the two devices (see the app's services/webDashboardCrypto.ts), so
// the relay could not read it even while it is in flight.
//
// The room also tells each side when the other arrives or leaves:
//   {"t":"peer","present":true|false}
// and answers "ping" with "pong" without waking, so clients can keep their
// socket alive. Every other message is the peers' own and is forwarded untouched.

import { DurableObject } from 'cloudflare:workers';

import type { Env } from './env';

export type Role = 'phone' | 'browser';

/** `sent` is the connection's byte count, saved each MiB so hibernation cannot reset it. */
type Attachment = { role: Role; replaced?: boolean; sent?: number };

const other = (role: Role): Role => (role === 'phone' ? 'browser' : 'phone');

/** The largest sealed control message is a few kilobytes; nothing needs more. */
const MAX_TEXT_CHARS = 64 * 1024;
/** One data chunk: a 4-byte index, 256 KiB of ciphertext and the GCM tag. */
const MAX_BINARY_BYTES = 256 * 1024 + 64;
/**
 * What one connection may push before the room closes it: a whole 128 MiB
 * transfer (and a resend) from the phone, and from the browser its control
 * messages, acks and edits (a bulk edit is up to 64K characters, counted at
 * three bytes each). Kept in the socket's attachment, so a room that
 * hibernates between messages still counts what came before.
 */
const BUDGET_BYTES: Record<Role, number> = { phone: 300 * 1024 * 1024, browser: 24 * 1024 * 1024 };
const SAVE_EVERY_BYTES = 1024 * 1024;

function attachment(ws: WebSocket): Attachment | null {
  return (ws.deserializeAttachment() as Attachment | null) ?? null;
}

/** Sends, ignoring a socket that is already going away. */
function trySend(ws: WebSocket, message: string | ArrayBuffer): void {
  try {
    ws.send(message);
  } catch {
    // Closed or closing; its close handler deals with it.
  }
}

export class Room extends DurableObject<Env> {
  private sent = new Map<WebSocket, number>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  /**
   * The sockets currently holding a role's seat. A socket that was replaced
   * can linger as closing (a phone that changed network never answers the
   * close), so it is marked and never counted or sent to again.
   */
  private live(role: Role): WebSocket[] {
    return this.ctx
      .getWebSockets(role)
      .filter((ws) => ws.readyState === WebSocket.OPEN && !attachment(ws)?.replaced);
  }

  async fetch(request: Request): Promise<Response> {
    const role = new URL(request.url).searchParams.get('role') as Role;
    // A second connection in the same role replaces the first: a reload, a
    // reconnect after the network dropped, or the same browser in a new tab.
    for (const ws of this.ctx.getWebSockets(role)) {
      if (attachment(ws)?.replaced) continue;
      ws.serializeAttachment({ role, replaced: true } satisfies Attachment);
      try {
        ws.close(4000, 'replaced');
      } catch {
        // Already closed.
      }
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [role]);
    server.serializeAttachment({ role } satisfies Attachment);
    const peers = this.live(other(role));
    trySend(server, JSON.stringify({ t: 'peer', present: peers.length > 0 }));
    for (const peer of peers) trySend(peer, JSON.stringify({ t: 'peer', present: true }));
    // The client offered `m2t-v1, <token>`; the handshake must name one back.
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'm2t-v1' } });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const from = attachment(ws);
    if (!from || from.replaced) return;
    // Only the phone sends data chunks; every other frame is a small message.
    // Anything else is not this protocol, and the room is not a free pipe.
    // Text is counted at three bytes a character, its most in UTF-8.
    const size = typeof message === 'string' ? message.length * 3 : message.byteLength;
    const before = this.sent.get(ws) ?? from.sent ?? 0;
    const sent = before + size;
    this.sent.set(ws, sent);
    if (Math.floor(sent / SAVE_EVERY_BYTES) !== Math.floor(before / SAVE_EVERY_BYTES)) {
      ws.serializeAttachment({ ...from, sent } satisfies Attachment);
    }
    const tooBig =
      typeof message === 'string'
        ? message.length > MAX_TEXT_CHARS
        : from.role !== 'phone' || size > MAX_BINARY_BYTES;
    if (tooBig || sent > BUDGET_BYTES[from.role]) {
      try {
        ws.close(1009, 'too much');
      } catch {
        // Already closed.
      }
      return;
    }
    // Presence comes only from the room; a peer cannot fake the other's leaving.
    if (typeof message === 'string') {
      try {
        if ((JSON.parse(message) as { t?: unknown }).t === 'peer') return;
      } catch {
        // Not JSON: the peers' own business.
      }
    }
    for (const peer of this.live(other(from.role))) trySend(peer, message);
  }

  // The runtime answers the peer's Close frame itself (web_socket_auto_reply_to_close,
  // on from compatibility date 2026-04-07), so there is nothing to close here.
  webSocketClose(ws: WebSocket): void {
    this.left(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.left(ws);
  }

  private left(ws: WebSocket): void {
    this.sent.delete(ws);
    const gone = attachment(ws);
    // A replaced socket leaving does not mean the role is gone.
    if (!gone || gone.replaced) return;
    if (this.live(gone.role).some((socket) => socket !== ws)) return;
    for (const peer of this.live(other(gone.role))) trySend(peer, JSON.stringify({ t: 'peer', present: false }));
  }
}
