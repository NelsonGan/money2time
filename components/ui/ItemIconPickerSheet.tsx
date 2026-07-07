import * as ImagePicker from 'expo-image-picker';
import { ImagePlus, Search, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ItemIcon } from '~/components/ui/ItemIcon';
import { SettingsHeader } from '~/components/ui/settings';
import { Text } from '~/components/ui/text';
import { spacing } from '~/constants/designSystem';
import { type ItemIconMeta, searchItemIcons } from '~/constants/itemIcons';
import { useKeyboardHeight } from '~/hooks/useKeyboardHeight';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { deleteCustomLogo, listCustomItemIcons, saveCustomItemIcon } from '~/services/userAssets';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';

interface ItemIconPickerSheetProps {
  /** Dismisses the screen (pops the root stack back to the editor). */
  onClose: () => void;
  selectedIconId: string | null;
  /** Receives the new icon id, or null when the user clears the icon. */
  onSelect: (iconId: string | null) => void;
}

const NUM_COLUMNS = 4;
const UPLOAD_ITEM_ID = '__upload__';
// Extra scroll band so the last row of the custom grid clears the home
// indicator (SafeAreaView already reserves the bottom inset on top of this).
const GRID_BOTTOM_PADDING = spacing.xl + 40;

type PickerTab = 'library' | 'custom';

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
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  searchBar: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  flexOne: {
    flex: 1,
  },
  gridContent: {
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  cell: {
    flex: 1 / NUM_COLUMNS,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    gap: 6,
  },
  iconWrap: {
    borderRadius: 18,
    borderWidth: 2,
    padding: 4,
  },
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
});

function IconCell({
  meta,
  selected,
  themeColors,
  onPress,
}: {
  meta: ItemIconMeta;
  selected: boolean;
  themeColors: ReturnType<typeof useThemeColors>;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.cell}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={meta.name}
    >
      <View
        style={[
          styles.iconWrap,
          {
            borderColor: selected ? themeColors.primary : 'transparent',
            backgroundColor: selected ? withColorAlpha(themeColors.primary, 0.1) : 'transparent',
          },
        ]}
      >
        <ItemIcon iconId={meta.id} size={52} />
      </View>
      <Text
        variant="caption"
        numberOfLines={2}
        className={cn('text-center', selected && 'text-primary')}
      >
        {meta.name}
      </Text>
    </Pressable>
  );
}

