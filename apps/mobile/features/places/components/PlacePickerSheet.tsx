import {
  History,
  LocateFixed,
  type LucideIcon,
  MapPin,
  MapPinned,
  Navigation,
  RotateCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react-native';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppErrorBoundary } from '~/components/feedback/AppErrorBoundary';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { motionDurations } from '~/constants/motion';
import { useApp, useTransactions } from '~/context/AppContext';
import { useIsFlatIcons } from '~/context/ThemeContext';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionLocation } from '~/types';
import { cn } from '~/utils';
import { runAfterInteractions } from '~/utils/interactions';

import { useCurrentPlace } from '../hooks/useCurrentPlace';
import { useNearbyPlaces } from '../hooks/useNearbyPlaces';
import { STREET_DELTA } from '../lib/fitMap';
import { NEARBY_CHIP_ICONS, placeCategoryIcon, type PlaceIconSpec } from '../lib/placeIcons';
import {
  distanceMeters,
  formatDistance,
  locationKey,
  matchPlaces,
  placeKey,
  preferNearResults,
  recentPlaces,
  toTransactionLocation,
} from '../lib/placeLocation';
import type { Coordinate, NearbyCategory, PlaceResult } from '../lib/placeTypes';
import { describeCoordinate, openLocationSettings } from '../services/deviceLocation';
import { PlaceSearchError, searchPlaces } from '../services/placeSearch';
import { PlaceIcon } from './PlaceIcon';
import type { PlacePickerMapHandle } from './PlacePickerMap';

// react-native-maps is a native module: loaded only when the picker opens, and
// a dev client built without it keeps the list (search, nearby, recents).
const PlacePickerMap = lazy(() =>
  import('./PlacePickerMap').then((m) => ({ default: m.PlacePickerMap })),
);

/** How a place was chosen, for analytics. */
export type PlaceSource = 'current' | 'search' | 'recent' | 'nearby' | 'pin';

interface PlacePickerSheetProps {
  visible: boolean;
  /** The transaction's place now, shown with a remove action. */
  current: TransactionLocation | null;
  onClose: () => void;
  onSelect: (location: TransactionLocation, source: PlaceSource) => void;
  onRemove: () => void;
}

// Searching waits for a pause in typing: each search is an Apple Maps call
// from a shared daily allowance. The user's own places match at once.
const MAX_QUERY_LENGTH = 120;
const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 2;
const MAP_HEIGHT = 248;
// Moving the map this far from where the list was found offers "Search this area".
const AREA_MOVED_METERS = 250;
// A dropped pin is named once the map has been still this long.
const PIN_NAME_DEBOUNCE_MS = 400;

const CATEGORY_CHIPS = Object.entries(NEARBY_CHIP_ICONS) as [
  Exclude<NearbyCategory, 'all'>,
  PlaceIconSpec,
][];

type SearchState =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'done'; results: PlaceResult[] }
  | { kind: 'error'; message: string };

type PinState =
  | { kind: 'off' }
  | { kind: 'naming'; center: Coordinate }
  | { kind: 'named'; center: Coordinate; place: PlaceResult | null };

type Row =
  | { kind: 'header'; key: string; label: string; icon: LucideIcon }
  | { kind: 'place'; key: string; place: PlaceResult; source: PlaceSource }
  | { kind: 'status'; key: string; loading: boolean; message?: string };

function searchErrorMessage(err: unknown): string {
  if (err instanceof PlaceSearchError) {
    if (err.code === 'limit_reached') return I18n.t('locations.search_limit');
    if (err.code === 'rate_limited' || err.code === 'busy') return I18n.t('locations.search_busy');
    if (err.code === 'not_available') return I18n.t('locations.search_unavailable');
  }
  return I18n.t('locations.search_error');
}

function locationAsPlace(location: TransactionLocation): PlaceResult {
  return {
    id: location.placeId,
    name: location.placeName,
    address: location.placeAddress ?? '',
    latitude: location.latitude,
    longitude: location.longitude,
    category: location.placeCategory,
    countryCode: null,
  };
}

