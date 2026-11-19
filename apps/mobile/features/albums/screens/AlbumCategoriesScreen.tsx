import { GripVertical } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import {
  AddIconButton,
  CategoryEmoji,
  InfoTooltipButton,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  Text,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import type { CategoryIconPickerSession } from '~/features/settings/lib/categoryIconPickerBridge';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { withColorAlpha } from '~/utils/color';
import { FONT } from '~/utils/fonts';

import { useAlbumCategories } from '../hooks/useAlbumCategories';
import {
  type AlbumCategoryDef,
  albumCategoryIcon,
  albumCategoryIconOf,
  albumCategoryIn,
  albumCategoryNameOf,
} from '../lib/albumCategories';
import {
  ALBUM_CATEGORY_OTHER,
  isDefaultAlbumCategoryKey,
  MAX_ALBUM_CATEGORIES,
} from '../lib/groupPlan';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    paddingVertical: spacing.sm + 2,
    paddingLeft: spacing.sm,
    paddingRight: spacing.sm,
    gap: spacing.xs,
  },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 22, textAlign: 'center' },
  name: { flex: 1, minHeight: 40, justifyContent: 'center', paddingLeft: 2 },
  nameText: { fontSize: 15, fontFamily: FONT.bold, fontWeight: '700', letterSpacing: -0.3 },
  handle: { width: 30, height: 36, alignItems: 'center', justifyContent: 'center' },
});

interface AlbumCategoriesScreenProps {
  albumId: string;
  onBack: () => void;
  /** Opens the editor for one of the album's categories, or for a new one. */
  onOpenEditor: (categoryKey?: string) => void;
  onOpenIconPicker: (session: CategoryIconPickerSession) => void;
}

/**
 * A shared album's categories, the same for everyone in it (README: Album
 * members and shared albums > Categories): drag to reorder, tap one to
 * rename it or change its icon, + to add one. Changing them is Pro; every
 * change reaches everyone in the album.
 */
