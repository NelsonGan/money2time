/**
 * Clustering for the spending map: places close together on screen merge into
 * one bubble at the current zoom (Supercluster), so a month in one city stays
 * readable when zoomed out and splits apart as the user zooms in.
 */

import Supercluster from 'supercluster';

import type { Transaction } from '~/types';

import type { PlaceGroup } from './placeLocation';

export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export type PlaceMarker<T extends Transaction = Transaction> =
  | { kind: 'place'; key: string; latitude: number; longitude: number; group: PlaceGroup<T> }
  | {
      kind: 'cluster';
      key: string;
      latitude: number;
      longitude: number;
      groups: PlaceGroup<T>[];
      /** Transactions under the bubble. */
      count: number;
      /** Zoom at which the bubble splits, for tap-to-zoom. */
      expansionZoom: number;
    };

interface PointProps {
  index: number;
  count: number;
}

/** The web-map zoom level a region shows at a given width in points. */
export function zoomForRegion(region: MapRegion, widthPoints: number): number {
  const delta = Math.max(1e-6, Math.min(360, region.longitudeDelta));
  const zoom = Math.log2((360 * (Math.max(1, widthPoints) / 256)) / delta);
  return Math.max(0, Math.min(20, zoom));
}

/** The longitude delta that shows `zoom` at `widthPoints` (inverse of zoomForRegion). */
export function longitudeDeltaForZoom(zoom: number, widthPoints: number): number {
  return Math.min(360, (360 * (Math.max(1, widthPoints) / 256)) / 2 ** zoom);
}

function bboxForRegion(region: MapRegion): [number, number, number, number] {
  const halfLat = Math.min(90, region.latitudeDelta / 2);
  const south = Math.max(-90, region.latitude - halfLat);
  const north = Math.min(90, region.latitude + halfLat);
  if (region.longitudeDelta >= 360) return [-180, south, 180, north];
  const wrap = (lng: number) => ((((lng + 180) % 360) + 360) % 360) - 180;
  const west = wrap(region.longitude - region.longitudeDelta / 2);
  const east = wrap(region.longitude + region.longitudeDelta / 2);
  // Supercluster takes a west > east box as one crossing the antimeridian.
  return [west, south, east, north];
}

/** Past this zoom places no longer merge; a bubble there shares one point. */
export const CLUSTER_MAX_ZOOM = 17;

export function createPlaceClusterer<T extends Transaction>(groups: readonly PlaceGroup<T>[]) {
  const index = new Supercluster<PointProps, { count: number }>({
    radius: 64,
    maxZoom: CLUSTER_MAX_ZOOM,
    map: (props) => ({ count: props.count }),
    reduce: (acc, props) => {
      acc.count += props.count;
    },
  });
  index.load(
    groups.map((group, i) => ({
      type: 'Feature' as const,
      properties: { index: i, count: group.transactions.length },
      geometry: { type: 'Point' as const, coordinates: [group.longitude, group.latitude] },
    })),
  );

  return (region: MapRegion, widthPoints: number): PlaceMarker<T>[] => {
    const zoom = Math.floor(zoomForRegion(region, widthPoints));
    const markers = index
      .getClusters(bboxForRegion(region), zoom)
      .map((feature): PlaceMarker<T> => {
        const [longitude, latitude] = feature.geometry.coordinates as [number, number];
        const props = feature.properties as Partial<PointProps> & {
          cluster?: boolean;
          cluster_id?: number;
          count?: number;
        };
        if (props.cluster && typeof props.cluster_id === 'number') {
          const leaves = index.getLeaves(props.cluster_id, Infinity);
          const clusterGroups = leaves
            .map((leaf) => groups[(leaf.properties as PointProps).index])
            .filter((group): group is PlaceGroup<T> => Boolean(group));
          return {
            kind: 'cluster',
            key: `cluster:${props.cluster_id}`,
            latitude,
            longitude,
            groups: clusterGroups,
            count: props.count ?? clusterGroups.reduce((n, g) => n + g.transactions.length, 0),
            expansionZoom: index.getClusterExpansionZoom(props.cluster_id),
          };
        }
        const group = groups[props.index as number] as PlaceGroup<T>;
        return { kind: 'place', key: group.key, latitude, longitude, group };
      });
    return mergeSamePoint(markers);
  };
}

/**
 * Past the clustering zoom every place comes back on its own, and places at
 * one point (two shops in one building, say) would draw as one pin with the
 * others unreachable under it. They become a bubble that lists them instead.
 */
function mergeSamePoint<T extends Transaction>(markers: PlaceMarker<T>[]): PlaceMarker<T>[] {
  const byPoint = new Map<string, PlaceMarker<T>[]>();
  for (const marker of markers) {
    const point = `${marker.latitude.toFixed(5)},${marker.longitude.toFixed(5)}`;
    const list = byPoint.get(point);
    if (list) list.push(marker);
    else byPoint.set(point, [marker]);
  }
  const out: PlaceMarker<T>[] = [];
  for (const [point, list] of byPoint) {
    if (list.length === 1) {
      out.push(list[0] as PlaceMarker<T>);
      continue;
    }
    const groups = list.flatMap((marker) =>
      marker.kind === 'place' ? [marker.group] : marker.groups,
    );
    out.push({
      kind: 'cluster',
      key: `point:${point}`,
      latitude: (list[0] as PlaceMarker<T>).latitude,
      longitude: (list[0] as PlaceMarker<T>).longitude,
      groups,
      count: groups.reduce((n, g) => n + g.transactions.length, 0),
      // They never split, however far in.
      expansionZoom: CLUSTER_MAX_ZOOM + 1,
    });
  }
  return out;
}
