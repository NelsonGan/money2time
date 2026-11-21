/**
 * Pure helpers for transaction locations (README: Transaction locations):
 * turning a place into a transaction's fields and back, distances, the
 * user's recent places and grouping a period's entries by place for the map.
 */

import type { Transaction, TransactionLocation } from '~/types';

import type { Coordinate, PlaceResult } from './placeTypes';

export type LocatedTransaction<T extends Transaction = Transaction> = T & {
  latitude: number;
  longitude: number;
  placeName: string;
};

export function isLocatedTransaction<T extends Transaction>(
  transaction: T,
): transaction is LocatedTransaction<T> {
  return (
    typeof transaction.latitude === 'number' &&
    typeof transaction.longitude === 'number' &&
    Number.isFinite(transaction.latitude) &&
    Number.isFinite(transaction.longitude) &&
    typeof transaction.placeName === 'string' &&
    transaction.placeName.length > 0
  );
}

/** The fields a place writes on a transaction. */
export function toTransactionLocation(place: PlaceResult): TransactionLocation {
  return {
    latitude: place.latitude,
    longitude: place.longitude,
    placeName: place.name.trim() || place.address.trim(),
    placeAddress: place.address.trim() || null,
    placeId: place.id,
    placeCategory: place.category,
  };
}

/** A transaction's saved location fields, or null when it has none. */
export function locationOfTransaction(transaction: Transaction): TransactionLocation | null {
  if (!isLocatedTransaction(transaction)) return null;
  return {
    latitude: transaction.latitude,
    longitude: transaction.longitude,
    placeName: transaction.placeName,
    placeAddress: transaction.placeAddress,
    placeId: transaction.placeId,
    placeCategory: transaction.placeCategory,
  };
}

/** A transaction's saved place, or null when it has none. */
function placeOfTransaction(transaction: Transaction): PlaceResult | null {
  if (!isLocatedTransaction(transaction)) return null;
  return {
    id: transaction.placeId,
    name: transaction.placeName,
    address: transaction.placeAddress ?? '',
    latitude: transaction.latitude,
    longitude: transaction.longitude,
    category: transaction.placeCategory,
    countryCode: null,
  };
}

const EARTH_RADIUS_M = 6371008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in metres. */
export function distanceMeters(a: Coordinate, b: Coordinate): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.latitude)) * Math.cos(toRadians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "40 m", "850 m", "1.1 km", "12 km", digits in the given locale. */
export function formatDistance(meters: number, locale?: string): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) {
    const rounded = Math.max(10, Math.round(meters / 10) * 10);
    return `${new Intl.NumberFormat(locale).format(rounded)} m`;
  }
  const km = meters / 1000;
  const digits = km < 10 ? 1 : 0;
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(km)} km`;
}

/**
 * Which entries share a place: Apple's id when it has one, else the name at
 * the point rounded to about 11 m (two spots on the same street with the same
 * name are one place; a different name next door is another).
 */
export function placeKey(
  place: Pick<PlaceResult, 'id' | 'name' | 'latitude' | 'longitude'>,
): string {
  if (place.id) return `id:${place.id}`;
  const name = place.name.trim().toLowerCase();
  return `pt:${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}:${name}`;
}

/** The place key of a saved location (a transaction's own id is never its place). */
export function locationKey(
  location: Pick<TransactionLocation, 'placeId' | 'placeName' | 'latitude' | 'longitude'>,
): string {
  return placeKey({
    id: location.placeId,
    name: location.placeName,
    latitude: location.latitude,
    longitude: location.longitude,
  });
}

/**
 * The places the user tagged before, most recent first, one per place. With
 * `near`, the ones within `nearRadiusMeters` come first, closest first, so
 * the picker offers "where I usually am around here" without a search.
 */
export function recentPlaces(
  transactions: readonly Transaction[],
  {
    limit = 8,
    near = null,
    nearRadiusMeters = 2000,
  }: { limit?: number; near?: Coordinate | null; nearRadiusMeters?: number } = {},
): PlaceResult[] {
  const byKey = new Map<string, { place: PlaceResult; date: string }>();
  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    const place = placeOfTransaction(transaction);
    if (!place) continue;
    const key = placeKey(place);
    const seen = byKey.get(key);
    if (!seen || transaction.date > seen.date) byKey.set(key, { place, date: transaction.date });
  }
  const all = [...byKey.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (!near) return all.slice(0, limit).map((entry) => entry.place);
  const withDistance = all.map((entry) => ({
    ...entry,
    distance: distanceMeters(near, entry.place),
  }));
  const nearby = withDistance
    .filter((entry) => entry.distance <= nearRadiusMeters)
    .sort((a, b) => a.distance - b.distance);
  const rest = withDistance.filter((entry) => entry.distance > nearRadiusMeters);
  return [...nearby, ...rest].slice(0, limit).map((entry) => entry.place);
}

export interface PlaceGroup<T extends Transaction = Transaction> {
  key: string;
  name: string;
  address: string | null;
  category: string | null;
  latitude: number;
  longitude: number;
  /** Newest first. */
  transactions: LocatedTransaction<T>[];
}

/** A period's located entries, one group per place, busiest place first. */
export function groupByPlace<T extends Transaction>(transactions: readonly T[]): PlaceGroup<T>[] {
  const groups = new Map<string, PlaceGroup<T>>();
  for (const transaction of transactions) {
    if (transaction.deletedAt || !isLocatedTransaction(transaction)) continue;
    const key = locationKey(transaction);
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        name: transaction.placeName,
        address: transaction.placeAddress,
        category: transaction.placeCategory,
        latitude: transaction.latitude,
        longitude: transaction.longitude,
        transactions: [],
      };
      groups.set(key, group);
    }
    group.transactions.push(transaction);
  }
  const out = [...groups.values()];
  for (const group of out) {
    group.transactions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    // The newest entry names the place, so a renamed shop shows its new name.
    const newest = group.transactions[0];
    if (newest) {
      group.name = newest.placeName;
      group.address = newest.placeAddress;
      group.category = newest.placeCategory;
    }
  }
  return out.sort((a, b) => b.transactions.length - a.transactions.length);
}

/** The smallest box around the points, padded, for fitting the map. */
export function regionFor(
  points: readonly Coordinate[],
  { padding = 1.4, minDelta = 0.01 }: { padding?: number; minDelta?: number } = {},
): { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number } | null {
  if (points.length === 0) return null;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.min(170, Math.max(minDelta, (maxLat - minLat) * padding)),
    longitudeDelta: Math.min(360, Math.max(minDelta, (maxLng - minLng) * padding)),
  };
}
