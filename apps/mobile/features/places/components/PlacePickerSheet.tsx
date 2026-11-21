import { History, LocateFixed, Search, Trash2, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useApp, useTransactions } from '~/context/AppContext';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionLocation } from '~/types';
import { runAfterInteractions } from '~/utils/interactions';

import { useCurrentPlace } from '../hooks/useCurrentPlace';
import { placeCategoryIcon } from '../lib/placeIcons';
import {
  distanceMeters,
  formatDistance,
  placeKey,
  recentPlaces,
  toTransactionLocation,
} from '../lib/placeLocation';
import type { PlaceResult } from '../lib/placeTypes';
import { openLocationSettings } from '../services/deviceLocation';
import { isPlaceSearchAvailable, PlaceSearchError, searchPlaces } from '../services/placeSearch';

/** How a place was chosen, for analytics. */
export type PlaceSource = 'current' | 'search' | 'recent';

interface PlacePickerSheetProps {
  visible: boolean;
  /** The transaction's place now, shown with a remove action. */
  current: TransactionLocation | null;
  onClose: () => void;
  onSelect: (location: TransactionLocation, source: PlaceSource) => void;
  onRemove: () => void;
}

// Searching waits for a pause in typing: each search is an Apple Maps call
// from a shared daily allowance.
const SEARCH_DEBOUNCE_MS = 450;
const MIN_QUERY_LENGTH = 2;

type SearchState =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'done'; results: PlaceResult[] }
  | { kind: 'error'; message: string };

function searchErrorMessage(err: unknown): string {
  if (err instanceof PlaceSearchError) {
    if (err.code === 'limit_reached') return I18n.t('locations.search_limit');
    if (err.code === 'rate_limited' || err.code === 'busy') return I18n.t('locations.search_busy');
    if (err.code === 'not_available') return I18n.t('locations.search_unavailable');
  }
  return I18n.t('locations.search_error');
}

