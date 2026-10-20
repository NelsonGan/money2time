// One relay room: at most one phone and one browser, and every message one
// sends goes straight to the other. Nothing is stored: the room has no
// storage calls at all, keeps no message after forwarding it, and forgets
// both sockets when they close. What passes through is end-to-end encrypted
// between the two devices (see the app's services/webDashboardCrypto.ts), so
// the relay could not read it even while it is in flight.
//
// The room also tells each side when the other arrives or leaves:
//   {"t":"peer","present":true|false}
// Every other message is the peers' own and is forwarded untouched.

import { DurableObject } from 'cloudflare:workers';

import type { Env } from './env';

export type Role = 'phone' | 'browser';

const other = (role: Role): Role => (role === 'phone' ? 'browser' : 'phone');

export class Room extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const role = new URL(request.url).searchParams.get('role') as Role;
    // A second connection in the same role replaces the first: a reload, a
    // reconnect after the network dropped, or the same browser in a new tab.
    for (const ws of this.ctx.getWebSockets(role)) {
      ws.close(4000, 'replaced');
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [role]);
    const peers = this.ctx.getWebSockets(other(role));
    server.send(JSON.stringify({ t: 'peer', present: peers.length > 0 }));
    for (const peer of peers) peer.send(JSON.stringify({ t: 'peer', present: true }));
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    const role = this.ctx.getTags(ws)[0] as Role | undefined;
    if (!role) return;
    for (const peer of this.ctx.getWebSockets(other(role))) peer.send(message);
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
    const role = this.ctx.getTags(ws)[0] as Role | undefined;
    if (!role) return;
    // A replaced socket leaving does not mean the role is gone.
    if (this.ctx.getWebSockets(role).some((socket) => socket !== ws)) return;
    for (const peer of this.ctx.getWebSockets(other(role))) {
      peer.send(JSON.stringify({ t: 'peer', present: false }));
    }
  }
}