export function AlbumCategoriesScreen({
  albumId,
  onBack,
  onOpenEditor,
  onOpenIconPicker,
}: AlbumCategoriesScreenProps) {
  const { changeAlbumCategories } = useApp();
  const { requirePro } = useProGate();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { contentWidth } = useDeviceLayout();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const categories = useAlbumCategories(albumId);
  // Bumped when a drag is not saved (no Pro, or the album refused it): the
  // list draws again from the saved order instead of keeping the moved row.
  const [listVersion, setListVersion] = useState(0);
  const resetList = useCallback(() => setListVersion((version) => version + 1), []);
  const rowWidth = Math.max(Math.min(contentWidth, 720) - SETTINGS_HORIZONTAL_PADDING * 2, 0);
  const colors = useMemo(
    () => ({
      border: withColorAlpha(themeColors.primary, 0.18),
      faint: withColorAlpha(themeColors.textMuted, 0.55),
    }),
    [themeColors.primary, themeColors.textMuted],
  );

  const handleAdd = useCallback(() => {
    if (!requirePro('album_categories')) return;
    if (categories.length >= MAX_ALBUM_CATEGORIES) {
      Alert.alert(I18n.t('albums.category_list.limit', { count: MAX_ALBUM_CATEGORIES }));
      return;
    }
    onOpenEditor();
  }, [categories.length, onOpenEditor, requirePro]);

  const handleEdit = useCallback(
    (category: AlbumCategoryDef) => {
      if (!requirePro('album_categories')) return;
      void triggerHaptic('selection');
      onOpenEditor(category.key);
    },
    [onOpenEditor, requirePro],
  );

  const handleEditIcon = useCallback(
    (category: AlbumCategoryDef) => {
      if (!requirePro('album_categories')) return;
      void triggerHaptic('selection');
      onOpenIconPicker({
        selectedValue: albumCategoryIconOf(category),
        title: albumCategoryNameOf(category),
        noUploads: true,
        // Saves on pick: there is no Save on this screen.
        onSelect: (next) => {
          const isDefault = isDefaultAlbumCategoryKey(category.key);
          const icon = next || (isDefault ? null : albumCategoryIcon('other'));
          // Only the icon: a rename made meanwhile on another phone stays.
          void changeAlbumCategories(albumId, 'edited', [
            {
              key: category.key,
              icon: isDefault && icon === albumCategoryIcon(category.key) ? null : icon,
            },
          ]);
        },
      });
    },
    [albumId, changeAlbumCategories, onOpenIconPicker, requirePro],
  );

  const handleReorder = useCallback(
    (ordered: readonly AlbumCategoryDef[]) => {
      void changeAlbumCategories(
        albumId,
        'reordered',
        // Only the places: a move never undoes another phone's rename or removal.
        ordered.map((category, index) => ({ key: category.key, sortOrder: index })),
      ).then((saved) => {
        if (!saved) resetList();
      });
    },
    [albumId, changeAlbumCategories, resetList],
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <TabletContentContainer style={{ flex: 1 }}>
        <View style={{ paddingHorizontal: SETTINGS_HORIZONTAL_PADDING }}>
          <SettingsHeader
            className="px-0 pt-5 pb-3"
            onBack={onBack}
            title={I18n.t('albums.category_list.title')}
            rightAccessory={
              <View className="flex-row items-center gap-2">
                <InfoTooltipButton
                  title={I18n.t('albums.category_list.title')}
                  infoTooltip={I18n.t('albums.category_list.info', {
                    other: albumCategoryNameOf(albumCategoryIn(categories, ALBUM_CATEGORY_OTHER)),
                  })}
                />
                <AddIconButton
                  haptic="none"
                  accessibilityLabel={I18n.t('categories.new_category')}
                  onPress={handleAdd}
                />
              </View>
            }
          />
        </View>
        <Animated.ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
            paddingBottom: Math.max(insets.bottom, 16) + 24,
          }}
        >
          <Sortable.Flex
            key={listVersion}
            activeItemScale={1.02}
            activeItemShadowOpacity={0.08}
            customHandle
            dragActivationDelay={0}
            flexDirection="column"
            flexWrap="nowrap"
            gap={spacing.xs}
            inactiveItemOpacity={1}
            onDragEnd={({ fromIndex, order, toIndex }) => {
              if (fromIndex === toIndex) return;
              if (!requirePro('album_categories')) {
                resetList();
                return;
              }
              handleReorder(order([...categories]));
              void triggerHaptic('selection');
            }}
            scrollableRef={scrollRef}
            width="fill"
          >
            {categories.map((category) => {
              const name = albumCategoryNameOf(category);
              return (
                <View
                  key={category.key}
                  style={[
                    styles.row,
                    {
                      width: rowWidth,
                      borderColor: colors.border,
                      backgroundColor: themeColors.card,
                    },
                  ]}
                >
                  <Pressable
                    onPress={() => handleEditIcon(category)}
                    hitSlop={6}
                    style={styles.iconButton}
                    accessibilityRole="button"
                    accessibilityLabel={`${I18n.t('category_icon.choose_title')}: ${name}`}
                  >
                    <CategoryEmoji
                      style={styles.emoji}
                      size={22}
                      icon={albumCategoryIconOf(category)}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => handleEdit(category)}
                    style={styles.name}
                    accessibilityRole="button"
                    accessibilityLabel={name}
                  >
                    <Text style={[styles.nameText, { color: themeColors.text }]} numberOfLines={1}>
                      {name}
                    </Text>
                  </Pressable>
                  <Sortable.Handle>
                    <View
                      accessible
                      accessibilityRole="button"
                      accessibilityLabel={`${I18n.t('common.reorder')} ${name}`}
                      style={styles.handle}
                    >
                      <GripVertical size={16} color={colors.faint} />
                    </View>
                  </Sortable.Handle>
                </View>
              );
            })}
          </Sortable.Flex>
        </Animated.ScrollView>
      </TabletContentContainer>
    </View>
  );
}
