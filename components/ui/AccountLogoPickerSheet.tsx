import * as ImagePicker from 'expo-image-picker';
import { Check, ChevronDown, ImagePlus, Search, Trash2, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { AccountLogo } from '~/components/ui/AccountLogo';
import { SettingsHeader } from '~/components/ui/settings';
import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import {
  ACCOUNT_LOGO_COUNTRIES,
  type AccountLogoMeta,
  DEFAULT_LOGO_COUNTRY,
  getCountryFlag,
  getLogosForCountry,
  regionToCountrySlug,
  searchAccountLogos,
} from '~/constants/accountLogos';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { getDeviceRegionCode, I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import {
  deleteCustomLogo,
  listCustomAccountLogos,
  saveCustomAccountLogo,
} from '~/services/userAssets';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';

interface AccountLogoPickerSheetProps {
  /** Dismisses the screen (pops the root stack back to the editor). */
  onClose: () => void;
  selectedLogoId: string | null;
  /** Receives the new logo id, or null when the user clears the logo. */
  onSelect: (logoId: string | null) => void;
}

const NUM_COLUMNS = 3;
const UPLOAD_ITEM_ID = '__upload__';
// Extra scroll band so the last row of the custom grid clears the home
// indicator (this screen drops the bottom safe-area edge, so nothing else does).
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
    // paddingBottom is set dynamically per keyboard state in the animated style.
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  countryFlagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  countryDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginVertical: 8,
    opacity: 0.6,
  },
  countryBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  countrySheet: {
    height: '70%',
  },
  countryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
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
  logoWrap: {
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

function LogoCell({
  meta,
  selected,
  themeColors,
  onPress,
}: {
  meta: AccountLogoMeta;
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
          styles.logoWrap,
          {
            borderColor: selected ? themeColors.primary : 'transparent',
            backgroundColor: selected ? withColorAlpha(themeColors.primary, 0.1) : 'transparent',
          },
        ]}
      >
        <AccountLogo logoId={meta.id} size={52} />
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

export function AccountLogoPickerSheet({
  onClose,
  selectedLogoId,
  onSelect,
}: AccountLogoPickerSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings } = useApp();
  const { checkLimit } = useProGate();
  const [tab, setTab] = useState<PickerTab>('library');
  const [query, setQuery] = useState('');
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [customLogos, setCustomLogos] = useState<{ id: string; uri: string }[]>([]);

  // The app is edge-to-edge on both platforms, so the keyboard overlays content
  // rather than resizing the window. Lift the sticky search bar with the same
  // approach as the quick-entry sheet: translate it up by the live keyboard
  // frame (react-native-keyboard-controller tracks the true inset, which the JS
  // Keyboard events under-report on edge-to-edge Android). `height` is 0 when
  // closed and negative when open; `progress` runs 0→1, used to fold away the
  // home-indicator padding as the keyboard rises so the bar lands flush on it.
  const keyboard = useReanimatedKeyboardAnimation();
  const searchBarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboard.height.value }],
    paddingBottom: spacing.sm + insets.bottom * (1 - keyboard.progress.value),
  }));

  const refreshCustomLogos = useCallback(() => {
    setCustomLogos(listCustomAccountLogos());
  }, []);

  const deviceDefaultCountry = useMemo(() => regionToCountrySlug(getDeviceRegionCode()), []);
  const activeCountry =
    settings.accountLogoCountry &&
    ACCOUNT_LOGO_COUNTRIES.some((c) => c.slug === settings.accountLogoCountry)
      ? settings.accountLogoCountry
      : (deviceDefaultCountry ?? DEFAULT_LOGO_COUNTRY);
  const activeCountryName =
    ACCOUNT_LOGO_COUNTRIES.find((c) => c.slug === activeCountry)?.name ?? activeCountry;

  // The screen is mounted fresh on each navigation (and torn down on back), so
  // it always opens with default tab/query — just load the custom logos.
  useEffect(() => {
    refreshCustomLogos();
  }, [refreshCustomLogos]);

  const isSearching = query.trim().length > 0;
  const results = useMemo(
    () => (isSearching ? searchAccountLogos(query) : getLogosForCountry(activeCountry)),
    [activeCountry, isSearching, query],
  );

  const handleSelectCountry = (slug: string) => {
    void triggerHaptic('selection');
    updateSettings({ accountLogoCountry: slug });
    setShowCountryModal(false);
  };

  const handlePickLogo = useCallback(
    (logoId: string | null) => {
      void triggerHaptic('selection');
      onSelect(logoId);
      onClose();
    },
    [onClose, onSelect],
  );

  const handleUpload = useCallback(async () => {
    void triggerHaptic('selection');
    // Free users can keep up to FREE_MAX_CUSTOM_LOGOS uploads; beyond that the
    // paywall is shown. checkLimit pushes the (root) paywall over this screen —
    // leave the picker in place underneath so back returns here, not to a
    // half-dismissed editor.
    if (!checkLimit('custom_logos', customLogos.length)) {
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
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;
      // Add to the grid but don't auto-select — the user taps to choose it.
      saveCustomAccountLogo(result.assets[0].uri);
      refreshCustomLogos();
    } catch {
      // The picker itself can reject, not just the save step below it.
      Alert.alert(I18n.t('accounts.logo.upload_failed'));
    }
  }, [checkLimit, customLogos.length, refreshCustomLogos]);

  const handleDeleteCustom = useCallback(
    (logoId: string) => {
      void triggerHaptic('warning');
      Alert.alert(I18n.t('accounts.logo.delete_title'), I18n.t('accounts.logo.delete_message'), [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteCustomLogo(logoId);
            if (logoId === selectedLogoId) onSelect(null);
            refreshCustomLogos();
          },
        },
      ]);
    },
    [onSelect, refreshCustomLogos, selectedLogoId],
  );

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="flex-1">
        <SettingsHeader
          className="px-5 pt-5 pb-2"
          title={I18n.t('accounts.logo.choose_title')}
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
            data={[{ id: UPLOAD_ITEM_ID }, ...customLogos]}
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
                    <View style={styles.logoWrap}>
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
              const logo = item as { id: string; uri: string };
              const selected = logo.id === selectedLogoId;
              return (
                <View style={styles.cell}>
                  <Pressable
                    onPress={() => handlePickLogo(logo.id)}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('accounts.logo.tab_custom')}
                  >
                    <View
                      style={[
                        styles.logoWrap,
                        {
                          borderColor: selected ? themeColors.primary : 'transparent',
                          backgroundColor: selected
                            ? withColorAlpha(themeColors.primary, 0.1)
                            : 'transparent',
                        },
                      ]}
                    >
                      <AccountLogo logoId={logo.id} size={52} />
                    </View>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteCustom(logo.id)}
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
              initialNumToRender={18}
              windowSize={7}
              removeClippedSubviews
              ListEmptyComponent={
                <View className="items-center py-16">
                  <Text tone="muted">{I18n.t('accounts.logo.no_results')}</Text>
                </View>
              }
              renderItem={({ item }) => (
                <LogoCell
                  meta={item}
                  selected={item.id === selectedLogoId}
                  themeColors={themeColors}
                  onPress={() => handlePickLogo(item.id)}
                />
              )}
            />

            <Animated.View
              className="px-5 bg-background"
              style={[
                styles.searchBar,
                { borderTopColor: themeColors.border },
                searchBarAnimatedStyle,
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
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    setShowCountryModal(true);
                  }}
                  style={styles.countryFlagButton}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`${I18n.t('accounts.logo.country')}: ${activeCountryName}`}
                >
                  <Text className="text-[18px]">{getCountryFlag(activeCountry)}</Text>
                  <ChevronDown size={13} color={themeColors.textMuted} />
                </Pressable>
                <View style={[styles.countryDivider, { backgroundColor: themeColors.border }]} />
                <Search size={16} color={themeColors.textMuted} />
                <TextInput
                  style={[styles.searchInput, { color: themeColors.text }]}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={I18n.t('accounts.logo.search_placeholder')}
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
          </View>
        )}
      </View>

      <ThemeModal
        visible={showCountryModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCountryModal(false)}
      >
        <Pressable style={styles.countryBackdrop} onPress={() => setShowCountryModal(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={styles.countrySheet}>
            <View
              className="bg-card rounded-t-[28px] flex-1"
              style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            >
              <View className="px-5 pt-5 pb-3 flex-row items-center">
                <Text variant="subheading" className="flex-1">
                  {I18n.t('accounts.logo.country')}
                </Text>
                <Pressable
                  onPress={() => setShowCountryModal(false)}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.close')}
                  hitSlop={8}
                  className="h-9 w-9 rounded-full items-center justify-center bg-secondary/50 active:opacity-70"
                >
                  <X size={18} color={themeColors.textMuted} />
                </Pressable>
              </View>
              <FlatList
                data={ACCOUNT_LOGO_COUNTRIES}
                keyExtractor={(c) => c.slug}
                className="flex-1"
                contentContainerStyle={{ paddingBottom: spacing.md }}
                showsVerticalScrollIndicator={false}
                renderItem={({ item: country }) => {
                  const isActive = country.slug === activeCountry;
                  return (
                    <Pressable
                      onPress={() => handleSelectCountry(country.slug)}
                      style={styles.countryRow}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                    >
                      <Text className="text-[20px]">{getCountryFlag(country.slug)}</Text>
                      <Text
                        variant="body"
                        numberOfLines={1}
                        className={cn('flex-1', isActive && 'text-primary font-medium')}
                      >
                        {country.name}
                      </Text>
                      {isActive ? <Check size={18} color={themeColors.primary} /> : null}
                    </Pressable>
                  );
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </ThemeModal>
    </SafeAreaView>
  );
}
