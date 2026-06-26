import { Camera, type CameraRef, Map, Marker } from '@maplibre/maplibre-react-native';
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import { Maximize2 } from 'lucide-react-native';
import { useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ColorPalette } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

import type { AlbumPin } from '../utils';
import { AlbumMapMarker } from './AlbumMapMarker';

interface AlbumMapViewProps {
  pins: AlbumPin[];
  onSelectAlbum: (albumId: string) => void;
}

// Sleek, on-brand vector basemap tinted to the active theme. Uses MapLibre's
// open, no-key demotiles vector source (country geometry) — perfect for a trips
// overview. For street-level/offline detail, point the source at a Protomaps
// PMTiles archive and keep the same paint colors.
const DEMOTILES_VECTOR_SOURCE = 'https://demotiles.maplibre.org/tiles/tiles.json';

const DEMOTILES_GLYPHS = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';

function buildThemedMapStyle(c: ColorPalette): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    glyphs: DEMOTILES_GLYPHS,
    sources: {
      basemap: { type: 'vector', url: DEMOTILES_VECTOR_SOURCE },
    },
    layers: [
      // Water / empty space — a soft tint of the theme primary.
      { id: 'background', type: 'background', paint: { 'background-color': c.primarySoft } },
      // Landmasses sit on the app surface color so the map reads as part of the UI.
      {
        id: 'countries-fill',
        type: 'fill',
        source: 'basemap',
        'source-layer': 'countries',
        paint: { 'fill-color': c.card, 'fill-opacity': 0.96 },
      },
      // Borders thicken slightly as you zoom in.
      {
        id: 'countries-outline',
        type: 'line',
        source: 'basemap',
        'source-layer': 'countries',
        paint: {
          'line-color': c.border,
          'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.4, 4, 1.4],
        },
      },
      // Reference geolines (equator, tropics) as subtle dashes.
      {
        id: 'geolines',
        type: 'line',
        source: 'basemap',
        'source-layer': 'geolines',
        paint: {
          'line-color': c.border,
          'line-opacity': 0.5,
          'line-dasharray': [2, 3],
          'line-width': 0.6,
        },
      },
      // Country names: abbreviation when zoomed out, full name when zoomed in,
      // with text size growing by zoom so the map feels alive as you scroll.
      {
        id: 'country-labels',
        type: 'symbol',
        source: 'basemap',
        'source-layer': 'centroids',
        layout: {
          'text-field': ['step', ['zoom'], ['get', 'ABBREV'], 4, ['get', 'NAME']],
          'text-font': ['Open Sans Semibold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 1, 10, 4, 14, 6, 19],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
          'text-max-width': 7,
          'text-padding': 4,
        },
        paint: {
          'text-color': c.text,
          'text-halo-color': c.card,
          'text-halo-width': 1.4,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.65, 3, 1],
        },
      },
      // Geoline names (e.g. "Equator") riding along the line.
      {
        id: 'geoline-labels',
        type: 'symbol',
        source: 'basemap',
        'source-layer': 'geolines',
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Semibold'],
          'text-size': 10,
          'symbol-placement': 'line',
          'text-letter-spacing': 0.05,
        },
        paint: {
          'text-color': c.textMuted,
          'text-halo-color': c.primarySoft,
          'text-halo-width': 1,
        },
      },
    ],
  };
  return style;
}

function boundsOf(pins: AlbumPin[]): [number, number, number, number] {
  const lngs = pins.map((p) => p.longitude);
  const lats = pins.map((p) => p.latitude);
  return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

export function AlbumMapView({ pins, onSelectAlbum }: AlbumMapViewProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraRef>(null);
  const mapStyle = useMemo(() => buildThemedMapStyle(themeColors), [themeColors]);

  const initialViewState = useMemo(() => {
    if (pins.length === 0) return { center: [0, 20] as [number, number], zoom: 1 };
    if (pins.length === 1) {
      return { center: [pins[0].longitude, pins[0].latitude] as [number, number], zoom: 9 };
    }
    return { bounds: boundsOf(pins) };
  }, [pins]);

  const fitAll = () => {
    if (pins.length < 2) return;
    cameraRef.current?.fitBounds(boundsOf(pins), { duration: 600 });
  };

  // Build the markers once per pins/handler change (not on every camera move) so
  // their element identity stays stable and they don't flicker while panning.
  const markers = useMemo(
    () =>
      pins.map((pin) => (
        <Marker
          key={pin.albumId}
          id={pin.albumId}
          lngLat={[pin.longitude, pin.latitude]}
          anchor="bottom"
          onPress={() => onSelectAlbum(pin.albumId)}
        >
          <AlbumMapMarker
            name={pin.name}
            coverUri={pin.coverUri}
            spendLabel={pin.spendLabel}
            onPress={() => onSelectAlbum(pin.albumId)}
          />
        </Marker>
      )),
    [pins, onSelectAlbum],
  );

  return (
    <View className="flex-1">
      <Map style={{ flex: 1 }} mapStyle={mapStyle} logo={false}>
        <Camera ref={cameraRef} initialViewState={initialViewState} />
        {markers}
      </Map>

      {pins.length > 1 ? (
        <Pressable
          onPress={fitAll}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('albums.location.fit_all')}
          className="absolute right-4 h-11 w-11 items-center justify-center rounded-full bg-card border border-border/40 shadow-soft active:opacity-80"
          style={{ top: insets.top + 8 }}
        >
          <Maximize2 size={20} color={themeColors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}
