import {
  createPlaceClusterer,
  longitudeDeltaForZoom,
  zoomForRegion,
} from '~/features/places/lib/placeClusters';
import type { PlaceGroup } from '~/features/places/lib/placeLocation';

function group(key: string, latitude: number, longitude: number, count = 1): PlaceGroup {
  return {
    key,
    name: key,
    address: null,
    category: null,
    latitude,
    longitude,
    transactions: Array.from({ length: count }, (_, i) => ({ id: `${key}${i}` })) as never,
  };
}

describe('spending map clusters', () => {
  const groups = [
    group('klcc', 3.1579, 101.7123, 3),
    group('pavilion', 3.149, 101.713, 2),
    group('changi', 1.3644, 103.9915, 1),
  ];
  const clusterer = createPlaceClusterer(groups);
  const WIDTH = 400;

  it('converts between a region and a zoom level', () => {
    const delta = longitudeDeltaForZoom(12, WIDTH);
    expect(
      zoomForRegion(
        { latitude: 0, longitude: 0, latitudeDelta: delta, longitudeDelta: delta },
        WIDTH,
      ),
    ).toBeCloseTo(12, 6);
  });

  it('merges nearby places when zoomed out, counting their entries', () => {
    const markers = clusterer(
      { latitude: 2.5, longitude: 102.8, latitudeDelta: 6, longitudeDelta: 6 },
      WIDTH,
    );
    const cluster = markers.find((m) => m.kind === 'cluster');
    expect(cluster).toBeDefined();
    if (cluster?.kind !== 'cluster') return;
    expect(cluster.count).toBe(5);
    expect(cluster.groups.map((g) => g.key).sort()).toEqual(['klcc', 'pavilion']);
    expect(cluster.expansionZoom).toBeGreaterThan(
      zoomForRegion({ latitude: 0, longitude: 0, latitudeDelta: 6, longitudeDelta: 6 }, WIDTH),
    );
    expect(markers.filter((m) => m.kind === 'place').map((m) => m.key)).toEqual(['changi']);
  });

  it('splits them apart when zoomed in', () => {
    const markers = clusterer(
      { latitude: 3.153, longitude: 101.713, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      WIDTH,
    );
    expect(markers.map((m) => [m.kind, m.key]).sort()).toEqual([
      ['place', 'klcc'],
      ['place', 'pavilion'],
    ]);
  });

  it('handles the whole world and a view across the antimeridian', () => {
    expect(
      clusterer({ latitude: 0, longitude: 0, latitudeDelta: 170, longitudeDelta: 360 }, WIDTH)
        .length,
    ).toBeGreaterThan(0);
    const pacific = createPlaceClusterer([
      group('fiji', -17.7, 178.0),
      group('samoa', -13.8, -171.8),
    ]);
    const markers = pacific(
      { latitude: -15, longitude: 180, latitudeDelta: 20, longitudeDelta: 30 },
      WIDTH,
    );
    const keys = markers.flatMap((m) =>
      m.kind === 'place' ? [m.key] : m.groups.map((g) => g.key),
    );
    expect(keys.sort()).toEqual(['fiji', 'samoa']);
  });
});
