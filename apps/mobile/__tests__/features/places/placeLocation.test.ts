import {
  distanceMeters,
  formatDistance,
  groupByPlace,
  isLocatedTransaction,
  locationOfTransaction,
  matchPlaces,
  placeKey,
  preferNearResults,
  recentPlaces,
  regionFor,
  toTransactionLocation,
} from '~/features/places/lib/placeLocation';
import type { Transaction } from '~/types';

let seq = 0;
function tx(overrides: Partial<Transaction>): Transaction {
  seq += 1;
  return {
    id: `t${seq}`,
    type: 'expense',
    amount: 10,
    currency: 'MYR',
    reportingCurrency: null,
    reportingAmount: null,
    fxRate: null,
    toAmount: null,
    accountAmount: null,
    date: '2026-11-20T04:00:00.000Z',
    accountId: 'a1',
    fromAccountId: null,
    toAccountId: null,
    categoryId: 'c1',
    note: null,
    details: null,
    receiptUri: null,
    recurrencePattern: 'none',
    recurrenceInterval: 1,
    recurrenceEndDate: null,
    recurrenceParentId: null,
    sentiment: 'neutral',
    reimbursable: false,
    reimbursedAt: null,
    reimbursementAccountId: null,
    reimbursementTransactionId: null,
    reimbursementOfId: null,
    countsAsExpense: false,
    feeOfId: null,
    dayOrder: null,
    instalmentRuleId: null,
    instalmentNumber: null,
    createdBy: null,
    memberId: null,
    albumGroupId: null,
    albumCategory: null,
    albumCategoryName: null,
    albumCategoryIcon: null,
    latitude: null,
    longitude: null,
    placeName: null,
    placeAddress: null,
    placeId: null,
    placeCategory: null,
    createdAt: '2026-11-20T04:00:00.000Z',
    updatedAt: '2026-11-20T04:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

const KLCC = { latitude: 3.1579, longitude: 101.7123 };
const starbucks = {
  latitude: 3.1589569,
  longitude: 101.7137273,
  placeName: 'Starbucks',
  placeAddress: '151, Jalan Ampang',
  placeId: 'I88BAA55D81E8BF1',
  placeCategory: 'Cafe',
};

describe('locations on transactions', () => {
  it('turns a place into the fields a transaction saves, and back', () => {
    const location = toTransactionLocation({
      id: 'I1',
      name: ' Din Tai Fung ',
      address: 'Pavilion KL',
      latitude: 3.149,
      longitude: 101.713,
      category: 'Restaurant',
      countryCode: 'MY',
    });
    expect(location).toEqual({
      latitude: 3.149,
      longitude: 101.713,
      placeName: 'Din Tai Fung',
      placeAddress: 'Pavilion KL',
      placeId: 'I1',
      placeCategory: 'Restaurant',
    });
    expect(locationOfTransaction(tx(location))).toEqual(location);
    expect(locationOfTransaction(tx({}))).toBeNull();
  });

  it('names a spot without a name by its address', () => {
    expect(
      toTransactionLocation({
        id: null,
        name: '',
        address: 'Lorong Kuda',
        latitude: 1,
        longitude: 2,
        category: null,
        countryCode: null,
      }),
    ).toMatchObject({ placeName: 'Lorong Kuda', placeAddress: 'Lorong Kuda', placeId: null });
  });

  it('only counts a full point with a name as located', () => {
    expect(isLocatedTransaction(tx(starbucks))).toBe(true);
    expect(isLocatedTransaction(tx({ ...starbucks, placeName: null }))).toBe(false);
    expect(isLocatedTransaction(tx({ ...starbucks, longitude: null }))).toBe(false);
  });
});

describe('distances', () => {
  it('measures great-circle distance', () => {
    expect(distanceMeters(KLCC, starbucks)).toBeGreaterThan(180);
    expect(distanceMeters(KLCC, starbucks)).toBeLessThan(200);
    // Kuala Lumpur to Singapore, about 316 km.
    const km = distanceMeters(KLCC, { latitude: 1.3521, longitude: 103.8198 }) / 1000;
    expect(km).toBeGreaterThan(300);
    expect(km).toBeLessThan(330);
  });

  it('formats metres and kilometres', () => {
    expect(formatDistance(4, 'en')).toBe('10 m');
    expect(formatDistance(184, 'en')).toBe('180 m');
    expect(formatDistance(1149, 'en')).toBe('1.1 km');
    expect(formatDistance(23_600, 'en')).toBe('24 km');
    expect(formatDistance(Number.NaN, 'en')).toBe('');
  });
});

describe('places', () => {
  it('keys a searched place by Apple id and a spot by point and name', () => {
    const spot = { id: null, latitude: 3.15791, longitude: 101.71234 };
    expect(placeKey({ ...spot, id: 'I88BAA55D81E8BF1', name: 'Starbucks' })).toBe(
      'id:I88BAA55D81E8BF1',
    );
    expect(placeKey({ ...spot, name: 'Jalan Ampang' })).toBe('pt:3.1579,101.7123:jalan ampang');
    // Same street, different name next door: another place.
    expect(placeKey({ ...spot, name: 'Kiosk' })).not.toBe(
      placeKey({ ...spot, name: 'Jalan Ampang' }),
    );
  });

  it('lists recent places once each, newest first, nearby ones first when near is known', () => {
    const far = {
      ...starbucks,
      latitude: 1.3,
      longitude: 103.8,
      placeId: 'SG',
      placeName: 'Jewel',
    };
    const list = [
      tx({ ...starbucks, date: '2026-11-01T00:00:00.000Z' }),
      tx({ ...starbucks, date: '2026-11-19T00:00:00.000Z' }),
      tx({ ...far, date: '2026-11-20T00:00:00.000Z' }),
      tx({ ...starbucks, placeId: 'gone', deletedAt: '2026-11-20T00:00:00.000Z' }),
      tx({}),
    ];
    expect(recentPlaces(list).map((p) => p.name)).toEqual(['Jewel', 'Starbucks']);
    expect(recentPlaces(list, { near: KLCC }).map((p) => p.name)).toEqual(['Starbucks', 'Jewel']);
    expect(recentPlaces(list, { limit: 1 })).toHaveLength(1);
  });

  it('groups a period by place, busiest first, named by the newest entry', () => {
    const groups = groupByPlace([
      tx({ ...starbucks, placeName: 'Starbucks Old', date: '2026-11-01T00:00:00.000Z' }),
      tx({ ...starbucks, date: '2026-11-19T00:00:00.000Z' }),
      tx({ latitude: 3.1, longitude: 101.6, placeName: 'Market' }),
      tx({}),
    ]);
    expect(groups.map((g) => [g.name, g.transactions.length])).toEqual([
      ['Starbucks', 2],
      ['Market', 1],
    ]);
    expect(groups[0]?.transactions[0]?.date).toBe('2026-11-19T00:00:00.000Z');
  });

  it('groups a spot without an Apple id across drifting fixes, by name', () => {
    const cafe = {
      latitude: 3.15791,
      longitude: 101.71234,
      placeName: 'Kopi Corner',
      placeId: null,
    };
    // About 20 m and 30 m away: the phone's fix on other days.
    const drift1 = { ...cafe, latitude: 3.15809 };
    const drift2 = { ...cafe, longitude: 101.71261 };
    // 200 m away: another shop with the same name.
    const other = { ...cafe, latitude: 3.15971 };
    const groups = groupByPlace([tx(cafe), tx(drift1), tx(drift2), tx(other)]);
    expect(groups.map((g) => g.transactions.length)).toEqual([3, 1]);
    expect(recentPlaces([tx(cafe), tx(drift1), tx(other)])).toHaveLength(2);
  });

  it('groups spots without an Apple id by point and name, never by transaction', () => {
    const cafe = {
      latitude: 3.15791,
      longitude: 101.71234,
      placeName: 'Suria KLCC',
      placeId: null,
    };
    const groups = groupByPlace([tx(cafe), tx(cafe), tx({ ...cafe, placeName: 'Kiosk' })]);
    expect(groups.map((g) => [g.name, g.transactions.length])).toEqual([
      ['Suria KLCC', 2],
      ['Kiosk', 1],
    ]);
  });

  it('frames the points with padding and a minimum zoom', () => {
    expect(regionFor([])).toBeNull();
    expect(regionFor([KLCC])).toEqual({ ...KLCC, latitudeDelta: 0.01, longitudeDelta: 0.01 });
    const region = regionFor([KLCC, { latitude: 1.3521, longitude: 103.8198 }], { padding: 1 });
    expect(region?.latitudeDelta).toBeCloseTo(3.1579 - 1.3521, 4);
    expect(region?.longitude).toBeCloseTo((101.7123 + 103.8198) / 2, 4);
  });
});

function place(name: string, latitude = 3.158, longitude = 101.712, address = '') {
  return { id: null, name, address, latitude, longitude, category: null, countryCode: null };
}

describe('matchPlaces', () => {
  const places = [
    place('Village Grocer', 3.1, 101.7, 'Jalan Ampang'),
    place('ZUS Coffee'),
    place('Café Kopi'),
    place('The Coffee Bean'),
    place('Kopitiam Lama'),
  ];

  it('ranks a name that starts with the query, then a word, then anywhere, then the address', () => {
    expect(matchPlaces(places, 'kopi').map((p) => p.name)).toEqual(['Kopitiam Lama', 'Café Kopi']);
    expect(matchPlaces(places, 'coffee').map((p) => p.name)).toEqual([
      'ZUS Coffee',
      'The Coffee Bean',
    ]);
    expect(matchPlaces(places, 'ampang').map((p) => p.name)).toEqual(['Village Grocer']);
  });

  it('ignores case and accents, and an empty query matches nothing', () => {
    expect(matchPlaces(places, 'CAFE').map((p) => p.name)).toEqual(['Café Kopi']);
    expect(matchPlaces(places, '  ')).toEqual([]);
  });

  it('keeps at most the limit', () => {
    expect(matchPlaces(places, 'e', 2)).toHaveLength(2);
  });
});

describe('preferNearResults', () => {
  const kl = { latitude: 3.158, longitude: 101.712 };
  const local = place('Tower 2');
  const minnesota = place('Tower', 47.8, -92.3);

  it('drops results on another continent when some are local', () => {
    expect(preferNearResults([minnesota, local], kl)).toEqual([local]);
  });

  it('keeps a search for a far city, and everything without a point', () => {
    expect(preferNearResults([minnesota], kl)).toEqual([minnesota]);
    expect(preferNearResults([minnesota, local], null)).toEqual([minnesota, local]);
  });
});