/** A spot the geocoders could not name: kept, with a generic name. */
function pinnedSpot(center: Coordinate): PlaceResult {
  return {
    id: null,
    name: I18n.t('locations.pinned_location'),
    address: '',
    latitude: center.latitude,
    longitude: center.longitude,
    category: null,
    countryCode: null,
  };
}

function withoutKeys(places: readonly PlaceResult[], keys: ReadonlySet<string>) {
  return places.filter((place) => !keys.has(placeKey(place)));
}

/** Round floating button on the map. */
function MapButton({
  icon: Icon,
  label,
  active = false,
  busy = false,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const themeColors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={4}
      className={cn(
        'h-11 w-11 items-center justify-center rounded-full active:opacity-70',
        active ? 'bg-primary' : 'bg-card',
      )}
      style={styles.floating}
    >
      {busy ? (
        <ActivityIndicator size="small" color={themeColors.primary} />
      ) : (
        <Icon size={19} color={active ? themeColors.card : themeColors.primary} />
      )}
    </Pressable>
  );
}

/**
 * Where a transaction happened (README: Transaction locations): a map with
 * the phone's blue dot and the places around it as pins, a Nearby list with
 * category chips, the phone's current location, places the user tagged
 * before, an Apple Maps search that matches the user's own places as they
 * type, and a pin dropped anywhere on the map. Opened from the editor's
 * location row.
 */
