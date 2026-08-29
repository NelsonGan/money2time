import {
  type ApnsCredentials,
  invalidateProviderToken,
  isTerminalPushFailure,
  pushLiveActivity,
} from '../../cloudflare/workers/live-earnings/src/apns';

/**
 * The APNs half of the live-earnings Worker.
 *
 * The JWT is the part with no second chance: a malformed ES256 signature is a
 * 403 from Apple and a card that never moves, and it cannot be caught by
 * typechecking. So the test mints a real P-256 key, signs a real token through
 * the Worker's own code path, and verifies the signature with WebCrypto.
 */

const encoder = new TextEncoder();

function pemFromPkcs8(bytes: ArrayBuffer): string {
  const body = Buffer.from(bytes).toString('base64');
  const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? body;
  return `-----BEGIN PRIVATE KEY-----\n${wrapped}\n-----END PRIVATE KEY-----\n`;
}

function decodeSegment(segment: string): unknown {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
}

describe('live-earnings APNs client', () => {
  let credentials: ApnsCredentials;
  let publicKey: CryptoKey;
  let captured: { url: string; init: RequestInit } | null;

  beforeAll(async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    publicKey = pair.publicKey;
    credentials = {
      keyId: 'ABCDE12345',
      teamId: 'TEAM123456',
      privateKeyPem: pemFromPkcs8(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
      bundleId: 'com.nelsongan.money2time',
    };
  });

  beforeEach(() => {
    invalidateProviderToken();
    captured = null;
    global.fetch = jest.fn(async (url: unknown, init?: unknown) => {
      captured = { url: String(url), init: (init ?? {}) as RequestInit };
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;
  });

  const send = (over: Partial<Parameters<typeof pushLiveActivity>[0]> = {}) =>
    pushLiveActivity({
      credentials,
      environment: 'production',
      pushToken: 'a1b2c3d4e5f60718',
      state: { earnedText: 'RM12.34', earned: 12.34, asOfMillis: 1_700_000_000_000 },
      staleAt: 1_700_014_400,
      event: 'update',
      priority: 10,
      now: 1_700_000_000_000,
      ...over,
    });

  it('signs a verifiable ES256 provider token', async () => {
    await send();
    const auth = header('authorization');
    expect(auth.startsWith('bearer ')).toBe(true);

    const [head, claims, signature] = auth.slice('bearer '.length).split('.');
    expect(decodeSegment(head)).toEqual({ alg: 'ES256', kid: 'ABCDE12345', typ: 'JWT' });
    expect(decodeSegment(claims)).toEqual({ iss: 'TEAM123456', iat: 1_700_000_000 });

    // A DER-wrapped signature would be the easy mistake here; APNs wants raw r||s.
    const raw = Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    expect(raw.length).toBe(64);
    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      raw,
      encoder.encode(`${head}.${claims}`),
    );
    expect(verified).toBe(true);
  });

  it('addresses the right gateway, topic and push type', async () => {
    await send();
    expect(captured?.url).toBe('https://api.push.apple.com/3/device/a1b2c3d4e5f60718');
    expect(header('apns-topic')).toBe('com.nelsongan.money2time.push-type.liveactivity');
    expect(header('apns-push-type')).toBe('liveactivity');
    expect(header('apns-priority')).toBe('10');
  });

  // The two priorities behave completely differently, and which one a push
  // carries is the difference between a card that ticks and an app whose Live
  // Activity budget is revoked for a day. See the note in apns.ts.
  it("sends the caller's priority through unchanged", async () => {
    await send({ priority: 5 });
    expect(header('apns-priority')).toBe('5');
    await send({ priority: 10 });
    expect(header('apns-priority')).toBe('10');
  });

  it('uses the sandbox gateway for a development token', async () => {
    await send({ environment: 'sandbox' });
    expect(captured?.url).toBe('https://api.sandbox.push.apple.com/3/device/a1b2c3d4e5f60718');
  });

  it('sends the content-state ActivityKit expects', async () => {
    await send();
    const aps = (JSON.parse(String(captured?.init.body)) as { aps: Record<string, unknown> }).aps;
    expect(aps.event).toBe('update');
    expect(aps.timestamp).toBe(1_700_000_000);
    expect(aps['stale-date']).toBe(1_700_014_400);
    // Epoch MILLIS, and a plain number: a Swift `Date` here would be decoded
    // as seconds since 2001 by ActivityKit's default JSONDecoder.
    expect(aps['content-state']).toEqual({
      earnedText: 'RM12.34',
      earned: 12.34,
      asOfMillis: 1_700_000_000_000,
    });
    expect(aps['dismissal-date']).toBeUndefined();
  });

  it('lets a finished card linger before dismissing it', async () => {
    await send({ event: 'end' });
    const aps = (JSON.parse(String(captured?.init.body)) as { aps: Record<string, unknown> }).aps;
    expect(aps.event).toBe('end');
    expect(aps['dismissal-date']).toBe(1_700_000_060);
  });

  it('reuses one provider token across pushes, and re-mints after a 403', async () => {
    await send();
    const first = header('authorization');
    await send();
    expect(header('authorization')).toBe(first);

    global.fetch = jest.fn(async (url: unknown, init?: unknown) => {
      captured = { url: String(url), init: (init ?? {}) as RequestInit };
      return new Response(JSON.stringify({ reason: 'ExpiredProviderToken' }), { status: 403 });
    }) as unknown as typeof fetch;
    const rejected = await send();
    expect(rejected).toEqual({ ok: false, status: 403, reason: 'ExpiredProviderToken' });

    // The 403 must have dropped the cached JWT, or every later tick reuses the
    // token Apple just refused.
    global.fetch = jest.fn(async (url: unknown, init?: unknown) => {
      captured = { url: String(url), init: (init ?? {}) as RequestInit };
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;
    await send({ now: 1_700_000_060_000 });
    expect(header('authorization')).not.toBe(first);
  });

  it('surfaces the APNs reason on failure', async () => {
    global.fetch = jest.fn(
      async () => new Response(JSON.stringify({ reason: 'BadDeviceToken' }), { status: 400 }),
    ) as unknown as typeof fetch;
    expect(await send()).toEqual({ ok: false, status: 400, reason: 'BadDeviceToken' });
  });

  it('only treats a dead token as terminal', () => {
    expect(isTerminalPushFailure({ ok: true, status: 200 })).toBe(false);
    expect(isTerminalPushFailure({ ok: false, status: 400, reason: 'BadDeviceToken' })).toBe(true);
    expect(isTerminalPushFailure({ ok: false, status: 410, reason: 'Unregistered' })).toBe(true);
    // Transient: the row must survive to be retried next minute.
    expect(isTerminalPushFailure({ ok: false, status: 429, reason: 'TooManyRequests' })).toBe(
      false,
    );
    expect(isTerminalPushFailure({ ok: false, status: 500, reason: 'InternalServerError' })).toBe(
      false,
    );
    expect(isTerminalPushFailure({ ok: false, status: 403, reason: 'ExpiredProviderToken' })).toBe(
      false,
    );
  });

  function header(name: string): string {
    return String((captured?.init.headers as Record<string, string>)[name]);
  }
});
