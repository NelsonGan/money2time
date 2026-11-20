import { forwardRef, type ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import MapView, {
  type EdgePadding,
  type MapPressEvent,
  type MapStyleElement,
  PROVIDER_DEFAULT,
  PROVIDER_GOOGLE,
  type Region,
} from 'react-native-maps';

import { useResolvedTheme } from '~/context/ThemeContext';

interface AppMapProps {
  initialRegion?: Region;
  mapPadding?: EdgePadding;
  onRegionChangeComplete?: (region: Region) => void;
  onPress?: (event: MapPressEvent) => void;
  onMapReady?: () => void;
  children?: ReactNode;
}

// Google's map on Android, muted so the app's pins carry the colour; the
// default Apple map on iOS follows the app's light or dark mode by itself.
const ANDROID_LIGHT: MapStyleElement[] = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'geometry', stylers: [{ saturation: -35 }, { lightness: 8 }] },
];

const ANDROID_DARK: MapStyleElement[] = [
  { elementType: 'geometry', stylers: [{ color: '#242424' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9a9a9a' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a1a' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#383838' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#14202b' }] },
];

/**
 * The app's one map: Apple Maps on iOS (no key), Google Maps on Android (the
 * Maps SDK key in app.config.ts), both from react-native-maps. A native
 * module, so screens load it lazily behind an error boundary.
 */
export const AppMap = forwardRef<MapView, AppMapProps>(function AppMapImpl(
  { initialRegion, mapPadding, onRegionChangeComplete, onPress, onMapReady, children },
  ref,
) {
  const dark = useResolvedTheme() === 'dark';
  return (
    <MapView
      ref={ref}
      style={StyleSheet.absoluteFill}
      provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT}
      initialRegion={initialRegion}
      mapPadding={mapPadding}
      userInterfaceStyle={dark ? 'dark' : 'light'}
      customMapStyle={Platform.OS === 'android' ? (dark ? ANDROID_DARK : ANDROID_LIGHT) : undefined}
      showsCompass={false}
      showsScale={false}
      showsBuildings={false}
      showsTraffic={false}
      showsIndoors={false}
      showsMyLocationButton={false}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
      moveOnMarkerPress={false}
      onRegionChangeComplete={onRegionChangeComplete}
      onPress={onPress}
      onMapReady={onMapReady}
    >
      {children}
    </MapView>
  );
});
