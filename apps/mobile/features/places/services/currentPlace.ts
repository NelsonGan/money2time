import { I18n } from '~/lib/i18n';

import type { Coordinate, PlaceResult } from '../lib/placeTypes';
import { describeCoordinate, getCurrentCoordinate } from './deviceLocation';

export interface ResolvedCurrentPlace {
  coordinate: Coordinate;
  place: PlaceResult;
  at: number;
  /** The language the place was named in. */
  locale: string | null;
}

// One fix and its name serve every tag made within this window, so adding
// three coffees in a row (or draining three Apple Pay taps) asks the GPS and
// the geocoder once.
const REUSE_MS = 90 * 1000;
let lastResolved: ResolvedCurrentPlace | null = null;

/** A spot the geocoders could not name: kept, with a generic name. */
function pinnedPlace(coordinate: Coordinate): PlaceResult {
  return {
    id: null,
    name: I18n.t('locations.pinned_location'),
    address: '',
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    category: null,
    countryCode: null,
  };
}

/** The last fix and its name, while it is recent enough to reuse. */
export function reusableCurrentPlace(locale?: string | null): ResolvedCurrentPlace | null {
  const reusable = lastResolved;
  if (reusable && reusable.locale === (locale ?? null) && Date.now() - reusable.at < REUSE_MS) {
    return reusable;
  }
  return null;
}

/**
 * Where the phone is and what the spot is called, reusing a recent answer.
 * Never asks for permission; throws `CurrentLocationError` without a fix.
 */
export async function locateCurrentPlace({
  appUserId,
  locale,
}: {
  appUserId: string;
  locale?: string | null;
}): Promise<ResolvedCurrentPlace> {
  const reusable = reusableCurrentPlace(locale);
  if (reusable) return reusable;
  const coordinate = await getCurrentCoordinate();
  const place =
    (await describeCoordinate(coordinate, { appUserId, locale })) ?? pinnedPlace(coordinate);
  const next = { coordinate, place, at: Date.now(), locale: locale ?? null };
  lastResolved = next;
  return next;
}
