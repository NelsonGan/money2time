import {
  appleLanguage,
  nearbyPlaces,
  PlaceSearchError,
  reverseGeocodePlace,
  searchPlaces,
} from '~/features/places/services/placeSearch';

jest.mock('~/services/requestSigning', () => ({
  signingHeaders: () => ({ 'X-Timestamp': '1', 'X-Signature': 'sig' }),
}));

describe('place search client', () => {
  const previousFetch = global.fetch;
  const previousUrl = process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_PLACES;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_PLACES = 'https://worker.test/';
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = previousFetch;
    process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_PLACES = previousUrl;
  });

  it('maps app locales to Apple language tags', () => {
    expect(appleLanguage('zh')).toBe('zh-Hans');
    expect(appleLanguage('zh-Hant')).toBe('zh-Hant');
    expect(appleLanguage('ms')).toBe('ms');
    expect(appleLanguage('fil')).toBe('fil');
    expect(appleLanguage(null)).toBeNull();
  });

  it('posts a signed search with the bias point and keeps only well-formed places', async () => {
    fetchMock.mockResolvedValue(
      Response.json({
        places: [
          {
            id: 'I1',
            name: 'Starbucks',
            address: 'Jalan Ampang',
            latitude: 3.15,
            longitude: 101.71,
            category: 'Cafe',
            countryCode: 'MY',
          },
          { name: 'Broken', latitude: 'x', longitude: 1 },
        ],
      }),
    );
    const places = await searchPlaces({
      appUserId: 'm2t_a',
      query: ' starbucks ',
      near: { latitude: 3.1, longitude: 101.7 },
      locale: 'zh',
    });
    expect(places).toEqual([
      {
        id: 'I1',
        name: 'Starbucks',
        address: 'Jalan Ampang',
        latitude: 3.15,
        longitude: 101.71,
        category: 'Cafe',
        countryCode: 'MY',
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://worker.test/search');
    expect(init.headers).toMatchObject({ 'X-Signature': 'sig' });
    expect(JSON.parse(String(init.body))).toEqual({
      appUserId: 'm2t_a',
      query: 'starbucks',
      latitude: 3.1,
      longitude: 101.7,
      language: 'zh-Hans',
    });
  });

  it('asks for places near a point by kind', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ places: [] }));
    await nearbyPlaces({
      appUserId: 'm2t_a',
      near: { latitude: 3.158, longitude: 101.712 },
      category: 'coffee',
      locale: 'en',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://worker.test/nearby');
    expect(JSON.parse(String(init.body))).toEqual({
      appUserId: 'm2t_a',
      latitude: 3.158,
      longitude: 101.712,
      category: 'coffee',
      language: 'en',
    });
  });

  it('returns the first reverse result or null', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ places: [] }));
    expect(await reverseGeocodePlace({ appUserId: 'm2t_a', latitude: 1, longitude: 2 })).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toBe('https://worker.test/reverse');
  });

  it('uses the production places Worker when no URL is set', async () => {
    process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_PLACES = '';
    fetchMock.mockResolvedValueOnce(Response.json({ places: [] }));
    await searchPlaces({ appUserId: 'm2t_a', query: 'cafe' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://location.money2time.com/search');
  });

  it.each([
    [429, { error: 'limit_reached' }, 'limit_reached'],
    [429, { error: 'rate_limited' }, 'rate_limited'],
    [503, { error: 'capacity' }, 'busy'],
    [503, { error: 'not_configured' }, 'not_available'],
    // A Worker older than the route: the app quietly leaves it out.
    [404, { error: 'not_found' }, 'not_available'],
    [502, { error: 'upstream' }, 'server'],
  ])('maps a %s %j to %s', async (status, body, code) => {
    fetchMock.mockResolvedValue(Response.json(body, { status }));
    await expect(searchPlaces({ appUserId: 'm2t_a', query: 'cafe' })).rejects.toMatchObject({
      code,
    });
  });

  it('reports a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));
    await expect(searchPlaces({ appUserId: 'm2t_a', query: 'cafe' })).rejects.toBeInstanceOf(
      PlaceSearchError,
    );
    await expect(searchPlaces({ appUserId: 'm2t_a', query: 'cafe' })).rejects.toMatchObject({
      code: 'network',
    });
  });
});
