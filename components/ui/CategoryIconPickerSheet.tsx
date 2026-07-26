import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, Lock, Search, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { SettingsHeader } from '~/components/ui/settings';
import { Text } from '~/components/ui/text';
import {
  CATEGORY_ICONS_BY_GROUP,
  type CategoryIconMeta,
  EMOJI_VALUE_PREFIX,
  searchCategoryIcons,
} from '~/constants/categoryIcons';
import { spacing } from '~/constants/designSystem';
import type { EmojiMeta } from '~/constants/emojiCatalog.generated';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import {
  deleteCustomLogo,
  listCustomCategoryIcons,
  saveCustomCategoryIcon,
} from '~/services/userAssets';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';

interface CategoryIconPickerSheetProps {
  /** Dismisses the screen (pops the root stack back to the editor). */
  onClose: () => void;
  /** Current stored value, in the grammar in constants/categoryIcons.ts. */
  selectedValue: string | null;
  /** Receives the new value, or null when the user clears the icon. */
  onSelect: (value: string | null) => void;
  title?: string;
}

type PickerTab = 'icons' | 'emoji' | 'uploads';

// The library grid drops name captions, so it packs tighter than the uploads
// grid, which still needs room for the "Upload" call to action.
const ICON_COLUMNS = 6;
const UPLOAD_COLUMNS = 4;
const EMOJI_COLUMNS = 8;
const ICON_SIZE = 38;
const UPLOAD_ITEM_ID = '__upload__';
// Extra scroll band so the last row clears the home indicator (this screen
// drops the bottom safe-area edge, so nothing else does).
const GRID_BOTTOM_PADDING = spacing.xl + 40;
const EMOJI_HEADER_HEIGHT = 34;
const EMOJI_ROW_HEIGHT = 52;

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    height: 48,
  },
  searchInput: { flex: 1, fontSize: 15, padding: 0 },
  searchBar: {
    // paddingBottom is set dynamically per keyboard state in the animated style.
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flexOne: { flex: 1 },
  gridContent: { paddingBottom: spacing.xl, paddingTop: spacing.sm },
  iconCell: {
    flex: 1 / ICON_COLUMNS,
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  uploadCell: {
    flex: 1 / UPLOAD_COLUMNS,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    gap: 6,
  },
  iconWrap: { borderRadius: 14, borderWidth: 2, padding: 3 },
  uploadWrap: { borderRadius: 18, borderWidth: 2, padding: 4 },
  deleteBadge: {
    position: 'absolute',
    top: -2,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadTile: {
    width: 52,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: { height: EMOJI_HEADER_HEIGHT, justifyContent: 'flex-end', paddingBottom: 6 },
  emojiRow: { flexDirection: 'row', height: EMOJI_ROW_HEIGHT },
  emojiCell: { flex: 1 / EMOJI_COLUMNS, alignItems: 'center', justifyContent: 'center' },
  emojiGlyph: { fontSize: 27, lineHeight: 34 },
});

/**
 * A sectioned grid cannot be expressed with `numColumns` (SectionList and
 * numColumns do not compose), so sections are flattened into fixed-height rows
 * up front. That also lets the emoji list supply `getItemLayout`, which is what
 * keeps a ~1,900-glyph list scrolling smoothly.
 */
type GridRow<T> =
  | { type: 'header'; key: string; label: string }
  | { type: 'row'; key: string; items: T[] };

function toRows<T>(
  sections: { group: string; items: T[] }[],
  columns: number,
  keyOf: (item: T) => string,
): GridRow<T>[] {
  const rows: GridRow<T>[] = [];
  for (const section of sections) {
    if (section.items.length === 0) continue;
    rows.push({
      type: 'header',
      key: `h-${section.group}`,
      label: I18n.t(`category_icon.group_${section.group}`),
    });
    for (let index = 0; index < section.items.length; index += columns) {
      const items = section.items.slice(index, index + columns);
      rows.push({ type: 'row', key: `r-${section.group}-${keyOf(items[0])}`, items });
    }
  }
  return rows;
}

function chunk<T>(items: T[], columns: number, keyOf: (item: T) => string): GridRow<T>[] {
  const rows: GridRow<T>[] = [];
  for (let index = 0; index < items.length; index += columns) {
    const slice = items.slice(index, index + columns);
    rows.push({ type: 'row', key: `r-${keyOf(slice[0])}`, items: slice });
  }
  return rows;
}

export function CategoryIconPickerSheet({
  onClose,
  selectedValue,
  onSelect,
  title,
}: CategoryIconPickerSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { isPro, requirePro } = useProGate();
  const [tab, setTab] = useState<PickerTab>('icons');
  const [query, setQuery] = useState('');
  const [customIcons, setCustomIcons] = useState<{ id: string; uri: string }[]>([]);
  // ~110 KB of catalog. The picker is its only consumer, so keep it off the
  // cold-start parse budget and pull it in when the Emoji tab is first opened.
  const [emojiModule, setEmojiModule] = useState<typeof import('~/constants/emojiCatalog') | null>(
    null,
  );

  // The app is edge-to-edge on both platforms, so the keyboard overlays content
  // rather than resizing the window. Lift the sticky search bar by the live
  // keyboard frame (react-native-keyboard-controller tracks the true inset,
  // which the JS Keyboard events under-report on edge-to-edge Android).
  const keyboard = useReanimatedKeyboardAnimation();
  const searchBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboard.height.value }],
    paddingBottom: spacing.sm + insets.bottom * (1 - keyboard.progress.value),
  }));

  const refreshCustomIcons = useCallback(() => {
    setCustomIcons(listCustomCategoryIcons());
  }, []);

  useEffect(() => {
    refreshCustomIcons();
  }, [refreshCustomIcons]);

  useEffect(() => {
    if (tab !== 'emoji' || emojiModule) return;
    let cancelled = false;
    void import('~/constants/emojiCatalog').then((module) => {
      if (!cancelled) setEmojiModule(module);
    });
    return () => {
      cancelled = true;
    };
  }, [tab, emojiModule]);

  const pick = useCallback(
    (value: string | null) => {
      void triggerHaptic('selection');
      onSelect(value);
      onClose();
    },
    [onClose, onSelect],
  );

  const handleUpload = useCallback(async () => {
    void triggerHaptic('selection');
    // Pro-only, with no free allowance. The paywall pushes onto the root stack
    // over this screen, so back returns here rather than to a half-dismissed
    // editor.
    if (!requirePro('custom_category_icons')) return;

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        I18n.t('accounts.logo.permission_title'),
        I18n.t('accounts.logo.permission_message'),
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // No forced square crop — keep the user's full image (shown with `contain`).
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    try {
      saveCustomCategoryIcon(result.assets[0].uri);
      refreshCustomIcons();
    } catch {
      Alert.alert(I18n.t('accounts.logo.upload_failed'));
    }
  }, [refreshCustomIcons, requirePro]);

  const handleDeleteCustom = useCallback(
    (iconId: string) => {
      void triggerHaptic('warning');
      Alert.alert(I18n.t('accounts.logo.delete_title'), I18n.t('accounts.logo.delete_message'), [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteCustomLogo(iconId);
            if (iconId === selectedValue) onSelect(null);
            refreshCustomIcons();
          },
        },
      ]);
    },
    [onSelect, refreshCustomIcons, selectedValue],
  );

  const iconRows = useMemo<GridRow<CategoryIconMeta>[]>(() => {
    if (query.trim()) {
      return chunk(searchCategoryIcons(query), ICON_COLUMNS, (icon) => icon.id);
    }
    return toRows(
      CATEGORY_ICONS_BY_GROUP.map((section) => ({ group: section.group, items: section.icons })),
      ICON_COLUMNS,
      (icon) => icon.id,
    );
  }, [query]);

  const emojiRows = useMemo<GridRow<EmojiMeta>[]>(() => {
    if (!emojiModule) return [];
    if (query.trim()) {
      return chunk(emojiModule.searchEmoji(query), EMOJI_COLUMNS, (entry) => entry.e);
    }
    return toRows(
      emojiModule.EMOJI_BY_GROUP.map((section) => ({ group: section.group, items: section.emoji })),
      EMOJI_COLUMNS,
      (entry) => entry.e,
    );
  }, [emojiModule, query]);

  const renderSectionHeader = (label: string) => (
    <View style={styles.sectionHeader}>
      <Text variant="caption" tone="muted" className="uppercase tracking-wide">
        {label}
      </Text>
    </View>
  );

  const searchBar = (placeholder: string) => (
    <Animated.View
      className="px-5 bg-background"
      style={[styles.searchBar, { borderTopColor: themeColors.border }, searchBarAnimatedStyle]}
    >
      <View
        style={[
          styles.searchRow,
          {
            borderColor: themeColors.border,
            backgroundColor: withColorAlpha(themeColors.primary, 0.05),
          },
        ]}
      >
        <Search size={16} color={themeColors.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: themeColors.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={themeColors.textMuted}
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            hitSlop={8}
            accessibilityLabel={I18n.t('common.clear')}
          >
            <X size={16} color={themeColors.textMuted} />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1">
        <SettingsHeader
          className="px-5 pt-5 pb-2"
          title={title ?? I18n.t('category_icon.choose_title')}
          onBack={onClose}
        />

        {/* Tabs sit on their own row below the centered title so they don't
            compete with it for the header's side slots. */}
        <View className="flex-row px-5 pb-3" style={{ gap: spacing.lg }}>
          {(
            [
              { value: 'icons', label: I18n.t('category_icon.tab_icons') },
              { value: 'emoji', label: I18n.t('category_icon.tab_emoji') },
              { value: 'uploads', label: I18n.t('category_icon.tab_uploads') },
            ] as const
          ).map((option) => {
            const active = tab === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  void triggerHaptic('selection');
                  setTab(option.value);
                  setQuery('');
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text
                  variant="bodyStrong"
                  className={cn(active ? 'text-primary' : 'text-muted-foreground')}
                >
                  {option.label}
                </Text>
                <View
                  className="h-0.5 mt-1 rounded-full"
                  style={{ backgroundColor: active ? themeColors.primary : 'transparent' }}
                />
              </Pressable>
            );
          })}
        </View>

        {tab === 'uploads' ? (
          <FlatList
            key="uploads-grid"
            data={[{ id: UPLOAD_ITEM_ID, uri: '' }, ...customIcons]}
            numColumns={UPLOAD_COLUMNS}
            keyExtractor={(item) => item.id}
            style={styles.flexOne}
            contentContainerStyle={[
              styles.gridContent,
              { paddingHorizontal: 12, paddingBottom: GRID_BOTTOM_PADDING },
            ]}
            ListHeaderComponent={
              isPro ? null : (
                <View className="px-2 pb-2">
                  <Text variant="caption" tone="muted">
                    {I18n.t('category_icon.upload_pro_hint')}
                  </Text>
                </View>
              )
            }
            renderItem={({ item }) => {
              if (item.id === UPLOAD_ITEM_ID) {
                // Always shown, even for free users: the locked tile is the
                // discovery surface for the feature. Tapping opens the paywall.
                return (
                  <Pressable
                    style={styles.uploadCell}
                    onPress={handleUpload}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t(
                      isPro ? 'category_icon.upload' : 'category_icon.upload_pro',
                    )}
                  >
                    <View style={styles.uploadWrap}>
                      <View
                        style={[
                          styles.uploadTile,
                          {
                            borderColor: themeColors.primary,
                            backgroundColor: withColorAlpha(themeColors.primary, 0.06),
                          },
                        ]}
                      >
                        {isPro ? (
                          <ImagePlus size={22} color={themeColors.primary} />
                        ) : (
                          <Lock size={20} color={themeColors.primary} />
                        )}
                      </View>
                    </View>
                    <Text
                      variant="caption"
                      numberOfLines={2}
                      className="text-center text-primary font-medium"
                    >
                      {I18n.t(isPro ? 'category_icon.upload' : 'category_icon.upload_pro')}
                    </Text>
                  </Pressable>
                );
              }
              const selected = item.id === selectedValue;
              return (
                <View style={styles.uploadCell}>
                  <Pressable
                    onPress={() => pick(item.id)}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('category_icon.tab_uploads')}
                    accessibilityState={{ selected }}
                  >
                    <View
                      style={[
                        styles.uploadWrap,
                        {
                          borderColor: selected ? themeColors.primary : 'transparent',
                          backgroundColor: selected
                            ? withColorAlpha(themeColors.primary, 0.1)
                            : 'transparent',
                        },
                      ]}
                    >
                      <CategoryEmoji icon={item.id} size={52} />
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteCustom(item.id)}
                    hitSlop={6}
                    style={[styles.deleteBadge, { backgroundColor: themeColors.error }]}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('common.delete')}
                  >
                    <Trash2 size={12} color="#FFFFFF" />
                  </Pressable>
                </View>
              );
            }}
          />
        ) : tab === 'emoji' ? (
          <View style={styles.flexOne}>
            <FlatList
              key="emoji-grid"
              data={emojiRows}
              keyExtractor={(row) => row.key}
              style={styles.flexOne}
              contentContainerStyle={[
                styles.gridContent,
                { paddingHorizontal: 12, paddingBottom: spacing.md },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              initialNumToRender={12}
              windowSize={9}
              removeClippedSubviews
              getItemLayout={(data, index) => {
                // Rows are fixed-height by construction, so offsets are exact.
                let offset = 0;
                for (let i = 0; i < index; i += 1) {
                  offset += data?.[i]?.type === 'header' ? EMOJI_HEADER_HEIGHT : EMOJI_ROW_HEIGHT;
                }
                const length =
                  data?.[index]?.type === 'header' ? EMOJI_HEADER_HEIGHT : EMOJI_ROW_HEIGHT;
                return { length, offset, index };
              }}
              ListEmptyComponent={
                emojiModule ? (
                  <View className="items-center py-16">
                    <Text tone="muted">{I18n.t('category_icon.no_results')}</Text>
                  </View>
                ) : null
              }
              renderItem={({ item: row }) => {
                if (row.type === 'header') return renderSectionHeader(row.label);
                return (
                  <View style={styles.emojiRow}>
                    {row.items.map((entry) => {
                      const value = `${EMOJI_VALUE_PREFIX}${entry.e}`;
                      const selected = value === selectedValue;
                      return (
                        <Pressable
                          key={entry.e}
                          style={styles.emojiCell}
                          onPress={() => pick(value)}
                          accessibilityRole="button"
                          accessibilityLabel={entry.n}
                          accessibilityState={{ selected }}
                        >
                          <View
                            className="rounded-2xl"
                            style={{
                              borderWidth: 2,
                              borderColor: selected ? themeColors.primary : 'transparent',
                              backgroundColor: selected
                                ? withColorAlpha(themeColors.primary, 0.1)
                                : 'transparent',
                              paddingHorizontal: 2,
                            }}
                          >
                            <Text style={styles.emojiGlyph}>{entry.e}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                    {/* Pad the final row so glyphs stay column-aligned. */}
                    {row.items.length < EMOJI_COLUMNS
                      ? Array.from({ length: EMOJI_COLUMNS - row.items.length }, (_, index) => (
                          <View key={`pad-${index}`} style={styles.emojiCell} />
                        ))
                      : null}
                  </View>
                );
              }}
            />
            {searchBar(I18n.t('category_icon.search_emoji'))}
          </View>
        ) : (
          <View style={styles.flexOne}>
            <FlatList
              key="icons-grid"
              data={iconRows}
              keyExtractor={(row) => row.key}
              style={styles.flexOne}
              contentContainerStyle={[
                styles.gridContent,
                { paddingHorizontal: 12, paddingBottom: spacing.md },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              initialNumToRender={8}
              windowSize={7}
              removeClippedSubviews
              ListHeaderComponent={
                // "None" leads the list, matching where the clear chip sat in
                // the inline grids this replaces.
                query.trim() ? null : (
                  <Pressable
                    onPress={() => pick(null)}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('category_icon.none')}
                    accessibilityState={{ selected: !selectedValue }}
                    className={cn(
                      'mx-2 mb-2 h-11 items-center justify-center rounded-full border',
                      !selectedValue
                        ? 'border-primary/50 bg-primary/15'
                        : 'border-border/40 bg-secondary/20',
                    )}
                  >
                    <Text
                      variant="caption"
                      className={cn(!selectedValue ? 'text-primary' : 'text-muted-foreground')}
                    >
                      {I18n.t('category_icon.none')}
                    </Text>
                  </Pressable>
                )
              }
              ListEmptyComponent={
                <View className="items-center py-16">
                  <Text tone="muted">{I18n.t('category_icon.no_results')}</Text>
                </View>
              }
              renderItem={({ item: row }) => {
                if (row.type === 'header') {
                  return <View className="px-2">{renderSectionHeader(row.label)}</View>;
                }
                return (
                  <View className="flex-row">
                    {row.items.map((icon) => {
                      const selected = icon.id === selectedValue;
                      return (
                        <Pressable
                          key={icon.id}
                          style={styles.iconCell}
                          onPress={() => pick(icon.id)}
                          accessibilityRole="button"
                          // The name is the only thing identifying the artwork
                          // now that captions are gone, so it has to live here.
                          accessibilityLabel={icon.name}
                          accessibilityState={{ selected }}
                        >
                          <View
                            style={[
                              styles.iconWrap,
                              {
                                borderColor: selected ? themeColors.primary : 'transparent',
                                backgroundColor: selected
                                  ? withColorAlpha(themeColors.primary, 0.1)
                                  : 'transparent',
                              },
                            ]}
                          >
                            <CategoryEmoji icon={icon.id} size={ICON_SIZE} />
                          </View>
                        </Pressable>
                      );
                    })}
                    {row.items.length < ICON_COLUMNS
                      ? Array.from({ length: ICON_COLUMNS - row.items.length }, (_, index) => (
                          <View key={`pad-${index}`} style={styles.iconCell} />
                        ))
                      : null}
                  </View>
                );
              }}
            />
            {searchBar(I18n.t('category_icon.search_icons'))}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
