import { useEffect, useRef, useState } from 'react';

import type { Coordinate, NearbyCategory, PlaceResult } from '../lib/placeTypes';
import { nearbyPlaces, PlaceSearchError, type PlaceSearchErrorCode } from '../services/placeSearch';

export type NearbyState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; places: PlaceResult[] }
  | { kind: 'error'; code: PlaceSearchErrorCode };

// One answer per point and kind serves every picker opened within this
// window, so tagging three coffees in a row asks the Worker once.
const REUSE_MS = 5 * 60 * 1000;
const answers = new Map<string, { places: PlaceResult[]; at: number }>();

function answerKey(origin: Coordinate, category: NearbyCategory, locale: string | null): string {
  // About 110 m, as the Worker rounds it: a few steps away is the same answer.
  return `${category}:${origin.latitude.toFixed(3)},${origin.longitude.toFixed(3)}:${locale ?? ''}`;
}

/**
 * Places to spend around `origin` (README: Transaction locations), for the
 * location picker's Nearby list and map. Asks only while `active` and only
 * when the point or the kind changes; a failed answer stays failed until then.
 */
export function useNearbyPlaces({
  active,
  origin,
  category,
  appUserId,
  locale,
}: {
  active: boolean;
  origin: Coordinate | null;
  category: NearbyCategory;
  appUserId: string;
  locale: string | null;
}): NearbyState {
  const [state, setState] = useState<NearbyState>({ kind: 'idle' });
  const requestId = useRef(0);
  const latitude = origin?.latitude ?? null;
  const longitude = origin?.longitude ?? null;

  useEffect(() => {
    if (!active || latitude === null || longitude === null) {
      requestId.current += 1;
      setState({ kind: 'idle' });
      return undefined;
    }
    const near = { latitude, longitude };
    const key = answerKey(near, category, locale);
    const reusable = answers.get(key);
    if (reusable && Date.now() - reusable.at < REUSE_MS) {
      setState({ kind: 'done', places: reusable.places });
      return undefined;
    }
    const id = ++requestId.current;
    setState({ kind: 'loading' });
    nearbyPlaces({ appUserId, near, category, locale })
      .then((places) => {
        answers.set(key, { places, at: Date.now() });
        if (id === requestId.current) setState({ kind: 'done', places });
      })
      .catch((err: unknown) => {
        if (id !== requestId.current) return;
        setState({
          kind: 'error',
          code: err instanceof PlaceSearchError ? err.code : 'network',
        });
      });
    return () => {
      requestId.current += 1;
    };
  }, [active, latitude, longitude, category, appUserId, locale]);

  return state;
}