/**
 * Where a transaction happened: the phone's current location, a place the
 * user tagged before, or an Apple Maps search (README: Transaction
 * locations). Opened from the editor's location chip.
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
  const insets = useSafeAreaInsets();
  const locale = I18n.locale;
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ kind: 'idle' });
  const requestId = useRef(0);
  const searchAvailable = isPlaceSearchAvailable();

  const here = useCurrentPlace({ active: visible, appUserId: settings.appUserId, locale });
  const near = here.coordinate;
  // Read when a search fires, so a fix that lands while the user types still
  // ranks the results; a new fix alone does not search again.
  const nearRef = useRef(near);
  nearRef.current = near;

  const recents = useMemo(
    () => (visible ? recentPlaces(transactions, { near, limit: 8 }) : []),
    [visible, transactions, near],
  );

  const trimmed = query.trim();
  useEffect(() => {
    if (!visible) return undefined;
    if (trimmed.length < MIN_QUERY_LENGTH || !searchAvailable) {
      requestId.current += 1;
      setSearch({ kind: 'idle' });
      return undefined;
    }
    setSearch({ kind: 'searching' });
    const id = ++requestId.current;
    const handle = setTimeout(() => {
      searchPlaces({ appUserId: settings.appUserId, query: trimmed, near: nearRef.current, locale })
        .then((results) => {
          if (id === requestId.current) setSearch({ kind: 'done', results });
        })
        .catch((err: unknown) => {
          if (id === requestId.current)
            setSearch({ kind: 'error', message: searchErrorMessage(err) });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [trimmed, visible, searchAvailable, settings.appUserId, locale]);

  const handleClose = () => {
    // Blur before the Modal tears down (Sentry MONEY2TIME-6, see CityPickerSheet).
    Keyboard.dismiss();
    setQuery('');
    setSearch({ kind: 'idle' });
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

  const handleCurrentPress = () => {
    if (here.status === 'ready' && here.place) {
      choose(here.place, 'current');
      return;
    }
    void triggerHaptic('selection');
    if (here.status === 'ask') void here.request();
    else if (here.status === 'blocked' || here.status === 'services_off')
      void openLocationSettings();
    else void here.refresh();
  };

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

  const showingSearch = trimmed.length >= MIN_QUERY_LENGTH && searchAvailable;
  const listData: PlaceResult[] = showingSearch
    ? search.kind === 'done'
      ? search.results
      : []
    : recents;
  const currentKey = current
    ? placeKey({ ...current, placeId: current.placeId, placeName: current.placeName })
    : null;

  const header = (
    <View>
      {here.status !== 'unavailable' && !showingSearch ? (
        <Pressable
          onPress={handleCurrentPress}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('locations.current_location')}
          className="mb-4 flex-row items-center gap-3 rounded-2xl bg-secondary/60 px-3 py-3 active:opacity-70"
        >
          <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            {here.status === 'locating' || here.status === 'idle' ? (
              <ActivityIndicator size="small" color={themeColors.primary} />
            ) : (
              <LocateFixed size={20} color={themeColors.primary} />
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
      ) : null}
      {!showingSearch && recents.length > 0 ? (
        <View className="mb-2 flex-row items-center gap-1.5 px-1">
          <History size={14} color={themeColors.textMuted} />
          <Text variant="label" tone="muted">
            {I18n.t('locations.recent_places')}
          </Text>
        </View>
      ) : null}
    </View>
  );

  const empty = (() => {
    if (!showingSearch) {
      return searchAvailable ? undefined : (
        <Text variant="caption" tone="muted" className="px-1 py-4 text-center">
          {I18n.t('locations.search_unavailable')}
        </Text>
      );
    }
    if (search.kind === 'searching' || search.kind === 'idle') {
      return (
        <View className="items-center py-8">
          <ActivityIndicator color={themeColors.primary} />
        </View>
      );
    }
    return (
      <Text variant="body" tone="muted" className="px-1 py-6 text-center">
        {search.kind === 'error' ? search.message : I18n.t('locations.no_results')}
      </Text>
    );
  })();

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

            {searchAvailable ? (
              <View className="px-5 pb-3">
                <View
                  className="flex-row items-center gap-2 rounded-2xl bg-secondary/60 px-3"
                  style={{ height: 44 }}
                >
                  <Search size={16} color={themeColors.textMuted} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder={I18n.t('locations.search_placeholder')}
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
            ) : null}

            <FlatList
              data={listData}
              keyExtractor={(item) => placeKey(item)}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
              ListHeaderComponent={header}
              ListEmptyComponent={empty}
              renderItem={({ item }) => {
                const Icon = placeCategoryIcon(item.category);
                const distance = near ? formatDistance(distanceMeters(near, item), locale) : '';
                const selected = currentKey !== null && placeKey(item) === currentKey;
                return (
                  <Pressable
                    onPress={() => choose(item, showingSearch ? 'search' : 'recent')}
                    accessibilityRole="button"
                    accessibilityLabel={[item.name, item.address].filter(Boolean).join(', ')}
                    style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                    className={
                      selected
                        ? 'mb-1 flex-row items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-3 py-3'
                        : 'mb-1 flex-row items-center gap-3 rounded-2xl bg-secondary/40 px-3 py-3'
                    }
                  >
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-card">
                      <Icon
                        size={18}
                        color={selected ? themeColors.primary : themeColors.textMuted}
                      />
                    </View>
                    <View className="min-w-0 flex-1" {...REPLAY_PRIVATE}>
                      <Text variant="body" numberOfLines={1}>
                        {item.name}
                      </Text>
                      {item.address ? (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {item.address}
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
              }}
              ListFooterComponent={
                <View className="mt-3 gap-3">
                  {current ? (
                    <Pressable
                      onPress={handleRemove}
                      accessibilityRole="button"
                      className="flex-row items-center justify-center gap-2 rounded-2xl border border-border/40 py-3 active:opacity-70"
                    >
                      <Trash2 size={16} color={themeColors.error} />
                      <Text variant="body" className="text-destructive">
                        {I18n.t('locations.remove')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
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
    height: '85%',
  },
});
