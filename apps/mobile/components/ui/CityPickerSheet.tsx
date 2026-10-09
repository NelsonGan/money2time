import { MapPin, Search, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  InteractionManager,
  Keyboard,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useThemeColors } from '~/hooks/useThemeColors';
import { searchCities } from '~/lib/db/citiesDb';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { AlbumLocation, City } from '~/types';

interface CityPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (location: AlbumLocation) => void;
}

const SEARCH_DEBOUNCE_MS = 200;

function cityToLocation(city: City): AlbumLocation {
  return {
    latitude: city.latitude,
    longitude: city.longitude,
    placeId: city.id,
    placeName: city.name,
    placeAdmin: city.admin,
    countryCode: city.countryCode,
  };
}

function citySubtitle(city: City): string {
  return [city.admin, city.countryName].filter(Boolean).join(', ');
}

export function CityPickerSheet({ visible, onClose, onSelect }: CityPickerSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<City[]>([]);
  const [searching, setSearching] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = ++requestId.current;
    const handle = setTimeout(() => {
      void searchCities(trimmed).then((cities) => {
        // Ignore stale responses from superseded keystrokes.
        if (id !== requestId.current) return;
        setResults(cities);
        setSearching(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query, visible]);

  const handleClose = () => {
    // Blur the search field before the native Modal tears down. Dismissing
    // it while the TextInput still has focus can leave a deferred blur
    // event racing the view teardown, crashing with EXC_BAD_ACCESS on iOS
    // (Sentry MONEY2TIME-6).
    Keyboard.dismiss();
    setQuery('');
    setResults([]);
    onClose();
  };

  const handleSelect = (city: City) => {
    void triggerHaptic('selection');
    const location = cityToLocation(city);
    // Close first so the sheet starts dismissing immediately, then defer the
    // selection: onSelect persists the location, which triggers a synchronous
    // refreshAll() in AppContext — running it now would block the close animation.
    handleClose();
    InteractionManager.runAfterInteractions(() => onSelect(location));
  };

  const trimmed = query.trim();

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <View
            className="bg-card rounded-t-[28px] flex-1"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <View className="px-5 pt-5 pb-3 flex-row items-center gap-2">
              <Text variant="subheading" numberOfLines={1} className="shrink">
                {I18n.t('albums.location.picker_title')}
              </Text>
              <View className="flex-1" />
              <Pressable
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.close')}
                hitSlop={8}
                className="h-9 w-9 rounded-full items-center justify-center bg-secondary/50 active:opacity-70"
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
                  onChangeText={setQuery}
                  placeholder={I18n.t('albums.location.search_placeholder')}
                  placeholderTextColor={themeColors.textMuted}
                  autoCorrect={false}
                  autoFocus
                  allowFontScaling={false}
                  style={{ flex: 1, color: themeColors.text, fontSize: 16 }}
                />
                {query.length > 0 ? (
                  <Pressable onPress={() => setQuery('')} hitSlop={8}>
                    <X size={16} color={themeColors.textMuted} />
                  </Pressable>
                ) : null}
              </View>
            </View>

            <FlatList
              data={results}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handleSelect(item)}
                  style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                  className="flex-row items-center gap-3 rounded-2xl bg-secondary/40 px-3 py-3 mb-1"
                >
                  <MapPin size={18} color={themeColors.textMuted} />
                  <View className="flex-1 min-w-0">
                    <Text variant="body" numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {citySubtitle(item)}
                    </Text>
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={
                searching ? (
                  <View className="py-8 items-center">
                    <ActivityIndicator color={themeColors.primary} />
                  </View>
                ) : (
                  <Text variant="body" tone="muted" className="px-1 py-6 text-center">
                    {trimmed
                      ? I18n.t('albums.location.no_results')
                      : I18n.t('albums.location.search_hint')}
                  </Text>
                )
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
    height: '80%',
  },
});
