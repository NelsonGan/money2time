jest.mock('react-native', () => ({ Linking: { openSettings: jest.fn(async () => undefined) } }));
jest.mock('~/features/places/services/placeSearch', () => ({ reverseGeocodePlace: jest.fn() }));
jest.mock(
  'expo-location',
  () => ({
    Accuracy: { Balanced: 3 },
    getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    hasServicesEnabledAsync: jest.fn(async () => true),
    getLastKnownPositionAsync: jest.fn(async () => null),
    getCurrentPositionAsync: jest.fn(),
  }),
  { virtual: true },
);

import * as Location from 'expo-location';

import {
  getCurrentCoordinate,
  placeFromGeocodedAddress,
} from '~/features/places/services/deviceLocation';

const HERE = { latitude: 3.1579, longitude: 101.7123 };

describe('the phone geocoder answer as a place', () => {
  it('keeps a point of interest name with its street and city', () => {
    expect(
      placeFromGeocodedAddress(HERE, {
        name: 'Suria KLCC',
        streetNumber: null,
        street: 'Jalan Ampang',
        district: 'Kampung Baru',
        city: 'Kuala Lumpur',
        isoCountryCode: 'my',
      }),
    ).toEqual({
      id: null,
      name: 'Suria KLCC',
      address: 'Jalan Ampang, Kampung Baru, Kuala Lumpur',
      ...HERE,
      category: null,
      countryCode: 'MY',
    });
  });

  it('uses the street when the name is only a house number', () => {
    expect(
      placeFromGeocodedAddress(HERE, {
        name: '151',
        streetNumber: '151',
        street: 'Jalan Ampang',
        city: 'Kuala Lumpur',
      }),
    ).toMatchObject({ name: '151 Jalan Ampang', address: 'Kuala Lumpur' });
  });

  it('falls back to the district or city, and gives up with nothing to name', () => {
    expect(placeFromGeocodedAddress(HERE, { city: 'Kuala Lumpur' })).toMatchObject({
      name: 'Kuala Lumpur',
      address: '',
    });
    expect(placeFromGeocodedAddress(HERE, {})).toBeNull();
  });
});

describe('the current position', () => {
  it('reports a failed fix as worth retrying, not as no location support', async () => {
    (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValueOnce(
      new Error('kCLErrorLocationUnknown'),
    );
    await expect(getCurrentCoordinate()).rejects.toMatchObject({ code: 'no_fix' });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({ coords: HERE });
    await expect(getCurrentCoordinate()).resolves.toEqual(HERE);
  });
});
