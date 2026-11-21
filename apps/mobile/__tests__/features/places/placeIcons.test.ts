jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: (_target, name) => `icon:${String(name)}` }),
);

import { classifyCategoryIcon } from '~/constants/categoryIcons';
import { NEARBY_CHIP_ICONS, placeCategoryIcon } from '~/features/places/lib/placeIcons';

describe('place category icons', () => {
  it("uses Apple's category, falling back to a pin for anything else", () => {
    expect(placeCategoryIcon('Restaurant')).toEqual({ flat: 'icon:Utensils', clay: 'meal' });
    expect(placeCategoryIcon(null)).toEqual({ flat: 'icon:MapPin', clay: 'location-pin' });
    expect(placeCategoryIcon('Spaceport').clay).toBe('location-pin');
    // Synced data: a category named like an object property is still just a pin.
    expect(placeCategoryIcon('constructor').clay).toBe('location-pin');
    expect(placeCategoryIcon('toString').clay).toBe('location-pin');
  });

  it('draws every clay icon from the bundled category pack', () => {
    const categories = [
      'Cafe',
      'Bakery',
      'Restaurant',
      'Brewery',
      'Nightlife',
      'FoodMarket',
      'Store',
      'Beauty',
      'GasStation',
      'EVCharger',
      'AutomotiveRepair',
      'Hotel',
      'Airport',
      'PublicTransport',
      'Parking',
      'Pharmacy',
      'Hospital',
      'Bank',
      'ATM',
      'MovieTheater',
      'Theater',
      'MusicVenue',
      'FitnessCenter',
      'Park',
      'NationalPark',
      'Beach',
      'Museum',
      'University',
      'School',
      'Library',
      null,
    ];
    const ids = [
      ...categories.map((category) => placeCategoryIcon(category).clay),
      ...Object.values(NEARBY_CHIP_ICONS).map((spec) => spec.clay),
    ];
    for (const id of ids) expect([id, classifyCategoryIcon(id).kind]).toEqual([id, 'bundled']);
  });
});
