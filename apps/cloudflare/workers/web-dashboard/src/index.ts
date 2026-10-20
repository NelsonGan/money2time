// Web Dashboard relay. The phone sends its data straight to the browser the
// user linked, live, while both are open; this Worker only introduces them.
//
//   GET /v1/room?role=phone|browser
//   Sec-WebSocket-Protocol: m2t-v1, <token>
//
// The token is 16 random bytes (base64url), and the room is a hash of it, so
// the token itself never appears in a URL or a log. The first one comes from
// the QR code the browser shows; after linking, both devices derive a private
// token from their shared key. Holding a token lets a socket in, but not read
// anything: every message between the devices is encrypted with a key the
// relay never sees.
//
// There is no database, no bucket and no account. Nothing outlives a
// connection.

import type { Env } from './env';

export { Room } from './room';

const PROTOCOL = 'm2t-v1';
const TOKEN = /^[A-Za-z0-9_-]{22}$/;

const allowedOrigins = (env: Env) =>
  env.ALLOWED_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

function text(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** IPv6 clients share a limit per /64, the block one subscriber usually gets. */
function rateKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  // Addresses arrive compressed (`2a01:4f8::1`): expand `::` before taking
  // the first four groups, or every interface id would get its own key.
  const [head, tail = ''] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = ip.includes('::') && tail ? tail.split(':') : [];
  const groups = ip.includes('::') ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right] : left;
  return groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':');
}

async function roomName(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`m2t-room:${token}`)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/v1/room') return text(404, 'Not found');
    const role = url.searchParams.get('role');
    if (role !== 'phone' && role !== 'browser') return text(400, 'Bad role');
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return text(426, 'WebSocket only');
    const protocols = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map((p) => p.trim());
    const token = protocols.find((p) => p !== PROTOCOL && TOKEN.test(p));
    if (!protocols.includes(PROTOCOL) || !token) return text(400, 'Bad token');
    // Browsers send an Origin; only the dashboard's may open a browser seat.
    // The app is not a browser and sends none.
    const origin = request.headers.get('Origin');
    if (role === 'browser' && (!origin || !allowedOrigins(env).includes(origin))) return text(403, 'Origin');

    const { success } = await env.CONNECT_LIMITER.limit({ key: rateKey(request.headers.get('cf-connecting-ip') ?? 'unknown') });
    if (!success) return text(429, 'Too many connections');

    const room = env.ROOMS.get(env.ROOMS.idFromName(await roomName(token)));
    return room.fetch(new Request(`https://room/?role=${role}`, { headers: { Upgrade: 'websocket' } }));
  },
} satisfies ExportedHandler<Env>;
