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

type Attachment = { role: Role; replaced?: boolean };

const other = (role: Role): Role => (role === 'phone' ? 'browser' : 'phone');

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
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const from = attachment(ws);
    if (!from || from.replaced) return;
    for (const peer of this.live(other(from.role))) trySend(peer, message);
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    this.left(ws);
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // Already closed.
    }
  }

  webSocketError(ws: WebSocket): void {
    this.left(ws);
  }

  private left(ws: WebSocket): void {
    const gone = attachment(ws);
    // A replaced socket leaving does not mean the role is gone.
    if (!gone || gone.replaced) return;
    if (this.live(gone.role).some((socket) => socket !== ws)) return;
    for (const peer of this.live(other(gone.role))) trySend(peer, JSON.stringify({ t: 'peer', present: false }));
  }
}
