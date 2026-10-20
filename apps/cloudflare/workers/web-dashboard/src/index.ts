// Web Dashboard relay. The phone sends its data straight to the browser the
// user linked, live, while both are open; this Worker only introduces them.
//
//   GET /v1/rooms/:roomId?role=phone|browser   WebSocket into the room
//
// A room id is 16 random bytes (base64url). The first one comes from the QR
// code the browser shows; after linking, both devices derive a private room
// id from their shared key and meet there. Knowing a room id lets a socket
// in, but not read anything: every message between the devices is encrypted
// with a key the relay never sees.
//
// There is no database, no bucket and no account. Nothing outlives a
// connection.

import type { Env } from './env';

export { Room } from './room';

const ROOM_ID = /^[A-Za-z0-9_-]{22}$/;

const allowedOrigins = (env: Env) =>
  env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/v1\/rooms\/([^/]+)$/);
    if (!match) return text(404, 'Not found');
    const roomId = match[1];
    const role = url.searchParams.get('role');
    if (!ROOM_ID.test(roomId) || (role !== 'phone' && role !== 'browser')) return text(400, 'Bad room');
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return text(426, 'WebSocket only');
    // Browsers send an Origin; only the dashboard's may open a browser seat.
    // The app is not a browser and sends none.
    const origin = request.headers.get('Origin');
    if (role === 'browser' && (!origin || !allowedOrigins(env).includes(origin))) return text(403, 'Origin');

    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.CONNECT_LIMITER.limit({ key: ip });
    if (!success) return text(429, 'Too many connections');

    const room = env.ROOMS.get(env.ROOMS.idFromName(roomId));
    return room.fetch(request);
  },
} satisfies ExportedHandler<Env>;
