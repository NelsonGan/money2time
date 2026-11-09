import { NextRequest, NextResponse } from 'next/server';

/**
 * The API writes files, runs the store CLIs with this Mac's credentials and
 * edits the live store listings, so it answers only the Studio page itself:
 *
 * - Host must be this machine. That stops another device on the network, and
 *   a DNS-rebinding page whose Host header names its own domain.
 * - A browser's Origin, when it sends one, must be this same server.
 * - Writes must be JSON. A cross-site page can only send JSON after a CORS
 *   preflight, which nothing here answers.
 *
 * `npm run dev` also binds to 127.0.0.1 only; this covers `npx next dev`.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostname(hostHeader: string): string {
  return hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : hostHeader.split(':')[0];
}

export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  if (!LOCAL_HOSTS.has(hostname(host).toLowerCase())) {
    return NextResponse.json({ error: 'App Studio answers only on this Mac.' }, { status: 403 });
  }
  const origin = request.headers.get('origin');
  if (origin && origin !== `http://${host}`) {
    return NextResponse.json({ error: 'Use the Studio page on this server.' }, { status: 403 });
  }
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    return NextResponse.json({ error: 'Use the Studio page on this server.' }, { status: 403 });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const type = request.headers.get('content-type') ?? '';
    if (!type.toLowerCase().startsWith('application/json')) {
      return NextResponse.json({ error: 'Send JSON.' }, { status: 415 });
    }
  }
  return NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
