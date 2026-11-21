const worker = require('../../../cloudflare/workers/places/src/index').default;
// Required, not imported: the app's typecheck has no Workers types (D1Database).
const {
  checkQuota,
  consumeQuota,
  dailyLimit,
  dayStart,
} = require('../../../cloudflare/workers/places/src/quota');

import {
  addressOf,
  mapsAuthToken,
  parseReverseRequest,
  parseSearchRequest,
  resetAppleTokenCache,
  reversePath,
  searchPath,
  toPlaceResults,
} from '../../../cloudflare/workers/places/src/places';

jest.mock('../../../cloudflare/workers/places/src/quota', () => ({
  ...jest.requireActual('../../../cloudflare/workers/places/src/quota'),
  checkQuota: jest.fn(),
  consumeQuota: jest.fn(async () => 1),
}));

/**
 * The places Worker (POST /search and /reverse). The Apple key never
 * leaves the Worker, so the test signs a real ES256 Maps token with a fresh
 * P-256 key and verifies it, then drives the routes against a fake Apple.
 */

function pemFromPkcs8(bytes: ArrayBuffer): string {
  const body = Buffer.from(bytes).toString('base64');
  return `-----BEGIN PRIVATE KEY-----\n${body.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(segment.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(),
  );
}

const APPLE_SEARCH = {
  results: [
    {
      id: 'I88BAA55D81E8BF1',
      name: 'Starbucks',
      coordinate: { latitude: 3.1589569, longitude: 101.7137273 },
      formattedAddressLines: ['151, Jalan Ampang', '50450 Kuala Lumpur', 'Malaysia'],
      country: 'Malaysia',
      countryCode: 'MY',
      poiCategory: 'Cafe',
    },
    {
      id: 'I98B228E836480FB3',
      name: 'Starbucks',
      coordinate: { latitude: 3.15944, longitude: 101.7140597 },
      // Apple sometimes sends the whole address as one line with breaks.
      formattedAddressLines: [
        'G-7, Ground Floor, Avenue K\n156, Jalan Ampang\n50450 Kuala Lumpur, Kuala Lumpur\nMalaysia\n\n\n',
      ],
      country: 'Malaysia',
      countryCode: 'MY',
      poiCategory: 'Cafe',
    },
    { name: 'No coordinate' },
  ],
};

describe('places request parsing', () => {
  it('needs a user, a query of two characters and a real coordinate', () => {
    expect(parseSearchRequest({ query: 'cafe' })).toEqual({ error: 'missing_app_user_id' });
    expect(parseSearchRequest({ appUserId: 'm2t_a', query: ' a ' })).toEqual({
      error: 'query_too_short',
    });
    expect(parseSearchRequest({ appUserId: 'm2t_a', query: 'x'.repeat(121) })).toEqual({
      error: 'query_too_long',
    });
    expect(
      parseSearchRequest({ appUserId: 'm2t_a', query: 'cafe', latitude: 91, longitude: 0 }),
    ).toEqual({ error: 'invalid_location' });
    expect(parseReverseRequest({ appUserId: 'm2t_a', latitude: 3 })).toEqual({
      error: 'invalid_location',
    });
  });

  it('collapses spaces, keeps an optional location and drops a malformed language', () => {
    expect(
      parseSearchRequest({ appUserId: 'm2t_a', query: '  Star   bucks ', language: 'en; DROP' }),
    ).toEqual({
      appUserId: 'm2t_a',
      query: 'Star bucks',
      latitude: null,
      longitude: null,
      language: null,
    });
    expect(
      parseSearchRequest({
        appUserId: 'm2t_a',
        query: 'cafe',
        latitude: 3.15791,
        longitude: 101.71234,
        language: 'zh-Hans',
      }),
    ).toMatchObject({ latitude: 3.15791, longitude: 101.71234, language: 'zh-Hans' });
  });

  it('rounds coordinates before they reach Apple or the cache key', () => {
    const search = searchPath({
      appUserId: 'm2t_a',
      query: 'Starbucks',
      latitude: 3.157912,
      longitude: 101.712345,
      language: 'en',
    });
    expect(search).toBe('/v1/search?q=starbucks&searchLocation=3.16%2C101.71&lang=en');
    expect(
      reversePath({
        appUserId: 'm2t_a',
        latitude: 3.157912,
        longitude: 101.712345,
        language: null,
      }),
    ).toBe('/v1/reverseGeocode?loc=3.1579%2C101.7123');
  });
});

describe('Apple answers', () => {
  it('normalizes places: one-line address without the name or country, id and category kept', () => {
    expect(toPlaceResults(APPLE_SEARCH)).toEqual([
      {
        id: 'I88BAA55D81E8BF1',
        name: 'Starbucks',
        address: '151, Jalan Ampang, 50450 Kuala Lumpur',
        latitude: 3.1589569,
        longitude: 101.7137273,
        category: 'Cafe',
        countryCode: 'MY',
      },
      {
        id: 'I98B228E836480FB3',
        name: 'Starbucks',
        address: 'G-7, Ground Floor, Avenue K, 156, Jalan Ampang, 50450 Kuala Lumpur, Kuala Lumpur',
        latitude: 3.15944,
        longitude: 101.7140597,
        category: 'Cafe',
        countryCode: 'MY',
      },
    ]);
  });

  it('uses the address as the name of an unnamed spot', () => {
    expect(
      toPlaceResults({
        results: [
          {
            coordinate: { latitude: 1, longitude: 2 },
            formattedAddressLines: ['Lorong Kuda', 'Malaysia'],
            country: 'Malaysia',
          },
        ],
      }),
    ).toEqual([
      {
        id: null,
        name: 'Lorong Kuda',
        address: '',
        latitude: 1,
        longitude: 2,
        category: null,
        countryCode: null,
      },
    ]);
    expect(addressOf({ formattedAddressLines: ['Suria KLCC', 'Lorong Kuda'] }, 'Suria KLCC')).toBe(
      'Lorong Kuda',
    );
    expect(toPlaceResults(null)).toEqual([]);
  });
});

describe('the Maps auth token', () => {
  it('is a verifiable ES256 JWT with the key id, team and server_api scope', async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    const pem = pemFromPkcs8(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
    const jwt = await mapsAuthToken(
      { APPLE_MAPS_PRIVATE_KEY: pem, APPLE_MAPS_KEY_ID: 'KEY1234567', APPLE_TEAM_ID: 'TEAM123456' },
      1_700_000_000_000,
    );
    const [header, claims, signature] = jwt.split('.');
    expect(decodeSegment(header)).toEqual({ alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
    expect(decodeSegment(claims)).toEqual({
      iss: 'TEAM123456',
      iat: 1_700_000_000,
      exp: 1_700_000_600,
      scope: 'server_api',
    });
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});

describe('POST /search and /reverse', () => {
  let env: Record<string, unknown>;
  let waits: Promise<unknown>[];
  const ctx = { waitUntil: (p: Promise<unknown>) => waits.push(p) };
  let fetchMock: jest.Mock;
  const previousFetch = global.fetch;

  beforeAll(async () => {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])) as CryptoKeyPair;
    env = {
      APPLE_MAPS_PRIVATE_KEY: pemFromPkcs8(await crypto.subtle.exportKey('pkcs8', pair.privateKey)),
      APPLE_MAPS_KEY_ID: 'KEY1234567',
      APPLE_TEAM_ID: 'TEAM123456',
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    resetAppleTokenCache();
    waits = [];
    (checkQuota as jest.Mock).mockResolvedValue({ allowed: true, used: 0, limit: 200 });
    fetchMock = jest.fn(async (url: unknown) => {
      const href = String(url);
      if (href.endsWith('/v1/token')) {
        return Response.json({ accessToken: 'access-1', expiresInSeconds: 1800 });
      }
      if (href.includes('/v1/search')) return Response.json(APPLE_SEARCH);
      if (href.includes('/v1/reverseGeocode')) {
        return Response.json({
          results: [
            {
              name: 'Suria KLCC',
              coordinate: { latitude: 3.1577593, longitude: 101.7122496 },
              formattedAddressLines: [
                'Suria KLCC',
                'Lorong Kuda',
                '50450 Kuala Lumpur',
                'Malaysia',
              ],
              country: 'Malaysia',
              countryCode: 'MY',
            },
          ],
        });
      }
      return new Response('', { status: 404 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = previousFetch;
    jest.restoreAllMocks();
  });

  const post = (
    path: string,
    body: unknown,
    overrides: Record<string, unknown> = {},
    headers = {},
  ) =>
    worker.fetch(
      new Request(`https://places.test${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }),
      { ...env, ...overrides },
      ctx,
    );

  it('searches Apple with a signed token and counts one use', async () => {
    const response = await post('/search', {
      appUserId: 'm2t_a',
      query: 'Starbucks',
      latitude: 3.1579,
      longitude: 101.7123,
      language: 'en',
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.places).toHaveLength(2);
    expect(body.places[0]).toMatchObject({ name: 'Starbucks', category: 'Cafe' });
    const searchCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/v1/search'));
    expect(String(searchCall?.[0])).toBe(
      'https://maps-api.apple.com/v1/search?q=starbucks&searchLocation=3.16%2C101.71&lang=en',
    );
    expect((searchCall?.[1] as RequestInit).headers).toEqual({ Authorization: 'Bearer access-1' });
    await Promise.all(waits);
    expect(checkQuota).toHaveBeenCalledWith('m2t_a', expect.anything(), expect.any(Date));
    expect(consumeQuota).toHaveBeenCalledWith('m2t_a', expect.anything(), expect.any(Date));
  });

  it('keeps the access token between searches', async () => {
    await post('/search', { appUserId: 'm2t_a', query: 'cafe' });
    await post('/search', { appUserId: 'm2t_a', query: 'bakery' });
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/v1/token'))).toHaveLength(
      1,
    );
  });

  it('mints a new token once when Apple refuses the cached one', async () => {
    let refused = false;
    const base = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (String(url).includes('/v1/search') && !refused) {
        refused = true;
        return new Response('', { status: 401 });
      }
      return base(url, init);
    });
    const response = await post('/search', { appUserId: 'm2t_a', query: 'cafe' });
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/v1/token'))).toHaveLength(
      2,
    );
  });

  it('resolves coordinates to the place there', async () => {
    const response = await post('/reverse', {
      appUserId: 'm2t_a',
      latitude: 3.15791,
      longitude: 101.71234,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).places[0]).toEqual({
      id: null,
      name: 'Suria KLCC',
      address: 'Lorong Kuda, 50450 Kuala Lumpur',
      latitude: 3.1577593,
      longitude: 101.7122496,
      category: null,
      countryCode: 'MY',
    });
  });

  it('stops at the daily allowance without calling Apple', async () => {
    (checkQuota as jest.Mock).mockResolvedValue({ allowed: false, used: 200, limit: 200 });
    const response = await post('/search', { appUserId: 'm2t_a', query: 'cafe' });
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'limit_reached' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(consumeQuota).not.toHaveBeenCalled();
  });

  it('refuses an address over its per-minute limit before any work', async () => {
    const blocked = { limit: jest.fn(async () => ({ success: false })) };
    const response = await post(
      '/search',
      { appUserId: 'm2t_a', query: 'cafe' },
      { PLACES_LIMITER: blocked },
      { 'cf-connecting-ip': '203.0.113.9' },
    );
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'rate_limited' });
    expect(blocked.limit).toHaveBeenCalledWith({ key: '203.0.113.9' });
    expect(checkQuota).not.toHaveBeenCalled();
  });

  it('says not_configured without the key and capacity when Apple is out of quota', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const unconfigured = await post(
        '/search',
        { appUserId: 'm2t_a', query: 'cafe' },
        { APPLE_MAPS_PRIVATE_KEY: '' },
      );
      expect(unconfigured.status).toBe(503);
      expect(await unconfigured.json()).toEqual({ error: 'not_configured' });

      fetchMock.mockImplementation(async (url: unknown) =>
        String(url).endsWith('/v1/token')
          ? Response.json({ accessToken: 'access-1', expiresInSeconds: 1800 })
          : new Response('', { status: 429 }),
      );
      const busy = await post('/search', { appUserId: 'm2t_a', query: 'cafe' });
      expect(busy.status).toBe(503);
      expect(await busy.json()).toEqual({ error: 'capacity' });
      expect(consumeQuota).not.toHaveBeenCalled();
      // Neither the query nor the coordinates are logged.
      expect(JSON.stringify(error.mock.calls)).not.toContain('cafe');
    } finally {
      error.mockRestore();
    }
  });

  it('checks the request signature when a signing key is set', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await post(
        '/search',
        { appUserId: 'm2t_a', query: 'cafe' },
        { MONEY2TIME_REQUEST_SIGNING_KEY: 'secret' },
      );
      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('rejects a bad body with a 400 and no Apple call', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const response = await post('/search', { appUserId: 'm2t_a', query: 'a' });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: 'query_too_short' });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});

describe('routes and the daily allowance', () => {
  it('answers 404 to anything but POST /search and /reverse', async () => {
    const ctx = { waitUntil: () => undefined };
    for (const [method, path] of [
      ['GET', '/search'],
      ['POST', '/places/search'],
      ['POST', '/scan'],
    ]) {
      const response = await worker.fetch(
        new Request(`https://places.test${path}`, {
          method,
          ...(method === 'POST' ? { body: '{}' } : {}),
        }),
        {},
        ctx,
      );
      expect(response.status).toBe(404);
    }
  });

  it('counts per UTC day, 200 unless configured', () => {
    expect(dayStart(new Date('2026-11-21T23:59:59.999Z'))).toBe(Date.UTC(2026, 10, 21));
    expect(dayStart(new Date('2026-11-22T00:00:00.000Z'))).toBe(Date.UTC(2026, 10, 22));
    expect(dailyLimit({ PLACES_DAILY_LIMIT: '50' } as Record<string, string>)).toBe(50);
    expect(dailyLimit({ PLACES_DAILY_LIMIT: 'lots' } as Record<string, string>)).toBe(200);
    expect(dailyLimit({} as Record<string, string>)).toBe(200);
  });
});