export function PlacePickerSheet({
  visible,
  current,
  onClose,
  onSelect,
  onRemove,
}: PlacePickerSheetProps) {
  const { settings } = useApp();
  const { transactions } = useTransactions();
  const sheetColumnStyle = useSheetColumnStyle();
  const themeColors = useThemeColors();
  const flatIcons = useIsFlatIcons();
  const insets = useSafeAreaInsets();
  const locale = I18n.locale;
  const appUserId = settings.appUserId;
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  const requestId = useRef(0);
  const mapRef = useRef<PlacePickerMapHandle>(null);
  const [category, setCategory] = useState<NearbyCategory>('all');
  // Where the user asked to look ("Search this area"); null follows the default.
  const [areaOrigin, setAreaOrigin] = useState<Coordinate | null>(null);
  // Where the map rests now, once a finger has moved it.
  const [mapCenter, setMapCenter] = useState<Coordinate | null>(null);
  const mapCenterRef = useRef<Coordinate | null>(null);
  const [mapMoved, setMapMoved] = useState(false);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [pin, setPin] = useState<PinState>({ kind: 'off' });
  const [keyboardUp, setKeyboardUp] = useState(false);
  const [initialPoint, setInitialPoint] = useState<Coordinate | null>(null);

  // With Locations off the picker never locates the phone: it shows, changes
  // or removes a place, and search and pins still work.
  const locating = visible && settings.transactionLocationsEnabled;
  const here = useCurrentPlace({ active: locating, appUserId, locale });
  const phone = here.coordinate;
  const currentPlace = useMemo(() => (current ? locationAsPlace(current) : null), [current]);
  const currentKey = current ? locationKey(current) : null;

  // The list and the map look around the entry's own place when it has one
  // (picking the shop next door), else around the phone.
  const defaultOrigin: Coordinate | null = currentPlace ?? phone;
  const origin = areaOrigin ?? defaultOrigin;
  // Search ranks by the same point, read when a search fires: a fix that lands
  // while the user types still ranks the results; a new fix alone does not
  // search again.
  const searchNearRef = useRef(origin);
  searchNearRef.current = origin;
  const [searchArea, setSearchArea] = useState(0);

  const trimmed = query.trim();
  const showingSearch = trimmed.length >= MIN_QUERY_LENGTH;
  const nearby = useNearbyPlaces({
    active: visible && !showingSearch,
    origin,
    category,
    appUserId,
    locale,
  });

  const allRecents = useMemo(
    () => (visible ? recentPlaces(transactions, { near: phone ?? currentPlace, limit: 60 }) : []),
    [visible, transactions, phone, currentPlace],
  );
  const localMatches = useMemo(
    () => (showingSearch ? matchPlaces(allRecents, trimmed) : []),
    [allRecents, showingSearch, trimmed],
  );

  useEffect(() => {
    if (!visible) return undefined;
    if (trimmed.length < MIN_QUERY_LENGTH) {
      requestId.current += 1;
      setSearch({ kind: 'idle' });
      return undefined;
    }
    setSearch({ kind: 'searching' });
    const id = ++requestId.current;
    const handle = setTimeout(() => {
      // The point this search used, even if a fix lands while it runs.
      const near = searchNearRef.current;
      searchPlaces({ appUserId, query: trimmed, near, locale })
        .then((results) => {
          if (id !== requestId.current) return;
          setSearch({ kind: 'done', results: preferNearResults(results, near) });
        })
        .catch((err: unknown) => {
          if (id === requestId.current)
            setSearch({ kind: 'error', message: searchErrorMessage(err) });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [trimmed, visible, appUserId, locale, searchArea]);

  // The map collapses while typing, so the results have the room.
  useEffect(() => {
    if (!visible) return undefined;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const shown = Keyboard.addListener(showEvent, () => setKeyboardUp(true));
    const hidden = Keyboard.addListener(hideEvent, () => setKeyboardUp(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [visible]);

  // The map opens on the first point there is, and keeps it (a new point
  // moves the camera instead of rebuilding the map).
  const firstSearchResult = search.kind === 'done' ? search.results[0] : undefined;
  const firstPoint = currentPlace ?? phone ?? allRecents[0] ?? firstSearchResult ?? null;
  useEffect(() => {
    if (visible && !initialPoint && firstPoint) {
      setInitialPoint({ latitude: firstPoint.latitude, longitude: firstPoint.longitude });
    }
  }, [visible, initialPoint, firstPoint]);

  // Naming a dropped pin: the phone's geocoder first (free), Apple after.
  const pinCenter = pin.kind === 'naming' ? pin.center : null;
  useEffect(() => {
    if (!pinCenter) return undefined;
    let cancelled = false;
    const handle = setTimeout(() => {
      void describeCoordinate(pinCenter, { appUserId, locale }).then((place) => {
        if (!cancelled) setPin({ kind: 'named', center: pinCenter, place });
      });
    }, PIN_NAME_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [pinCenter, appUserId, locale]);

  const resetState = () => {
    setQuery('');
    setSearch({ kind: 'idle' });
    setCategory('all');
    setAreaOrigin(null);
    setMapCenter(null);
    mapCenterRef.current = null;
    setMapMoved(false);
    setFocusedKey(null);
    setPin({ kind: 'off' });
    setKeyboardUp(false);
    setInitialPoint(null);
  };

  const handleClose = () => {
    // Blur before the Modal tears down (Sentry MONEY2TIME-6, see CityPickerSheet).
    Keyboard.dismiss();
    resetState();
    onClose();
  };

  const choose = (place: PlaceResult, source: PlaceSource) => {
    void triggerHaptic('selection');
    const location = toTransactionLocation(place);
    handleClose();
    runAfterInteractions(() => onSelect(location, source));
  };

  const handleRemove = () => {
    void triggerHaptic('selection');
    handleClose();
    runAfterInteractions(onRemove);
  };

  const askForLocation = () => {
    if (here.status === 'ask') void here.request();
    else if (here.status === 'blocked' || here.status === 'services_off')
      void openLocationSettings();
    else void here.refresh();
  };

  const handleCurrentPress = () => {
    if (here.status === 'ready' && here.place) {
      choose(here.place, 'current');
      return;
    }
    void triggerHaptic('selection');
    askForLocation();
  };

  const handleLocateMe = () => {
    void triggerHaptic('selection');
    if (!phone) {
      askForLocation();
      return;
    }
    setFocusedKey(null);
    setAreaOrigin(currentPlace ? phone : null);
    setMapMoved(false);
    mapRef.current?.animateTo(phone);
  };

  const startPin = (center: Coordinate) => {
    Keyboard.dismiss();
    setFocusedKey(null);
    setPin({ kind: 'naming', center });
  };

  const handlePinToggle = () => {
    void triggerHaptic('selection');
    if (pin.kind !== 'off') {
      setPin({ kind: 'off' });
      return;
    }
    const center = mapCenterRef.current ?? origin ?? initialPoint;
    if (center) startPin(center);
  };

  const handleLongPress = (coordinate: Coordinate) => {
    void triggerHaptic('medium');
    startPin(coordinate);
    mapRef.current?.animateTo(coordinate);
  };

  const handleRegionSettled = useCallback(
    (center: Coordinate, byUser: boolean) => {
      mapCenterRef.current = center;
      if (pin.kind !== 'off') {
        // Animations end here too: a pin follows wherever the map rests.
        setPin((previous) => {
          if (previous.kind === 'off') return previous;
          const moved = distanceMeters(previous.center, center) > 3;
          return moved ? { kind: 'naming', center } : previous;
        });
      }
      if (!byUser) return;
      // Tracked while a pin is down too, so "Search this area" searches where
      // the map is once the pin is put away.
      setMapCenter(center);
      setMapMoved(true);
    },
    [pin.kind],
  );

  const handleSearchArea = () => {
    if (!mapCenter) return;
    void triggerHaptic('selection');
    setFocusedKey(null);
    setMapMoved(false);
    setAreaOrigin(mapCenter);
    if (showingSearch) setSearchArea((n) => n + 1);
  };

  const handleCategory = (id: NearbyCategory) => {
    void triggerHaptic('selection');
    setFocusedKey(null);
    // The chip's list is framed, even after a pan.
    setMapMoved(false);
    setCategory((previous) => (previous === id ? 'all' : id));
  };

  // --- What the list and the map show -------------------------------------

  const distanceFrom = phone ?? origin;
  // Closest to where distances are measured from (the phone), so the
  // numbers read in order even when the list was found around another point.
  const nearbyPlaces = useMemo(() => {
    if (nearby.kind !== 'done') return [];
    if (!distanceFrom) return nearby.places;
    return [...nearby.places].sort(
      (a, b) => distanceMeters(distanceFrom, a) - distanceMeters(distanceFrom, b),
    );
  }, [nearby, distanceFrom]);
  const searchResults = search.kind === 'done' ? search.results : [];
  const localKeys = new Set(localMatches.map(placeKey));
  const remoteResults = withoutKeys(searchResults, localKeys);
  const nearbyKeys = new Set(nearbyPlaces.map(placeKey));
  // Recent places that are not in the nearby list already, the closest first.
  const recents = withoutKeys(allRecents, nearbyKeys).slice(0, nearbyPlaces.length > 0 ? 3 : 8);

  const mapPlaces: PlaceResult[] = (() => {
    const list = showingSearch ? [...localMatches, ...remoteResults] : nearbyPlaces;
    if (currentPlace && !list.some((place) => placeKey(place) === currentKey)) {
      return [currentPlace, ...list];
    }
    return list;
  })();
  const sourceByKey = new Map<string, PlaceSource>();
  for (const place of recents) sourceByKey.set(placeKey(place), 'recent');
  for (const place of nearbyPlaces) sourceByKey.set(placeKey(place), 'nearby');
  for (const place of localMatches) sourceByKey.set(placeKey(place), 'recent');
  for (const place of remoteResults) sourceByKey.set(placeKey(place), 'search');
  const focused = focusedKey ? mapPlaces.find((place) => placeKey(place) === focusedKey) : null;

  // Frame the pins whenever a new list arrives (not while dropping a pin).
  const mapPlacesSignature = showingSearch
    ? `s:${search.kind}:${mapPlaces.map(placeKey).join('|')}`
    : `n:${nearby.kind}:${mapPlaces.map(placeKey).join('|')}`;
  const [mapReady, setMapReady] = useState(false);
  const handleMapReady = useCallback(() => setMapReady(true), []);
  // Whether the map is at its full height: a fit measured while it folds
  // away or opens again (the keyboard) zooms to street level on a sliver.
  const [mapOpen, setMapOpen] = useState(false);
  // The list last framed: a list that arrives while the map is folded away
  // (typing) is framed once it is fully open again.
  const framedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapReady || !mapOpen || pin.kind !== 'off') return;
    // A nearby list that changes by itself after the user panned (a late
    // fix) leaves the camera where they put it; "Search this area" stays.
    if (mapMoved && !showingSearch) return;
    if (framedRef.current === mapPlacesSignature) return;
    const points: Coordinate[] = [...mapPlaces];
    if (!showingSearch && origin) points.push(origin);
    if (points.length === 0) return;
    framedRef.current = mapPlacesSignature;
    mapRef.current?.fitTo(points);
    // Only a new list moves the camera, not a re-render (one that arrived
    // while a pin was being dropped is framed once the pin is put away).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, mapOpen, mapPlacesSignature, pin.kind, mapMoved]);
  useEffect(() => {
    if (visible) return;
    setMapReady(false);
    framedRef.current = null;
  }, [visible]);

  const showCurrentRow =
    settings.transactionLocationsEnabled && here.status !== 'unavailable' && !showingSearch;

  const rows: Row[] = [];
  if (showingSearch) {
    if (localMatches.length > 0) {
      rows.push({
        kind: 'header',
        key: 'h-yours',
        label: I18n.t('locations.your_places'),
        icon: History,
      });
      for (const place of localMatches)
        rows.push({ kind: 'place', key: `y-${placeKey(place)}`, place, source: 'recent' });
    }
    if (localMatches.length > 0 || remoteResults.length > 0 || search.kind !== 'done') {
      rows.push({
        kind: 'header',
        key: 'h-results',
        label: I18n.t('locations.search_results'),
        icon: Search,
      });
    }
    if (search.kind === 'searching' || search.kind === 'idle') {
      rows.push({ kind: 'status', key: 's-search', loading: true });
    } else if (search.kind === 'error') {
      rows.push({ kind: 'status', key: 's-search', loading: false, message: search.message });
    } else if (remoteResults.length === 0 && localMatches.length === 0) {
      rows.push({
        kind: 'status',
        key: 's-search',
        loading: false,
        message: I18n.t('locations.no_results'),
      });
    }
    for (const place of remoteResults)
      rows.push({ kind: 'place', key: `r-${placeKey(place)}`, place, source: 'search' });
  } else {
    if (recents.length > 0) {
      rows.push({
        kind: 'header',
        key: 'h-recent',
        label: I18n.t('locations.recent_places'),
        icon: History,
      });
      for (const place of recents)
        rows.push({ kind: 'place', key: `c-${placeKey(place)}`, place, source: 'recent' });
    }
    // An old Worker or no allowance left: the section quietly stays away.
    const nearbyHidden =
      nearby.kind === 'idle' ||
      (nearby.kind === 'error' &&
        (nearby.code === 'not_available' || nearby.code === 'limit_reached'));
    if (!nearbyHidden) {
      rows.push({
        kind: 'header',
        key: 'h-nearby',
        label: I18n.t('locations.nearby'),
        icon: Sparkles,
      });
      if (nearby.kind === 'loading') {
        rows.push({ kind: 'status', key: 's-nearby', loading: true });
      } else if (nearby.kind === 'error') {
        rows.push({
          kind: 'status',
          key: 's-nearby',
          loading: false,
          message: I18n.t('locations.search_error'),
        });
      } else if (nearbyPlaces.length === 0) {
        rows.push({
          kind: 'status',
          key: 's-nearby',
          loading: false,
          message: I18n.t('locations.nearby_empty'),
        });
      }
      for (const place of nearbyPlaces)
        rows.push({ kind: 'place', key: `n-${placeKey(place)}`, place, source: 'nearby' });
    }
  }

  // --- Map card --------------------------------------------------------------

  const mapStyle = useAnimatedStyle(
    () => ({
      height: withTiming(keyboardUp || !initialPoint ? 0 : MAP_HEIGHT, {
        duration: motionDurations.normal,
      }),
      marginBottom: withTiming(keyboardUp || !initialPoint ? 0 : 12, {
        duration: motionDurations.normal,
      }),
    }),
    [keyboardUp, initialPoint],
  );
  const showAreaButton =
    mapMoved &&
    pin.kind === 'off' &&
    !!mapCenter &&
    (() => {
      const from = showingSearch ? searchNearRef.current : origin;
      return !from || distanceMeters(from, mapCenter) > AREA_MOVED_METERS;
    })();
  const pinPlace =
    pin.kind === 'named' ? { ...(pin.place ?? pinnedSpot(pin.center)), ...pin.center } : null;

  const mapCard = initialPoint ? (
    <View className="flex-1 overflow-hidden rounded-3xl bg-secondary/60">
      <AppErrorBoundary fallback={<View className="flex-1 bg-secondary/60" />}>
        <Suspense
          fallback={
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={themeColors.primary} />
            </View>
          }
        >
          <PlacePickerMap
            ref={mapRef}
            onReady={handleMapReady}
            initialRegion={{
              ...initialPoint,
              latitudeDelta: STREET_DELTA,
              longitudeDelta: STREET_DELTA,
            }}
            places={mapPlaces}
            selectedKey={currentKey}
            focusedKey={focusedKey}
            showPins={pin.kind === 'off'}
            showsUserLocation={locating && here.status === 'ready'}
            onPlacePress={(place) => {
              void triggerHaptic('selection');
              setFocusedKey(placeKey(place));
            }}
            onMapPress={() => setFocusedKey(null)}
            onLongPress={handleLongPress}
            onRegionSettled={handleRegionSettled}
          />
        </Suspense>
      </AppErrorBoundary>

      {pin.kind !== 'off' ? (
        // The pin's tip sits on the map's centre.
        <View
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          className="items-center justify-center"
        >
          <View className="items-center" style={{ marginBottom: 34 }}>
            <MapPin
              size={34}
              color={themeColors.primary}
              fill={themeColors.card}
              strokeWidth={2.4}
            />
          </View>
          <View className="absolute h-1.5 w-1.5 rounded-full bg-primary" />
        </View>
      ) : null}

      {showAreaButton ? (
        <View pointerEvents="box-none" className="absolute left-0 right-0 top-3 items-center">
          <Pressable
            onPress={handleSearchArea}
            accessibilityRole="button"
            className="flex-row items-center gap-1.5 rounded-full bg-card px-3.5 py-2 active:opacity-70"
            style={styles.floating}
          >
            <RotateCw size={14} color={themeColors.primary} />
            <Text variant="caption" className="font-semibold text-primary">
              {I18n.t('locations.search_area')}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View pointerEvents="box-none" className="absolute bottom-3 right-3 gap-2">
        {settings.transactionLocationsEnabled && here.status !== 'unavailable' ? (
          <MapButton
            icon={Navigation}
            label={I18n.t('locations.locate_me')}
            busy={here.status === 'locating'}
            onPress={handleLocateMe}
          />
        ) : null}
        <MapButton
          icon={MapPinned}
          label={I18n.t('locations.pin_drop')}
          active={pin.kind !== 'off'}
          onPress={handlePinToggle}
        />
      </View>

      {pin.kind !== 'off' ? (
        <View
          className="absolute bottom-3 left-3 flex-row items-center gap-2 rounded-2xl bg-card py-2 pl-3 pr-2"
          style={[styles.floating, { right: 68 }]}
        >
          <View className="min-w-0 flex-1" {...REPLAY_PRIVATE}>
            {pinPlace ? (
              <>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {pinPlace.name}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {pinPlace.address || I18n.t('locations.pin_drag')}
                </Text>
              </>
            ) : (
              <Text variant="caption" tone="muted" numberOfLines={2}>
                {I18n.t('locations.current_locating')}
              </Text>
            )}
          </View>
          <Pressable
            onPress={() => pinPlace && choose(pinPlace, 'pin')}
            disabled={!pinPlace}
            accessibilityRole="button"
            accessibilityState={{ disabled: !pinPlace }}
            className={cn(
              'rounded-full bg-primary px-3.5 py-2 active:opacity-80',
              !pinPlace && 'opacity-50',
            )}
          >
            <Text variant="caption" className="font-semibold text-primary-foreground">
              {I18n.t('locations.pin_use')}
            </Text>
          </Pressable>
        </View>
      ) : focused ? (
        <View
          className="absolute bottom-3 left-3 flex-row items-center gap-2.5 rounded-2xl bg-card py-2 pl-2.5 pr-2"
          style={[styles.floating, { right: 68 }]}
        >
          <View
            className={cn(
              'h-9 w-9 items-center justify-center rounded-full',
              flatIcons && 'bg-primary/10',
            )}
          >
            <PlaceIcon
              spec={placeCategoryIcon(focused.category)}
              size={30}
              flatSize={17}
              color={themeColors.primary}
            />
          </View>
          <View className="min-w-0 flex-1" {...REPLAY_PRIVATE}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {focused.name}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {[
                distanceFrom ? formatDistance(distanceMeters(distanceFrom, focused), locale) : '',
                focused.address,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>
          <Pressable
            onPress={() =>
              choose(
                focused,
                placeKey(focused) === currentKey
                  ? 'recent'
                  : (sourceByKey.get(placeKey(focused)) ?? 'search'),
              )
            }
            accessibilityRole="button"
            className="rounded-full bg-primary px-3.5 py-2 active:opacity-80"
          >
            <Text variant="caption" className="font-semibold text-primary-foreground">
              {I18n.t('locations.choose')}
            </Text>
          </Pressable>
        </View>
      ) : !mapMoved ? (
        <View
          pointerEvents="none"
          className="absolute bottom-3 left-3 flex-row items-center gap-1.5 rounded-full bg-card px-3 py-1.5"
          style={styles.floating}
        >
          <MapPinned size={13} color={themeColors.textMuted} />
          <Text variant="caption" tone="muted">
            {I18n.t('locations.pin_hint')}
          </Text>
        </View>
      ) : null}
    </View>
  ) : null;

  // --- List ------------------------------------------------------------------

  const currentSubtitle = (() => {
    switch (here.status) {
      case 'ready':
        return [here.place?.name, here.place?.address].filter(Boolean).join(' · ');
      case 'ask':
        return I18n.t('locations.permission_allow');
      case 'blocked':
        return I18n.t('locations.permission_blocked');
      case 'services_off':
        return I18n.t('locations.services_off');
      case 'error':
        return I18n.t('locations.current_unavailable');
      default:
        return I18n.t('locations.current_locating');
    }
  })();

  const header = showCurrentRow ? (
    <Pressable
      onPress={handleCurrentPress}
      accessibilityRole="button"
      accessibilityLabel={I18n.t('locations.current_location')}
      className="mb-2 flex-row items-center gap-3 rounded-2xl py-2 active:opacity-70"
    >
      <View className="h-10 w-10 items-center justify-center rounded-2xl bg-primary">
        {here.status === 'locating' || here.status === 'idle' ? (
          <ActivityIndicator size="small" color={themeColors.card} />
        ) : (
          <LocateFixed size={20} color={themeColors.card} />
        )}
      </View>
      <View className="min-w-0 flex-1">
        <Text variant="bodyStrong" numberOfLines={1}>
          {I18n.t('locations.current_location')}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={2} {...REPLAY_PRIVATE}>
          {currentSubtitle}
        </Text>
      </View>
    </Pressable>
  ) : undefined;

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'header') {
      const Icon = item.icon;
      return (
        <View className="mb-1 mt-3 flex-row items-center gap-1.5">
          <Icon size={13} color={themeColors.textMuted} />
          <Text variant="label" tone="muted">
            {item.label}
          </Text>
        </View>
      );
    }
    if (item.kind === 'status') {
      return item.loading ? (
        <View className="items-center py-6">
          <ActivityIndicator color={themeColors.primary} />
        </View>
      ) : (
        <Text variant="body" tone="muted" className="py-5 text-center">
          {item.message}
        </Text>
      );
    }
    const { place, source } = item;
    const distance = distanceFrom
      ? formatDistance(distanceMeters(distanceFrom, place), locale)
      : '';
    const selected = currentKey !== null && placeKey(place) === currentKey;
    return (
      <Pressable
        onPress={() => choose(place, source)}
        onLongPress={() => {
          void triggerHaptic('selection');
          // The keyboard going down would frame the whole list over this row.
          framedRef.current = mapPlacesSignature;
          Keyboard.dismiss();
          setFocusedKey(placeKey(place));
          mapRef.current?.animateTo(place);
        }}
        accessibilityRole="button"
        accessibilityLabel={[place.name, place.address].filter(Boolean).join(', ')}
        accessibilityState={{ selected }}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        className={cn(
          'flex-row items-center gap-3 rounded-2xl py-2.5',
          selected && '-mx-2 border border-primary/30 bg-primary/10 px-2',
        )}
      >
        <View
          className={cn(
            'h-10 w-10 items-center justify-center rounded-full',
            flatIcons && 'bg-primary/10',
          )}
        >
          <PlaceIcon
            spec={placeCategoryIcon(place.category)}
            size={32}
            flatSize={18}
            color={themeColors.primary}
          />
        </View>
        <View className="min-w-0 flex-1" {...REPLAY_PRIVATE}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {place.name}
          </Text>
          {place.address ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {place.address}
            </Text>
          ) : null}
        </View>
        {distance ? (
          <Text variant="caption" tone="muted">
            {distance}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={[styles.sheet, sheetColumnStyle]}>
          <View
            className="flex-1 rounded-t-[28px] bg-card"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <View className="flex-row items-center gap-2 px-5 pb-3 pt-5">
              <Text variant="subheading" numberOfLines={1} className="shrink">
                {I18n.t('locations.picker_title')}
              </Text>
              <View className="flex-1" />
              <Pressable
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.close')}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full bg-secondary/50 active:opacity-70"
              >
                <X size={18} color={themeColors.textMuted} />
              </Pressable>
            </View>

            <View className="px-5 pb-3">
              <View
                className="flex-row items-center gap-2 rounded-2xl bg-secondary/60 px-3"
                style={{ height: 44 }}
              >
                <Search size={16} color={themeColors.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={(text) => {
                    setQuery(text);
                    setFocusedKey(null);
                  }}
                  placeholder={I18n.t('locations.search_placeholder')}
                  // The Worker refuses a longer query (query_too_long).
                  maxLength={MAX_QUERY_LENGTH}
                  placeholderTextColor={themeColors.textMuted}
                  autoCorrect={false}
                  returnKeyType="search"
                  allowFontScaling={false}
                  accessibilityLabel={I18n.t('locations.search_placeholder')}
                  style={{ flex: 1, color: themeColors.text, fontSize: 16 }}
                  {...REPLAY_PRIVATE}
                />
                {query.length > 0 ? (
                  <Pressable
                    onPress={() => setQuery('')}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('common.clear')}
                  >
                    <X size={16} color={themeColors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            {!showingSearch && origin ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                className="mb-3"
                // A horizontal ScrollView shrinks by default when the sheet overflows.
                style={{ flexGrow: 0, flexShrink: 0 }}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
              >
                {CATEGORY_CHIPS.map(([id, spec]) => {
                  const active = category === id;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => handleCategory(id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      className={cn(
                        'flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 active:opacity-70',
                        active ? 'border-primary bg-primary' : 'border-border/60 bg-card',
                      )}
                    >
                      <PlaceIcon
                        spec={spec}
                        size={18}
                        flatSize={14}
                        color={active ? themeColors.card : themeColors.primary}
                      />
                      <Text
                        variant="caption"
                        className={cn(
                          'font-semibold',
                          active ? 'text-primary-foreground' : 'text-foreground',
                        )}
                      >
                        {I18n.t(`locations.category_${id}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}

            <Animated.View
              className="mx-5"
              style={mapStyle}
              onLayout={(event) => setMapOpen(event.nativeEvent.layout.height >= MAP_HEIGHT - 1)}
            >
              {mapCard}
            </Animated.View>

            <FlatList
              data={rows}
              keyExtractor={(item) => item.key}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
              ListHeaderComponent={header}
              renderItem={renderRow}
              ListFooterComponent={
                current ? (
                  <Pressable
                    onPress={handleRemove}
                    accessibilityRole="button"
                    className="mt-4 flex-row items-center justify-center gap-2 rounded-2xl border border-border/40 py-3 active:opacity-70"
                  >
                    <Trash2 size={16} color={themeColors.error} />
                    <Text variant="body" className="text-destructive">
                      {I18n.t('locations.remove')}
                    </Text>
                  </Pressable>
                ) : undefined
              }
            />
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    height: '92%',
  },
  // Lifts the map's buttons and cards off the tiles.
  floating: {
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
});
