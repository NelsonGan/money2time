// Live updates. See README.md > Cloud Sync > How it works (When it runs).
//
// One SyncHub Durable Object per user holds a WebSocket from each of their
// open apps. After a phone pushes changes it posts /v1/sync/notify, and the
// hub of every person who reads that channel tells their other phones to
// sync it now. Messages carry only the channel name: the data still moves
// through Turso. The sockets hibernate, so an idle connection costs nothing,
// and the app answers its own pings through the auto-response below.

import type { Env } from './env';
import { json } from './http';

/** The app's own device id for this run of the app, so a phone is not told of its own push. */
const DEVICE_ID = /^[A-Za-z0-9-]{8,64}$/;
/** `personal`, or the Worker's id of a shared ledger. */
const CHANNEL = /^[A-Za-z0-9_-]{1,64}$/;
/** A hub keeps at most this many sockets (phones and tablets of one user). */
const MAX_SOCKETS = 20;
/**
 * Close codes the app reads: replaced by a newer socket of the same device
 * (do not reconnect, or the two would take turns), or dropped past the cap.
 */
export const CLOSE_REPLACED = 4001;
export const CLOSE_TOO_MANY = 4002;

export function isValidDeviceId(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_ID.test(value);
}

export function isValidChannel(value: unknown): value is string {
  return typeof value === 'string' && CHANNEL.test(value);
}

function hubFor(env: Env, userId: string): DurableObjectStub {
  return env.SYNC_HUB.get(env.SYNC_HUB.idFromName(userId));
}

/** GET /v1/live?device=…, a WebSocket upgrade: the user's hub takes the socket. */
export async function connectLive(
  request: Request,
  env: Env,
  userId: string,
  url: URL,
): Promise<Response> {
  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return json({ error: 'upgrade_required' }, 426);
  }
  const device = url.searchParams.get('device');
  if (!isValidDeviceId(device)) return json({ error: 'bad_request' }, 400);
  return hubFor(env, userId).fetch(
    `https://hub/connect?device=${encodeURIComponent(device)}`,
    request,
  );
}

/**
 * Why a channel changed: `data` (rows were pushed) or `access` (someone
 * joined, left or was removed, or the ledger or account is gone), which
 * makes the app re-read its list of shared ledgers too.
 */
export type ChangeReason = 'data' | 'access';

/** Tells each user's other phones that `channel` changed. Best effort. */
export async function notifyUsers(
  env: Env,
  userIds: string[],
  channel: string,
  fromDevice: string | null,
  reason: ChangeReason = 'data',
  /** Who caused an `access` change, so their own phones can tell it was them. */
  actor: string | null = null,
): Promise<void> {
  const body = JSON.stringify({ channel, device: fromDevice, reason, actor });
  await Promise.all(
    [...new Set(userIds)].map((userId) =>
      hubFor(env, userId)
        .fetch('https://hub/notify', { method: 'POST', body })
        .catch(() => undefined),
    ),
  );
}

export class SyncHub implements DurableObject {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    // Answered without waking the hub, so a keep-alive costs nothing.
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/connect') {
      const device = url.searchParams.get('device') ?? '';
      // The same device reconnecting replaces its old socket; past the cap
      // the oldest goes.
      const replaced = this.state.getWebSockets(device);
      for (const old of replaced) old.close(CLOSE_REPLACED, 'replaced');
      const others = this.state
        .getWebSockets()
        .filter(
          (socket) =>
            !replaced.includes(socket) && socket.readyState === WebSocket.READY_STATE_OPEN,
        );
      // getWebSockets() has no guaranteed order: any one makes room.
      if (others.length >= MAX_SOCKETS) others[0]?.close(CLOSE_TOO_MANY, 'too_many');
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1], [device]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (url.pathname === '/notify' && request.method === 'POST') {
      const { channel, device, reason, actor } = (await request.json()) as {
        channel: string;
        device: string | null;
        reason: string;
        actor: string | null;
      };
      const message = JSON.stringify({ type: 'changed', channel, reason, actor });
      for (const socket of this.state.getWebSockets()) {
        if (device && this.state.getTags(socket).includes(device)) continue;
        try {
          socket.send(message);
        } catch {
          // Closing already.
        }
      }
      return new Response(null, { status: 204 });
    }
    return new Response('Not found', { status: 404 });
  }

  // The app sends nothing but pings, which the auto-response answers.
  webSocketMessage(): void {}

  webSocketClose(socket: WebSocket): void {
    try {
      socket.close();
    } catch {
      // Already closed.
    }
  }

  webSocketError(socket: WebSocket): void {
    try {
      socket.close();
    } catch {
      // Already closed.
    }
  }
}
