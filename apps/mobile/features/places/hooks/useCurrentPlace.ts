import { useCallback, useEffect, useRef, useState } from 'react';

import {
  locateCurrentPlace,
  type ResolvedCurrentPlace,
  reusableCurrentPlace,
} from '../services/currentPlace';
import {
  CurrentLocationError,
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
  const [resolved, setResolved] = useState<ResolvedCurrentPlace | null>(null);
  const runId = useRef(0);

  const locate = useCallback(async () => {
    const id = ++runId.current;
    // Checked even for a reused fix: access revoked a moment ago means no place.
    const permission = await getLocationPermission();
    if (id !== runId.current) return null;
    if (permission.status !== 'granted') {
      // An earlier fix no longer counts once access is gone.
      setResolved(null);
      setStatus(
        permission.status === 'unavailable'
          ? 'unavailable'
          : permission.canAskAgain
            ? 'ask'
            : 'blocked',
      );
      return null;
    }
    const reusable = reusableCurrentPlace(locale);
    if (reusable) {
      setResolved(reusable);
      setStatus('ready');
      return reusable;
    }
    setStatus('locating');
    try {
      const next = await locateCurrentPlace({ appUserId, locale });
      if (id !== runId.current) return null;
      setResolved(next);
      setStatus('ready');
      return next;
    } catch (err) {
      if (id !== runId.current) return null;
      const code = err instanceof CurrentLocationError ? err.code : 'no_fix';
      if (code === 'permission') setResolved(null);
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
    setResolved(null);
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
