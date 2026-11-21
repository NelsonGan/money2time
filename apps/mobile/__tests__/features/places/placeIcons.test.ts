jest.mock(
  'lucide-react-native',
  () => new Proxy({}, { get: (_target, name) => `icon:${String(name)}` }),
);

import { placeCategoryIcon } from '~/features/places/lib/placeIcons';

describe('place category icons', () => {
  it("uses Apple's category, falling back to a pin for anything else", () => {
    expect(placeCategoryIcon('Restaurant')).toBe('icon:Utensils');
    expect(placeCategoryIcon(null)).toBe('icon:MapPin');
    expect(placeCategoryIcon('Spaceport')).toBe('icon:MapPin');
    // Synced data: a category named like an object property is still just a pin.
    expect(placeCategoryIcon('constructor')).toBe('icon:MapPin');
    expect(placeCategoryIcon('toString')).toBe('icon:MapPin');
  });
});