export function ItemIconPickerSheet({
  onClose,
  selectedIconId,
  onSelect,
}: ItemIconPickerSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { checkLimit } = useProGate();
  const [tab, setTab] = useState<PickerTab>('library');
  const [query, setQuery] = useState('');
  const [customIcons, setCustomIcons] = useState<{ id: string; uri: string }[]>([]);
  // The app is edge-to-edge on Android, so the keyboard overlays content on
  // both platforms rather than resizing the window — lift the sticky search bar
  // manually by the full keyboard height (see the search bar's marginBottom).
  const keyboardHeight = useKeyboardHeight();

  const refreshCustomIcons = useCallback(() => {
    setCustomIcons(listCustomItemIcons());
  }, []);

  // The screen is mounted fresh on each navigation (and torn down on back), so
  // it always opens with default tab/query — just load the custom icons.
  useEffect(() => {
    refreshCustomIcons();
  }, [refreshCustomIcons]);

  const results = useMemo(() => searchItemIcons(query), [query]);

  const handlePickIcon = useCallback(
    (iconId: string | null) => {
      void triggerHaptic('selection');
      onSelect(iconId);
      onClose();
    },
    [onClose, onSelect],
  );

  const handleUpload = useCallback(async () => {
    void triggerHaptic('selection');
    // checkLimit pushes the (root) paywall over this screen when the free
    // custom-upload limit is hit — leave the picker in place underneath so back
    // returns here, not to a half-dismissed editor.
    if (!checkLimit('custom_item_images', customIcons.length)) {
      return;
    }
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
      saveCustomItemIcon(result.assets[0].uri);
      refreshCustomIcons();
    } catch {
      Alert.alert(I18n.t('accounts.logo.upload_failed'));
    }
  }, [checkLimit, customIcons.length, refreshCustomIcons]);

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
            if (iconId === selectedIconId) onSelect(null);
            refreshCustomIcons();
          },
        },
      ]);
    },
    [onSelect, refreshCustomIcons, selectedIconId],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1">
        <SettingsHeader
          className="px-5 pt-5 pb-2"
          title={I18n.t('items.icon.choose_title')}
          onBack={onClose}
        />

        {/* Tabs sit on their own row below the centered title so they don't
            compete with it for the header's side slots. */}
        <View className="flex-row px-5 pb-3" style={{ gap: spacing.lg }}>
          {(
            [
              { value: 'library', label: I18n.t('accounts.logo.tab_library') },
              { value: 'custom', label: I18n.t('accounts.logo.tab_custom') },
            ] as const
          ).map((option) => {
            const active = tab === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => {
                  void triggerHaptic('selection');
                  setTab(option.value);
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

        {tab === 'custom' ? (
          <FlatList
            data={[{ id: UPLOAD_ITEM_ID }, ...customIcons]}
            key="custom-grid"
            numColumns={NUM_COLUMNS}
            keyExtractor={(item) => item.id}
            style={styles.flexOne}
            contentContainerStyle={[
              styles.gridContent,
              { paddingHorizontal: 12, paddingBottom: GRID_BOTTOM_PADDING },
            ]}
            renderItem={({ item }) => {
              if (item.id === UPLOAD_ITEM_ID) {
                return (
                  <Pressable
                    style={styles.cell}
                    onPress={handleUpload}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('accounts.logo.upload')}
                  >
                    <View style={styles.iconWrap}>
                      <View
                        style={[
                          styles.uploadTile,
                          {
                            borderColor: themeColors.primary,
                            backgroundColor: withColorAlpha(themeColors.primary, 0.06),
                          },
                        ]}
                      >
                        <ImagePlus size={22} color={themeColors.primary} />
                      </View>
                    </View>
                    <Text
                      variant="caption"
                      numberOfLines={2}
                      className="text-center text-primary font-medium"
                    >
                      {I18n.t('accounts.logo.upload')}
                    </Text>
                  </Pressable>
                );
              }
              const icon = item as { id: string; uri: string };
              const selected = icon.id === selectedIconId;
              return (
                <View style={styles.cell}>
                  <Pressable
                    onPress={() => handlePickIcon(icon.id)}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('accounts.logo.tab_custom')}
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
                      <ItemIcon iconId={icon.id} size={52} />
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteCustom(icon.id)}
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
        ) : (
          <View style={styles.flexOne}>
            <FlatList
              data={results}
              key={`cols-${NUM_COLUMNS}`}
              numColumns={NUM_COLUMNS}
              keyExtractor={(item) => item.id}
              style={styles.flexOne}
              contentContainerStyle={[
                styles.gridContent,
                { paddingHorizontal: 12, paddingBottom: spacing.md },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              initialNumToRender={24}
              windowSize={7}
              removeClippedSubviews
              ListEmptyComponent={
                <View className="items-center py-16">
                  <Text tone="muted">{I18n.t('accounts.logo.no_results')}</Text>
                </View>
              }
              renderItem={({ item }) => (
                <IconCell
                  meta={item}
                  selected={item.id === selectedIconId}
                  themeColors={themeColors}
                  onPress={() => handlePickIcon(item.id)}
                />
              )}
            />

            <View
              className="px-5 bg-background"
              style={[
                styles.searchBar,
                {
                  borderTopColor: themeColors.border,
                  // No bottom safe-area edge on this screen, so lift the bar by
                  // the full keyboard height to sit flush above it (works the
                  // same on iOS and edge-to-edge Android). When closed, pad past
                  // the home indicator ourselves.
                  marginBottom: keyboardHeight,
                  paddingBottom: keyboardHeight > 0 ? spacing.sm : insets.bottom + spacing.sm,
                },
              ]}
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
                  placeholder={I18n.t('items.icon.search_placeholder')}
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
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
