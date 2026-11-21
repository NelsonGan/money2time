import { Image } from 'expo-image';
import { Maximize2 } from 'lucide-react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import type MapView from 'react-native-maps';
import { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { AppMap } from '~/features/places/components/AppMap';
import { regionFor } from '~/features/places/lib/placeLocation';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { runAfterInteractions } from '~/utils/interactions';

import type { AlbumPin } from '../utils';
import { ALBUM_MARKER_SIZE, AlbumMapMarker } from './AlbumMapMarker';

interface AlbumMapViewProps {
  pins: AlbumPin[];
  onSelectAlbum: (albumId: string) => void;
}

// Albums placed in the same city share identical coordinates (the picker snaps
// to a city centroid), so they land on the exact same screen point and overlap.
// We group pins by a coarse coordinate key (~11m grid) to detect those stacks.
const COORD_GRID = 1e4;

function coordKey(pin: AlbumPin): string {
  return `${Math.round(pin.longitude * COORD_GRID)}:${Math.round(pin.latitude * COORD_GRID)}`;
}

// How far each card behind the front one peeks out, and how many show.
const STACK_PEEK_Y = 16;
const STACK_SHIFT_X = 7;
const MAX_STACK_CARDS = 3;
// A whole trip region (one city) when there is a single album.
const SINGLE_PIN_DELTA = 0.6;
const WORLD_REGION = { latitude: 20, longitude: 0, latitudeDelta: 120, longitudeDelta: 160 };

/**
 * Google Maps draws a marker's view as a snapshot, so a marker tracks view
 * changes only until its covers have loaded (or 1.5 s, for albums without
 * one), and again whenever what it shows changes (`key`: its labels, covers
 * and the theme).
 */
function useCoverTracking(key: string): [boolean, () => void] {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 1500);
    return () => clearTimeout(timer);
  }, [key]);
  // Stable, so the memoized cards it is handed to as `onLoad` do not re-render.
  const stop = useCallback(() => setTracking(false), []);
  return [tracking, stop];
}

/** What a card shows, for re-tracking when it changes. */
function pinContentKey(pins: readonly AlbumPin[], theme: string): string {
  return pins
    .map((pin) => [pin.name, pin.spendLabel, pin.monthLabel, pin.coverUri].join('|'))
    .concat(theme)
    .join('||');
}

/** One album on its own: its card, the tail on the point. */
const AlbumMarker = memo(function AlbumMarkerImpl({
  pin,
  onPress,
}: {
  pin: AlbumPin;
  onPress: (pin: AlbumPin) => void;
}) {
  const themeColors = useThemeColors();
  const [tracking, stopTracking] = useCoverTracking(pinContentKey([pin], themeColors.card));
  return (
    <Marker
      identifier={pin.albumId}
      coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
      anchor={{ x: 0.5, y: 1 }}
      centerOffset={Platform.OS === 'ios' ? { x: 0, y: -ALBUM_MARKER_SIZE.height / 2 } : undefined}
      tracksViewChanges={tracking}
      onPress={(event) => {
        event.stopPropagation();
        onPress(pin);
      }}
      accessibilityLabel={pin.name}
    >
      <AlbumMapMarker
        name={pin.name}
        coverUri={pin.coverUri}
        spendLabel={pin.spendLabel}
        monthLabel={pin.monthLabel}
        onLoad={stopTracking}
      />
    </Marker>
  );
});

/**
 * Albums in the same city share a point (the picker snaps to a city centroid).
 * They are one marker: the newest card in front with the others fanned up and
 * right behind it, so the map draws them in a fixed order on both platforms.
 * A tap lists them to choose from.
 */
const AlbumStackMarker = memo(function AlbumStackMarkerImpl({
  pins,
  onPress,
}: {
  pins: AlbumPin[];
  onPress: (pins: AlbumPin[]) => void;
}) {
  const themeColors = useThemeColors();
  const [tracking, stopTracking] = useCoverTracking(pinContentKey(pins, themeColors.card));
  const shown = pins.slice(0, MAX_STACK_CARDS);
  const behind = shown.length - 1;
  const width = ALBUM_MARKER_SIZE.width + behind * STACK_SHIFT_X;
  const height = ALBUM_MARKER_SIZE.height + behind * STACK_PEEK_Y;
  const front = shown[0] as AlbumPin;
  return (
    <Marker
      identifier={`stack:${front.albumId}`}
      coordinate={{ latitude: front.latitude, longitude: front.longitude }}
      // The front card's tail is the point: half a card in from the left, at the bottom.
      anchor={{ x: ALBUM_MARKER_SIZE.width / 2 / width, y: 1 }}
      centerOffset={
        Platform.OS === 'ios'
          ? { x: width / 2 - ALBUM_MARKER_SIZE.width / 2, y: -height / 2 }
          : undefined
      }
      tracksViewChanges={tracking}
      onPress={(event) => {
        event.stopPropagation();
        onPress(pins);
      }}
      accessibilityLabel={pins.map((pin) => pin.name).join(', ')}
    >
      <View style={{ width, height }}>
        {/* Back to front, so the front card draws last. */}
        {shown
          .map((pin, index) => ({ pin, depth: index }))
          .reverse()
          .map(({ pin, depth }) => (
            <View
              key={pin.albumId}
              style={{
                position: 'absolute',
                left: depth * STACK_SHIFT_X,
                top: (behind - depth) * STACK_PEEK_Y,
              }}
            >
              <AlbumMapMarker
                name={pin.name}
                coverUri={pin.coverUri}
                spendLabel={pin.spendLabel}
                monthLabel={pin.monthLabel}
                onLoad={depth === 0 ? stopTracking : undefined}
              />
            </View>
          ))}
        {pins.length > 1 ? (
          <View className="absolute right-0 top-0 h-6 min-w-6 items-center justify-center rounded-full border-2 border-card bg-primary px-1">
            <Text className="text-[11px] font-extrabold leading-3 text-primary-foreground">
              {String(pins.length)}
            </Text>
          </View>
        ) : null}
      </View>
    </Marker>
  );
});

