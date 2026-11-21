/**
 * The phone's own location for tagging a transaction (README: Transaction
 * locations). The fix and the street address come from the phone (Core
 * Location's geocoder on iOS, the platform geocoder on Android) and cost
 * nothing; only when the phone cannot name the spot does the Worker's Apple
 * reverse lookup step in.
 *
 * `expo-location` is a native module: it is required lazily so a dev client
 * built before it was added keeps working (the location chip then offers
 * search only).
 */

import { Linking } from 'react-native';

import type { Coordinate, PlaceResult } from '../lib/placeTypes';
import { reverseGeocodePlace } from './placeSearch';

type ExpoLocation = typeof import('expo-location');

let cachedModule: ExpoLocation | null | undefined;

function locationModule(): ExpoLocation | null {
  if (cachedModule !== undefined) return cachedModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native module, see above
    cachedModule = require('expo-location') as ExpoLocation;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

export type LocationPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

export interface LocationPermissionState {
  status: LocationPermission;
  /** False once the user said no for good: only the Settings app can change it. */
  canAskAgain: boolean;
}

export async function getLocationPermission(): Promise<LocationPermissionState> {
  const Location = locationModule();
  if (!Location) return { status: 'unavailable', canAskAgain: false };
  try {
    const result = await Location.getForegroundPermissionsAsync();
    return { status: result.status as LocationPermission, canAskAgain: result.canAskAgain };
  } catch {
    return { status: 'unavailable', canAskAgain: false };
  }
}

/** Asks for "while using the app" location, when the system still lets us ask. */
export async function requestLocationPermission(): Promise<LocationPermissionState> {
  const Location = locationModule();
  if (!Location) return { status: 'unavailable', canAskAgain: false };
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted' || !current.canAskAgain) {
      return { status: current.status as LocationPermission, canAskAgain: current.canAskAgain };
    }
    const result = await Location.requestForegroundPermissionsAsync();
    return { status: result.status as LocationPermission, canAskAgain: result.canAskAgain };
  } catch {
    return { status: 'unavailable', canAskAgain: false };
  }
}

/**
 * Why there is no position: no permission, Location Services off, no fix this
 * time (a timeout, or the phone could not get one; worth a retry), or no
 * location module in this build.
 */
export type CurrentCoordinateError = 'permission' | 'services_off' | 'no_fix' | 'unavailable';

export class CurrentLocationError extends Error {
  constructor(readonly code: CurrentCoordinateError) {
    super(code);
    this.name = 'CurrentLocationError';
  }
}

// A fix this recent and this accurate is good enough to tag a purchase and
// costs no GPS wait.
const LAST_KNOWN_MAX_AGE_MS = 2 * 60 * 1000;
const LAST_KNOWN_ACCURACY_M = 150;
const FIX_TIMEOUT_MS = 10000;

/**
 * Where the phone is now. Never asks for permission: callers ask first
 * (the Settings switch, or the picker's "Current location" row).
 */
export async function getCurrentCoordinate(): Promise<Coordinate> {
  const Location = locationModule();
  if (!Location) throw new CurrentLocationError('unavailable');
  const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
  if (permission?.status !== 'granted') throw new CurrentLocationError('permission');
  const servicesOn = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!servicesOn) throw new CurrentLocationError('services_off');

  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: LAST_KNOWN_MAX_AGE_MS,
    requiredAccuracy: LAST_KNOWN_ACCURACY_M,
  }).catch(() => null);
  if (lastKnown) {
    return { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const position = await Promise.race([
      // Never Android's "turn on Location Accuracy" dialog: this runs on its
      // own when an editor opens, and a coarser fix is fine for a purchase.
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
        mayShowUserSettingsDialog: false,
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new CurrentLocationError('no_fix')), FIX_TIMEOUT_MS);
      }),
    ]);
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch (err) {
    if (err instanceof CurrentLocationError) throw err;
    // iOS's kCLErrorLocationUnknown, or Android with no fix yet: try again later.
    throw new CurrentLocationError('no_fix');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface GeocodedAddress {
  name?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  district?: string | null;
  city?: string | null;
  subregion?: string | null;
  region?: string | null;
  isoCountryCode?: string | null;
}

const clean = (value: string | null | undefined) => (value ?? '').trim();

/**
 * The phone geocoder's answer as a place. iOS puts a point of interest or the
 * house number and street in `name`; a bare house number is not a name, so
 * the street stands in for it.
 */
export function placeFromGeocodedAddress(
  coordinate: Coordinate,
  address: GeocodedAddress,
): PlaceResult | null {
  const street = [clean(address.streetNumber), clean(address.street)].filter(Boolean).join(' ');
  const rawName = clean(address.name);
  const nameIsNumber = rawName !== '' && rawName === clean(address.streetNumber);
  const name =
    (!nameIsNumber && rawName) || street || clean(address.district) || clean(address.city);
  if (!name) return null;
  const locality = clean(address.city) || clean(address.subregion) || clean(address.region);
  const addressParts = [street !== name ? street : '', clean(address.district), locality].filter(
    (part, index, all) => part && part !== name && all.indexOf(part) === index,
  );
  return {
    id: null,
    name,
    address: addressParts.join(', '),
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    category: null,
    countryCode: clean(address.isoCountryCode).toUpperCase() || null,
  };
}

async function describeOnDevice(coordinate: Coordinate): Promise<PlaceResult | null> {
  const Location = locationModule();
  if (!Location) return null;
  try {
    const [first] = await Location.reverseGeocodeAsync(coordinate);
    return first ? placeFromGeocodedAddress(coordinate, first as GeocodedAddress) : null;
  } catch {
    // Android without Play services, or iOS's geocoder rate limit.
    return null;
  }
}

/**
 * Names the spot: the phone's geocoder first (free), then the Worker's Apple
 * lookup, else null (the caller saves the bare point with a generic name).
 * The saved point is always the phone's own fix, not the geocoder's.
 */
export async function describeCoordinate(
  coordinate: Coordinate,
  { appUserId, locale }: { appUserId: string; locale?: string | null },
): Promise<PlaceResult | null> {
  const onDevice = await describeOnDevice(coordinate);
  if (onDevice) return onDevice;
  try {
    const remote = await reverseGeocodePlace({ appUserId, ...coordinate, locale });
    return remote
      ? { ...remote, latitude: coordinate.latitude, longitude: coordinate.longitude }
      : null;
  } catch {
    return null;
  }
}

/** Opens this app's page in the Settings app, for a permission the user denied. */
export async function openLocationSettings(): Promise<void> {
  await Linking.openSettings().catch(() => undefined);
}
