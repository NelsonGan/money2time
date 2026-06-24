import { X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { FatButton, Input, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

import { AlbumDateRangeFields } from '../components/AlbumDateRangeFields';

interface EditAlbumDetailsScreenProps {
  albumId: string;
  onClose: () => void;
}

export function EditAlbumDetailsScreen({ albumId, onClose }: EditAlbumDetailsScreenProps) {
  const { albums, updateAlbum } = useApp();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  const album = albums.find((a) => a.id === albumId);
  const [name, setName] = useState(album?.name ?? '');
  const [startDate, setStartDate] = useState<string | null>(album?.startDate ?? null);
  const [endDate, setEndDate] = useState<string | null>(album?.endDate ?? null);

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
        </ScrollView>

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
