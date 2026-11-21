import { forwardRef, memo, useImperativeHandle, useRef } from 'react';
import { View } from 'react-native';
import type MapView from 'react-native-maps';
import { Marker, type Region } from 'react-native-maps';

import { useIsFlatIcons } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { cn } from '~/utils';

import { fitMapToPoints, STREET_DELTA } from '../lib/fitMap';
import { placeCategoryIcon } from '../lib/placeIcons';
import { placeKey } from '../lib/placeLocation';
import type { Coordinate, PlaceResult } from '../lib/placeTypes';
import { AppMap } from './AppMap';
import { PlaceIcon } from './PlaceIcon';
import { useBriefTracking } from './SpendingMapPins';

export interface PlacePickerMapHandle {
  /** Centres the map on a point, at street zoom unless `delta` says otherwise. */
  animateTo: (coordinate: Coordinate, delta?: number) => void;
  /** Frames every point (the list's places and where they are near). */
  fitTo: (points: readonly Coordinate[]) => void;
}

interface PlacePickerMapProps {
  initialRegion: Region;
  places: readonly PlaceResult[];
  /** The entry's place now: drawn filled. */
  selectedKey: string | null;
  /** The pin the user tapped: drawn filled and on top. */
  focusedKey: string | null;
  /** Off while dropping a pin, so only the centre pin shows. */
  showPins: boolean;
  showsUserLocation: boolean;
  onPlacePress: (place: PlaceResult) => void;
  onMapPress: () => void;
  onLongPress: (coordinate: Coordinate) => void;
  /** The map came to rest; `byUser` when a finger moved it (not an animation). */
  onRegionSettled: (center: Coordinate, byUser: boolean) => void;
  /** The native map can take camera moves (MapKit ignores them before this). */
  onReady: () => void;
}

const FIT_MARGIN = { top: 56, right: 56, bottom: 56, left: 40 };

interface PinProps {
  place: PlaceResult;
  filled: boolean;
  onPress: (place: PlaceResult) => void;
}

/** A place in the list: a round badge with its category icon. */
const PlaceIconPin = memo(function PlaceIconPinImpl({ place, filled, onPress }: PinProps) {
  const themeColors = useThemeColors();
  const flatIcons = useIsFlatIcons();
  const tracking = useBriefTracking(filled, flatIcons, themeColors.primary, themeColors.card);
  const size = filled ? 42 : 32;
  // Flat: a filled accent disc marks the chosen pin. Clay is never set on a
  // tinted plate, so there it is an accent ring around the white badge.
  const filledDisc = filled && flatIcons;
  return (
    <Marker
      identifier={placeKey(place)}
      coordinate={{ latitude: place.latitude, longitude: place.longitude }}
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={{ x: 0, y: -(size / 2 + 4) }}
      tracksViewChanges={tracking}
      zIndex={filled ? 1000 : 1}
      onPress={(event) => {
        event.stopPropagation();
        onPress(place);
      }}
      accessibilityLabel={place.name}
    >
      <View className="items-center">
        <View
          className={cn(
            'items-center justify-center rounded-full border-2',
            filledDisc
              ? 'border-card bg-primary'
              : filled
                ? 'border-primary bg-card'
                : 'border-card bg-card',
          )}
          style={{
            width: size,
            height: size,
            shadowColor: '#000',
            shadowOpacity: 0.18,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
          }}
        >
          <PlaceIcon
            spec={placeCategoryIcon(place.category)}
            size={filled ? 28 : 22}
            flatSize={filled ? 20 : 15}
            color={filledDisc ? themeColors.card : themeColors.primary}
          />
        </View>
        <View
          style={{
            width: 0,
            height: 0,
            marginTop: -2,
            borderLeftWidth: 5,
            borderRightWidth: 5,
            borderTopWidth: 6,
            borderLeftColor: 'transparent',
            borderRightColor: 'transparent',
            borderTopColor: filled ? themeColors.primary : themeColors.card,
          }}
        />
      </View>
    </Marker>
  );
});

/**
 * The location picker's map (README: Transaction locations): the places in
 * the list as pins, the phone as the system's blue dot. Loaded lazily by
 * `PlacePickerSheet` (react-native-maps is a native module); the sheet draws
 * the buttons, the centre pin and the cards over it.
 */
export const PlacePickerMap = forwardRef<PlacePickerMapHandle, PlacePickerMapProps>(
  function PlacePickerMapImpl(
    {
      initialRegion,
      places,
      selectedKey,
      focusedKey,
      showPins,
      showsUserLocation,
      onPlacePress,
      onMapPress,
      onLongPress,
      onRegionSettled,
      onReady,
    },
    ref,
  ) {
    const mapRef = useRef<MapView>(null);
    // MapKit cannot tell a pan from an animation (`isGesture` is Google-only):
    // a touch on the map marks the next settle as the user's. A camera move
    // the app starts clears it, so a tap that moved nothing (a pin, or the
    // map to close a card) does not make the next framing look like a pan.
    const touchedRef = useRef(false);

    useImperativeHandle(
      ref,
      () => ({
        animateTo: (coordinate, delta = STREET_DELTA) => {
          touchedRef.current = false;
          mapRef.current?.animateToRegion(
            { ...coordinate, latitudeDelta: delta, longitudeDelta: delta },
            350,
          );
        },
        fitTo: (points) => {
          touchedRef.current = false;
          fitMapToPoints(mapRef.current, points, {
            minDelta: STREET_DELTA,
            margin: FIT_MARGIN,
            animated: true,
          });
        },
      }),
      [],
    );

    return (
      <View
        className="flex-1"
        onTouchStart={() => {
          touchedRef.current = true;
        }}
      >
        <AppMap
          ref={mapRef}
          initialRegion={initialRegion}
          showsUserLocation={showsUserLocation}
          onPress={onMapPress}
          onLongPress={(event) => onLongPress(event.nativeEvent.coordinate)}
          onMapReady={onReady}
          onRegionChangeComplete={(region) => {
            const byUser = touchedRef.current;
            touchedRef.current = false;
            onRegionSettled({ latitude: region.latitude, longitude: region.longitude }, byUser);
          }}
        >
          {showPins
            ? places.map((place) => {
                const key = placeKey(place);
                return (
                  <PlaceIconPin
                    key={key}
                    place={place}
                    filled={key === focusedKey || key === selectedKey}
                    onPress={onPlacePress}
                  />
                );
              })
            : null}
        </AppMap>
      </View>
    );
  },
);
