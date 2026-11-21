import { Platform } from 'react-native';
import type { EdgePadding, Region } from 'react-native-maps';

/** The two camera calls a fit needs (react-native-maps' MapView has both). */
interface FittableMap {
  animateToRegion(region: Region, duration?: number): void;
  fitToCoordinates(
    coordinates: { latitude: number; longitude: number }[],
    options?: { edgePadding?: EdgePadding; animated?: boolean },
  ): void;
}

const NO_PADDING: EdgePadding = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Frames `points` on `map`: their bounds with `margin` around them, inside the
 * map's own `mapPadding`. Points that all sit on one spot (a single place,
 * shops in one building, albums in one city) get a fixed `minDelta` view
 * instead, since a box of no size would zoom to street level.
 */
export function fitMapToPoints(
  map: FittableMap | null,
  points: readonly { latitude: number; longitude: number }[],
  {
    minDelta,
    margin,
    mapPadding = NO_PADDING,
    animated,
  }: { minDelta: number; margin: EdgePadding; mapPadding?: EdgePadding; animated: boolean },
): void {
  const first = points[0];
  if (!map || !first) return;
  const onOneSpot = points.every(
    (point) =>
      Math.abs(point.latitude - first.latitude) < minDelta / 10 &&
      Math.abs(point.longitude - first.longitude) < minDelta / 10,
  );
  if (onOneSpot) {
    map.animateToRegion(
      {
        latitude: first.latitude,
        longitude: first.longitude,
        latitudeDelta: minDelta,
        longitudeDelta: minDelta,
      },
      animated ? 350 : 0,
    );
    return;
  }
  // Google Maps adds edgePadding to the map's own padding; MapKit measures it
  // from the whole view, so there it carries the map padding too.
  const edgePadding =
    Platform.OS === 'android'
      ? margin
      : {
          top: margin.top + mapPadding.top,
          right: margin.right + mapPadding.right,
          bottom: margin.bottom + mapPadding.bottom,
          left: margin.left + mapPadding.left,
        };
  map.fitToCoordinates([...points], { edgePadding, animated });
}
