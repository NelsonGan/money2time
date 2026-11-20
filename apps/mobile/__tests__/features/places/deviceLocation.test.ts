jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('~/features/places/services/placeSearch', () => ({ reverseGeocodePlace: jest.fn() }));

import { placeFromGeocodedAddress } from '~/features/places/services/deviceLocation';

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
