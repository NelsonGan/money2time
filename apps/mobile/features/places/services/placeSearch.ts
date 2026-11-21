/**
 * Place search for transaction locations (README: Transaction locations).
 * Calls the places Worker (README: Places Worker), which proxies the Apple
 * Maps Server API with the Apple key kept server-side. Signed the same way as
 * scanning, so it works without an account.
 */

import { signingHeaders } from '~/services/requestSigning';
import { getErrorMessage } from '~/utils/errorHandling';

import type { Coordinate, NearbyCategory, PlaceResult } from '../lib/placeTypes';

export type PlaceSearchErrorCode =
  | 'not_available'
  | 'limit_reached'
  | 'rate_limited'
  | 'busy'
  | 'network'
  | 'server';

export class PlaceSearchError extends Error {
  constructor(
    readonly code: PlaceSearchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PlaceSearchError';
  }
}

// Apple answers within a second or two; a hung request should give way to the
// user typing again rather than spin.
const FETCH_TIMEOUT_MS = 10000;

const DEFAULT_BASE_URL = 'https://location.money2time.com';

// `EXPO_PUBLIC_MONEY2TIME_WORKERS_PLACES` points a dev build at a local Worker.
function apiBaseUrl(): string {
  const raw = process.env.EXPO_PUBLIC_MONEY2TIME_WORKERS_PLACES?.trim() || DEFAULT_BASE_URL;
  return raw.replace(/\/+$/, '');
}

// Apple takes BCP 47 tags; the app's locale ids are close, Chinese aside.
const APPLE_LANGUAGES: Record<string, string> = {
  zh: 'zh-Hans',
  'zh-Hant': 'zh-Hant',
  fil: 'fil',
  nb: 'nb',
};

export function appleLanguage(locale: string | null | undefined): string | null {
  if (!locale) return null;
  return APPLE_LANGUAGES[locale] ?? (/^[a-z]{2,3}$/.test(locale) ? locale : null);
}

function isPlaceResult(value: unknown): value is PlaceResult {
  if (!value || typeof value !== 'object') return false;
  const place = value as Record<string, unknown>;
  return (
    typeof place.name === 'string' &&
    typeof place.latitude === 'number' &&
    typeof place.longitude === 'number' &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude)
  );
}

async function post(path: string, body: Record<string, unknown>): Promise<PlaceResult[]> {
  const base = apiBaseUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...signingHeaders(String(body.appUserId ?? '')),
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    let payload: { places?: unknown; error?: string } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // Fall through to the status.
    }
    if (!response.ok) {
      if (payload.error === 'limit_reached')
        throw new PlaceSearchError('limit_reached', 'Daily place search limit reached.');
      if (payload.error === 'rate_limited' || response.status === 429)
        throw new PlaceSearchError('rate_limited', 'Too many searches. Try again shortly.');
      if (payload.error === 'capacity')
        throw new PlaceSearchError('busy', 'Place search is busy. Try again shortly.');
      // not_found: a Worker older than the route (the app can ship first).
      if (payload.error === 'not_configured' || payload.error === 'not_found')
        throw new PlaceSearchError('not_available', 'Place search is not available.');
      throw new PlaceSearchError(
        'server',
        payload.error ?? `Place search failed (${response.status}).`,
      );
    }
    const places = Array.isArray(payload.places) ? payload.places : [];
    return places.filter(isPlaceResult).map((place) => ({
      id: typeof place.id === 'string' && place.id ? place.id : null,
      name: place.name,
      address: typeof place.address === 'string' ? place.address : '',
      latitude: place.latitude,
      longitude: place.longitude,
      category: typeof place.category === 'string' && place.category ? place.category : null,
      countryCode: typeof place.countryCode === 'string' ? place.countryCode : null,
    }));
  } catch (err) {
    if (err instanceof PlaceSearchError) throw err;
    throw new PlaceSearchError('network', getErrorMessage(err, 'Network request failed.'));
  } finally {
    clearTimeout(timeout);
  }
}

interface SearchPlacesArgs {
  appUserId: string;
  query: string;
  /** Ranks places near here first; never stored by the Worker. */
  near?: { latitude: number; longitude: number } | null;
  locale?: string | null;
}

export function searchPlaces({ appUserId, query, near, locale }: SearchPlacesArgs) {
  return post('/search', {
    appUserId,
    query: query.trim(),
    ...(near ? { latitude: near.latitude, longitude: near.longitude } : {}),
    language: appleLanguage(locale),
  });
}

/**
 * Places to spend around a point (the phone, or where the map was moved to),
 * closest first: every kind with `all`, or one kind of place.
 */
export function nearbyPlaces({
  appUserId,
  near,
  category,
  locale,
}: {
  appUserId: string;
  near: Coordinate;
  category: NearbyCategory;
  locale?: string | null;
}) {
  return post('/nearby', {
    appUserId,
    latitude: near.latitude,
    longitude: near.longitude,
    category,
    language: appleLanguage(locale),
  });
}

export async function reverseGeocodePlace(args: {
  appUserId: string;
  latitude: number;
  longitude: number;
  locale?: string | null;
}): Promise<PlaceResult | null> {
  const places = await post('/reverse', {
    appUserId: args.appUserId,
    latitude: args.latitude,
    longitude: args.longitude,
    language: appleLanguage(args.locale),
  });
  return places[0] ?? null;
}
