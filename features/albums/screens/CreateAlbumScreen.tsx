import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ChevronRight, ImageIcon, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { FatButton, Input, SettingsHeader, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { deleteAlbumCover, getAlbumCoverUri, saveAlbumCover } from '~/services/userAssets';
import { getErrorMessage } from '~/utils/errorHandling';

import { AlbumDateRangeFields } from '../components/AlbumDateRangeFields';
import { AlbumMonthPicker } from '../components/AlbumMonthPicker';

interface CreateAlbumScreenProps {
  initialTransactionIds?: string[];
  onClose: () => void;
  onCreated: (albumId: string) => void;
}

export function CreateAlbumScreen({
  initialTransactionIds,
  onClose,
  onCreated,
}: CreateAlbumScreenProps) {
  const { createAlbum } = useApp();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialTransactionIds ?? []);
  const [pickerOpen, setPickerOpen] = useState(false);

  const coverUri = useMemo(() => getAlbumCoverUri(coverPath), [coverPath]);
  const canSave = name.trim().length > 0;

  const pickCover = useCallback(async () => {
    void triggerHaptic('selection');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(I18n.t('albums.cover_permission_title'), I18n.t('albums.cover_permission_body'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    try {
      const previous = coverPath;
      const relativePath = saveAlbumCover(result.assets[0].uri);
      setCoverPath(relativePath);
      if (previous) deleteAlbumCover(previous);
    } catch (error) {
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
    }
  }, [coverPath]);

  const handleSave = useCallback(() => {
    if (!canSave) return;
    try {
      const albumId = createAlbum({
        name: name.trim(),
        coverPhotoUri: coverPath,
        startDate,
        endDate,
        transactionIds: selectedIds,
      });
      onCreated(albumId);
    } catch (error) {
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
    }
  }, [canSave, coverPath, createAlbum, name, onCreated, selectedIds]);

  if (pickerOpen) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <TabletContentContainer style={{ flex: 1 }}>
          {/* Compact header — keeps the month pager close to the title */}
          <View className="flex-row items-center gap-2 px-3 pb-0.5 pt-1.5">
            <Pressable
              onPress={() => setPickerOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.close')}
              className="h-9 w-9 items-center justify-center rounded-full border border-border/30 bg-card"
            >
              <X size={18} color={themeColors.textMuted} />
            </Pressable>
            <View className="flex-1">
              <Text variant="bodyStrong" numberOfLines={1}>
                {I18n.t('albums.select_transactions')}
              </Text>
              <Text variant="label" tone="muted">
                {I18n.t('albums.transactions_selected', { count: selectedIds.length })}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setPickerOpen(false);
              }}
              accessibilityRole="button"
              className="rounded-full bg-primary px-4 py-2"
            >
              <Text variant="caption" className="text-white">
                {I18n.t('common.done')}
              </Text>
            </Pressable>
          </View>
          <AlbumMonthPicker selectedIds={selectedIds} onChange={setSelectedIds} />
        </TabletContentContainer>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <TabletContentContainer style={{ flex: 1 }}>
        <SettingsHeader title={I18n.t('albums.create_title')} onClose={onClose} />

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Full-bleed cover picker */}
          <Pressable
            onPress={pickCover}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('albums.add_cover')}
            className="overflow-hidden border-b border-border/40 bg-secondary/40"
            style={{ aspectRatio: 3 / 2, width: '100%' }}
          >
            {coverUri ? (
              <Image
                source={{ uri: coverUri }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={120}
              />
            ) : (
              <View className="flex-1 items-center justify-center gap-2">
                <ImageIcon size={30} color={themeColors.textMuted} />
                <Text variant="caption" tone="muted">
                  {I18n.t('albums.add_cover')}
                </Text>
              </View>
            )}
          </Pressable>

          <View className="px-5 pt-5">
            <Input
              label={I18n.t('albums.name_label')}
              placeholder={I18n.t('albums.name_placeholder')}
              value={name}
              onChangeText={setName}
              autoFocus={!initialTransactionIds?.length}
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

            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setPickerOpen(true);
              }}
              accessibilityRole="button"
              className="mt-5 flex-row items-center justify-between rounded-2xl border border-border/40 bg-card px-4 py-3.5"
            >
              <View className="flex-1 pr-3">
                <Text variant="bodyStrong">{I18n.t('albums.select_transactions')}</Text>
                <Text variant="caption" tone="muted" className="mt-0.5">
                  {I18n.t('albums.transactions_selected', { count: selectedIds.length })}
                </Text>
              </View>
              <ChevronRight size={20} color={themeColors.textMuted} />
            </Pressable>
          </View>
        </ScrollView>

        <View
          className="border-t border-border/30 bg-background px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 12) }}
        >
          <FatButton
            label={I18n.t('albums.create')}
            onPress={handleSave}
            disabled={!canSave}
            haptic="success"
          />
        </View>
      </TabletContentContainer>
    </View>
  );
}
