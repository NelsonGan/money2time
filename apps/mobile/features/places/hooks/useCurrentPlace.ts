import { useCallback, useEffect, useRef, useState } from 'react';

import { I18n } from '~/lib/i18n';

import type { Coordinate, PlaceResult } from '../lib/placeTypes';
import {
  CurrentLocationError,
  describeCoordinate,
  getCurrentCoordinate,
  getLocationPermission,
  requestLocationPermission,
} from '../services/deviceLocation';

export type CurrentPlaceStatus =
  | 'idle'
  | 'locating'
  | 'ready'
  /** The user has not been asked yet. */
  | 'ask'
  /** Denied; only the Settings app can change it. */
  | 'blocked'
  | 'services_off'
  | 'unavailable'
  | 'error';

interface Resolved {
  coordinate: Coordinate;
  place: PlaceResult;
  at: number;
  /** The language the place was named in. */
  locale: string | null;
}

// One fix and its name serve every editor opened within this window, so
// adding three coffees in a row asks the GPS and the geocoder once.
const REUSE_MS = 90 * 1000;
let lastResolved: Resolved | null = null;

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

/**
 * Where the phone is and what the spot is called, for the location picker's
 * "Current location" row and a new expense's automatic tag. Asks the system
 * for permission only through `request()`, never by itself.
 */
export function useCurrentPlace({
  active,
  appUserId,
  locale,
}: {
  active: boolean;
  appUserId: string;
  locale?: string | null;
}) {
  const [status, setStatus] = useState<CurrentPlaceStatus>('idle');
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const runId = useRef(0);

  const locate = useCallback(async () => {
    const id = ++runId.current;
    // Checked even for a reused fix: access revoked a moment ago means no place.
    const permission = await getLocationPermission();
    if (id !== runId.current) return null;
    if (permission.status === 'unavailable') {
      setStatus('unavailable');
      return null;
    }
    if (permission.status !== 'granted') {
      setStatus(permission.canAskAgain ? 'ask' : 'blocked');
      return null;
    }
    const reusable = lastResolved;
    if (reusable && reusable.locale === (locale ?? null) && Date.now() - reusable.at < REUSE_MS) {
      setResolved(reusable);
      setStatus('ready');
      return reusable;
    }
    setStatus('locating');
    try {
      const coordinate = await getCurrentCoordinate();
      if (id !== runId.current) return null;
      const place =
        (await describeCoordinate(coordinate, { appUserId, locale })) ?? pinnedPlace(coordinate);
      if (id !== runId.current) return null;
      const next = { coordinate, place, at: Date.now(), locale: locale ?? null };
      lastResolved = next;
      setResolved(next);
      setStatus('ready');
      return next;
    } catch (err) {
      if (id !== runId.current) return null;
      const code = err instanceof CurrentLocationError ? err.code : 'no_fix';
      setStatus(
        code === 'permission'
          ? 'ask'
          : code === 'services_off'
            ? 'services_off'
            : code === 'unavailable'
              ? 'unavailable'
              : 'error',
      );
      return null;
    }
  }, [appUserId, locale]);

  const request = useCallback(async () => {
    const permission = await requestLocationPermission();
    if (permission.status === 'granted') return locate();
    setStatus(
      permission.status === 'unavailable'
        ? 'unavailable'
        : permission.canAskAgain
          ? 'ask'
          : 'blocked',
    );
    return null;
  }, [locate]);

  useEffect(() => {
    if (!active) return undefined;
    void locate();
    // Closing or unmounting drops the answer of a fix still in flight.
    return () => {
      runId.current += 1;
    };
  }, [active, locate]);

  return {
    status,
    place: resolved?.place ?? null,
    coordinate: resolved?.coordinate ?? null,
    refresh: locate,
    request,
  };
}