/** The albums at one point, to pick the one to open. */
function AlbumStackSheet({
  pins,
  onClose,
  onSelect,
}: {
  pins: AlbumPin[] | null;
  onClose: () => void;
  onSelect: (albumId: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const sheetColumnStyle = useSheetColumnStyle();
  return (
    <ThemeModal visible={pins !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/40" onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={sheetColumnStyle}>
          <View
            className="rounded-t-[28px] bg-card px-5 pt-5"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            {...REPLAY_PRIVATE}
          >
            <Text variant="subheading" className="mb-3">
              {I18n.t('albums.location.stack_title')}
            </Text>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={{ gap: 6 }}>
              {(pins ?? []).map((pin) => (
                <Pressable
                  key={pin.albumId}
                  onPress={() => {
                    void triggerHaptic('selection');
                    onClose();
                    // Open the album once the sheet has gone, not while it fades.
                    runAfterInteractions(() => onSelect(pin.albumId));
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={pin.name}
                  className="flex-row items-center gap-3 rounded-2xl bg-secondary/40 p-2.5 active:opacity-70"
                >
                  {pin.coverUri ? (
                    <Image
                      source={{ uri: pin.coverUri }}
                      style={{ width: 44, height: 44, borderRadius: 12 }}
                      contentFit="cover"
                    />
                  ) : (
                    <View className="h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
                      <Text variant="bodyStrong" tone="primary">
                        {pin.name.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View className="min-w-0 flex-1">
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {pin.name}
                    </Text>
                    {pin.monthLabel ? (
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {pin.monthLabel}
                      </Text>
                    ) : null}
                  </View>
                  <Text variant="bodyStrong" tone="primary">
                    {pin.spendLabel}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}

export function AlbumMapView({ pins, onSelectAlbum }: AlbumMapViewProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const initialRegion = useMemo(() => {
    if (pins.length === 0) return WORLD_REGION;
    if (pins.length === 1) {
      return {
        latitude: pins[0].latitude,
        longitude: pins[0].longitude,
        latitudeDelta: SINGLE_PIN_DELTA,
        longitudeDelta: SINGLE_PIN_DELTA,
      };
    }
    return regionFor(pins, { padding: 1.6, minDelta: SINGLE_PIN_DELTA }) ?? WORLD_REGION;
  }, [pins]);

  // Group co-located pins; the first in the albums list is the front card.
  const stacks = useMemo(() => {
    const groups: Record<string, AlbumPin[]> = {};
    for (const pin of pins) {
      const key = coordKey(pin);
      (groups[key] ??= []).push(pin);
    }
    return groups;
  }, [pins]);

  const [stackSheet, setStackSheet] = useState<AlbumPin[] | null>(null);

  const handlePinPress = useCallback(
    (pin: AlbumPin) => {
      void triggerHaptic('selection');
      onSelectAlbum(pin.albumId);
    },
    [onSelectAlbum],
  );
  const handleStackPress = useCallback((group: AlbumPin[]) => {
    void triggerHaptic('selection');
    setStackSheet(group);
  }, []);

  const markers = useMemo(
    () =>
      Object.values(stacks).map((group) =>
        group.length > 1 ? (
          <AlbumStackMarker
            key={`stack:${group.map((pin) => pin.albumId).join(',')}`}
            pins={group}
            onPress={handleStackPress}
          />
        ) : (
          <AlbumMarker
            key={group[0]?.albumId}
            pin={group[0] as AlbumPin}
            onPress={handlePinPress}
          />
        ),
      ),
    [stacks, handlePinPress, handleStackPress],
  );

  const fitAll = useCallback(() => {
    void triggerHaptic('selection');
    if (pins.length === 1) {
      mapRef.current?.animateToRegion(initialRegion, 350);
      return;
    }
    mapRef.current?.fitToCoordinates(pins, {
      edgePadding: { top: 220, right: 80, bottom: 160, left: 80 },
      animated: true,
    });
  }, [pins, initialRegion]);

  return (
    // Where the user's albums are is their location history.
    <View className="flex-1" {...REPLAY_PRIVATE}>
      <AppMap ref={mapRef} initialRegion={initialRegion}>
        {markers}
      </AppMap>
      {pins.length > 0 ? (
        <Pressable
          onPress={fitAll}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('locations.map_fit')}
          className="absolute right-4 h-11 w-11 items-center justify-center rounded-full border border-border/40 bg-card shadow-soft active:opacity-80"
          style={{ bottom: Math.max(insets.bottom, 16) + 96 }}
        >
          <Maximize2 size={18} color={themeColors.text} />
        </Pressable>
      ) : null}
      <AlbumStackSheet
        pins={stackSheet}
        onClose={() => setStackSheet(null)}
        onSelect={onSelectAlbum}
      />
    </View>
  );
}
