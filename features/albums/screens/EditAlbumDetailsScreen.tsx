import { ChevronRight, MapPin, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { CityPickerSheet } from '~/components/ui/CityPickerSheet';
import { FatButton, Input, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { AlbumLocation } from '~/types';

import { AlbumDateRangeFields } from '../components/AlbumDateRangeFields';

interface EditAlbumDetailsScreenProps {
  albumId: string;
  onClose: () => void;
}

function placeLabel(location: AlbumLocation): string {
  return [location.placeName, location.placeAdmin, location.countryCode].filter(Boolean).join(', ');
}

export function EditAlbumDetailsScreen({ albumId, onClose }: EditAlbumDetailsScreenProps) {
  const { albums, updateAlbum, setAlbumLocation } = useApp();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  const album = albums.find((a) => a.id === albumId);
  const [name, setName] = useState(album?.name ?? '');
  const [startDate, setStartDate] = useState<string | null>(album?.startDate ?? null);
  const [endDate, setEndDate] = useState<string | null>(album?.endDate ?? null);
  const [location, setLocation] = useState<AlbumLocation | null>(
    album && album.latitude != null && album.longitude != null
      ? {
          latitude: album.latitude,
          longitude: album.longitude,
          placeId: album.placeId,
          placeName: album.placeName ?? '',
          placeAdmin: album.placeAdmin,
          countryCode: album.countryCode,
        }
      : null,
  );
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleSelectLocation = useCallback(
    (next: AlbumLocation) => {
      setLocation(next);
      setAlbumLocation(albumId, next);
    },
    [albumId, setAlbumLocation],
  );

  const handleClearLocation = useCallback(() => {
    setLocation(null);
    setAlbumLocation(albumId, null);
  }, [albumId, setAlbumLocation]);

  const canSave = name.trim().length > 0;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    updateAlbum(albumId, { name: name.trim(), startDate, endDate });
    onClose();
  }, [albumId, canSave, endDate, name, onClose, startDate, updateAlbum]);

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <TabletContentContainer style={{ flex: 1 }}>
        <View className="flex-row items-center gap-2 px-3 py-2">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.close')}
            className="h-9 w-9 items-center justify-center rounded-full border border-border/30 bg-card"
          >
            <X size={18} color={themeColors.textMuted} />
          </Pressable>
          <Text variant="bodyStrong" numberOfLines={1} className="flex-1">
            {I18n.t('albums.edit_details_title')}
          </Text>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Input
            label={I18n.t('albums.name_label')}
            placeholder={I18n.t('albums.name_placeholder')}
            value={name}
            onChangeText={setName}
            style={{ height: 'auto' }}
          />

          <Text variant="label" tone="muted" className="mb-2 mt-5 px-1">
            {I18n.t('albums.dates_optional')}
          </Text>
          <AlbumDateRangeFields
            startDate={startDate}
            endDate={endDate}
            onChangeStart={setStartDate}
            onChangeEnd={setEndDate}
          />

          <Text variant="label" tone="muted" className="mb-2 mt-5 px-1">
            {I18n.t('albums.location.label')}
          </Text>
          <Pressable
            onPress={() => setPickerVisible(true)}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            className="flex-row items-center gap-3 rounded-2xl border border-border/30 bg-card px-4 py-3.5"
          >
            <MapPin size={18} color={location ? themeColors.primary : themeColors.textMuted} />
            <Text
              variant="body"
              numberOfLines={1}
              tone={location ? 'default' : 'muted'}
              className="flex-1"
            >
              {location ? placeLabel(location) : I18n.t('albums.location.add')}
            </Text>
            {location ? (
              <Pressable
                onPress={handleClearLocation}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('albums.location.clear')}
                hitSlop={10}
                className="h-7 w-7 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
              >
                <X size={15} color={themeColors.textMuted} />
              </Pressable>
            ) : (
              <ChevronRight size={18} color={themeColors.textMuted} />
            )}
          </Pressable>
        </ScrollView>

        <CityPickerSheet
          visible={pickerVisible}
          onClose={() => setPickerVisible(false)}
          onSelect={handleSelectLocation}
        />

        <View
          className="border-t border-border/30 bg-background px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <FatButton
            label={I18n.t('common.save')}
            onPress={handleSave}
            disabled={!canSave}
            haptic="success"
          />
        </View>
      </TabletContentContainer>
    </View>
  );
}
