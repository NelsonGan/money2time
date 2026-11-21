const mockPlatform = { OS: 'ios' as 'ios' | 'android' };
jest.mock('react-native', () => ({ Platform: mockPlatform }));

import { fitMapToPoints } from '~/features/places/lib/fitMap';

const map = () => ({ animateToRegion: jest.fn(), fitToCoordinates: jest.fn() });
const KLCC = { latitude: 3.1579, longitude: 101.7123 };
const PAVILION = { latitude: 3.149, longitude: 101.7134 };
const margin = { top: 24, right: 48, bottom: 24, left: 48 };
const mapPadding = { top: 140, right: 0, bottom: 260, left: 0 };

describe('fitting the map to its points', () => {
  it('gives points on one spot a fixed zoom, never a box of no size', () => {
    const m = map();
    // Two shops in one building (or two albums in one city).
    fitMapToPoints(m, [KLCC, { ...KLCC }], { minDelta: 0.02, margin, animated: true });
    expect(m.fitToCoordinates).not.toHaveBeenCalled();
    expect(m.animateToRegion).toHaveBeenCalledWith(
      { ...KLCC, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      350,
    );
  });

  it('measures the margin from the whole view on iOS, so it carries the map padding', () => {
    mockPlatform.OS = 'ios';
    const m = map();
    fitMapToPoints(m, [KLCC, PAVILION], { minDelta: 0.02, margin, mapPadding, animated: false });
    expect(m.fitToCoordinates).toHaveBeenCalledWith([KLCC, PAVILION], {
      edgePadding: { top: 164, right: 48, bottom: 284, left: 48 },
      animated: false,
    });
  });

  it('passes only the margin on Android, where Google Maps adds the map padding itself', () => {
    mockPlatform.OS = 'android';
    const m = map();
    fitMapToPoints(m, [KLCC, PAVILION], { minDelta: 0.02, margin, mapPadding, animated: true });
    expect(m.fitToCoordinates).toHaveBeenCalledWith([KLCC, PAVILION], {
      edgePadding: margin,
      animated: true,
    });
  });

  it('does nothing without a map or points', () => {
    const m = map();
    fitMapToPoints(null, [KLCC], { minDelta: 0.02, margin, animated: true });
    fitMapToPoints(m, [], { minDelta: 0.02, margin, animated: true });
    expect(m.animateToRegion).not.toHaveBeenCalled();
    expect(m.fitToCoordinates).not.toHaveBeenCalled();
  });
});
