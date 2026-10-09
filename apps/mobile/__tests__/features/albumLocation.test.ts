import { buildFtsMatch, escapeLike, normalizeCityQuery, toCity } from '~/lib/db/citiesDb';
import { toAlbum } from '~/lib/repositories/mappers';
import type { Album } from '~/types';
import { isLocatedAlbum } from '~/types';

const STAMPS = {
  createdAt: '2026-05-13T00:00:00.000Z',
  updatedAt: '2026-05-13T00:00:00.000Z',
  deletedAt: null,
};

function makeAlbum(overrides: Partial<Album>): Album {
  return {
    id: 'al1',
    name: 'Trip',
    coverPhotoUri: null,
    isActive: false,
    startDate: null,
    endDate: null,
    latitude: null,
    longitude: null,
    placeId: null,
    placeName: null,
    placeAdmin: null,
    countryCode: null,
    sortOrder: 0,
    ...STAMPS,
    ...overrides,
  };
}

describe('toAlbum location mapping', () => {
  it('maps location columns through', () => {
    const album = toAlbum({
      id: 'al1',
      name: 'Tokyo',
      coverPhotoUri: null,
      isActive: false,
      startDate: null,
      endDate: null,
      latitude: 35.68,
      longitude: 139.76,
      placeId: '1850147',
      placeName: 'Tokyo',
      placeAdmin: 'Tokyo',
      countryCode: 'JP',
      sortOrder: 0,
      ...STAMPS,
    } as any);
    expect(album.latitude).toBe(35.68);
    expect(album.longitude).toBe(139.76);
    expect(album.placeId).toBe('1850147');
    expect(album.countryCode).toBe('JP');
  });

  it('defaults missing location columns to null', () => {
    const album = toAlbum({
      id: 'al1',
      name: 'Legacy',
      coverPhotoUri: null,
      isActive: false,
      startDate: null,
      endDate: null,
      sortOrder: 0,
      ...STAMPS,
    } as any);
    expect(album.latitude).toBeNull();
    expect(album.longitude).toBeNull();
    expect(album.placeName).toBeNull();
  });
});

describe('isLocatedAlbum', () => {
  it('is true only when both coordinates are set', () => {
    expect(isLocatedAlbum(makeAlbum({ latitude: 1, longitude: 2 }))).toBe(true);
    expect(isLocatedAlbum(makeAlbum({ latitude: 1, longitude: null }))).toBe(false);
    expect(isLocatedAlbum(makeAlbum({}))).toBe(false);
  });
});

describe('normalizeCityQuery', () => {
  it('trims, collapses whitespace, lowercases and strips diacritics', () => {
    expect(normalizeCityQuery('  São   Paulo ')).toBe('sao paulo');
    expect(normalizeCityQuery('TŌKYŌ')).toBe('tokyo');
  });
});

describe('buildFtsMatch', () => {
  it('builds prefix terms per token', () => {
    expect(buildFtsMatch('san fr')).toBe('san* fr*');
    expect(buildFtsMatch('tokyo')).toBe('tokyo*');
  });

  it('returns empty for blank or non-alphanumeric input', () => {
    expect(buildFtsMatch('   ')).toBe('');
    expect(buildFtsMatch('!!!')).toBe('');
  });
});

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape char itself', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('c\\d')).toBe('c\\\\d');
  });

  it('leaves ordinary text untouched', () => {
    expect(escapeLike('san francisco')).toBe('san francisco');
  });
});

describe('toCity', () => {
  it('prefers admin name, falls back to country code for country name', () => {
    const city = toCity({
      id: '1',
      name: 'Paris',
      admin1: '11',
      country_code: 'FR',
      country_name: 'France',
      admin_name: 'Île-de-France',
      latitude: 48.85,
      longitude: 2.35,
      population: 2000000,
    } as any);
    expect(city).toEqual({
      id: '1',
      name: 'Paris',
      admin: 'Île-de-France',
      countryCode: 'FR',
      countryName: 'France',
      latitude: 48.85,
      longitude: 2.35,
      population: 2000000,
    });
  });

  it('falls back to country code when country name is missing', () => {
    const city = toCity({
      id: '2',
      name: 'Nowhere',
      admin1: null,
      country_code: 'ZZ',
      country_name: null,
      admin_name: null,
      latitude: 0,
      longitude: 0,
      population: 0,
    } as any);
    expect(city.countryName).toBe('ZZ');
    expect(city.admin).toBeNull();
  });
});
