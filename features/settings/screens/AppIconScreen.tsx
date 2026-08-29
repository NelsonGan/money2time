import { Check, Lock } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  Card,
  CardContent,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { APP_ICONS, type AppIconVariant } from '~/constants/appIcons';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useResolvedTheme } from '~/context/ThemeContext';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { applyAppIcon, supportsAppIconSwitching } from '~/services/appIcon';
import { reportError } from '~/services/errorReporting';
import { triggerHaptic } from '~/services/haptics';
import type { AppIconId } from '~/types';

const TILE_SIZE = 74;
const BADGE_SIZE = 20;

interface AppIconScreenProps {
  onBack: () => void;
}

export function AppIconScreen({ onBack }: AppIconScreenProps) {
  const { settings, updateSettings } = useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const resolvedTheme = useResolvedTheme();
  const themeColors = useThemeColors();
  const { isPro, requirePro } = useProGate();

  // The picker leads the DB by one frame: the OS call is awaited, and a tile
  // that only ticks once the write has landed feels broken next to a system
  // dialog that has already appeared.
  const [pendingIconId, setPendingIconId] = useState<AppIconId | null>(null);
  const selectedIconId = pendingIconId ?? settings.appIcon;

  // Hand the tick back to the DB once the write has landed, so a persist that
  // silently failed shows up here instead of being masked forever.
  useEffect(() => {
    if (pendingIconId && settings.appIcon === pendingIconId) setPendingIconId(null);
  }, [pendingIconId, settings.appIcon]);

  const handleSelect = useCallback(
    (variant: AppIconVariant) => {
      if (variant.id === selectedIconId) return;
      if (!variant.free && !requirePro('app_icon')) return;

      void triggerHaptic('selection');
      setPendingIconId(variant.id);
      void applyAppIcon(variant.id)
        .then(() => {
          updateSettings({ appIcon: variant.id });
          void trackEvent(AnalyticsEvents.APP_ICON_CHANGED, { icon: variant.id });
        })
        .catch((error: unknown) => {
          // The OS refused (backgrounded app, unsupported device). Snap the
          // grid back rather than persisting a choice the home screen ignored.
          setPendingIconId(null);
          reportError(error, { scope: 'app_icon_apply', icon: variant.id });
        });
    },
    [requirePro, selectedIconId, updateSettings],
  );

  return (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('app_icon.title')}
        />
      </View>
      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        <Card>
          <CardContent className="py-5 gap-4">
            {supportsAppIconSwitching ? null : (
              <Text variant="caption" tone="muted">
                {I18n.t('app_icon.unsupported')}
              </Text>
            )}
            <View style={styles.grid}>
              {APP_ICONS.map((variant) => {
                const selected = variant.id === selectedIconId;
                const locked = !isPro && !variant.free;
                const label = I18n.t(variant.labelKey);

                return (
                  <Pressable
                    key={variant.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled: !supportsAppIconSwitching }}
                    // The lock badge is visual only, so say out loud which tiles
                    // open the paywall instead of changing the icon.
                    accessibilityLabel={locked ? `${label}, ${I18n.t('pro.badge')}` : label}
                    disabled={!supportsAppIconSwitching}
                    onPress={() => handleSelect(variant)}
                    style={[styles.cell, !supportsAppIconSwitching && styles.cellDisabled]}
                  >
                    <View style={styles.tileWrap}>
                      <View
                        style={[
                          styles.tile,
                          {
                            borderColor: selected ? themeColors.primary : themeColors.border,
                            borderWidth: selected ? 2.5 : StyleSheet.hairlineWidth,
                          },
                        ]}
                      >
                        <Image
                          source={
                            resolvedTheme === 'dark' ? variant.previewDark : variant.previewLight
                          }
                          style={styles.tileImage}
                          resizeMode="cover"
                        />
                      </View>
                      {selected || locked ? (
                        <View style={[styles.badge, { backgroundColor: themeColors.primary }]}>
                          {selected ? (
                            <Check size={11} color="#FFFFFF" strokeWidth={3} />
                          ) : (
                            <Lock size={10} color="#FFFFFF" />
                          )}
                        </View>
                      ) : null}
                    </View>
                    <Text variant="caption" tone={selected ? 'default' : 'muted'} numberOfLines={1}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
  },
  cell: {
    // Three columns, rounded down: an exact 100/3 each sums to a hair over 100%
    // in float, which drops the third tile onto a row of its own.
    width: '33.333%',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cellDisabled: {
    opacity: 0.45,
  },
  tileWrap: {
    // The badge overhangs the tile's top-right corner, so it needs a box of its
    // own to hang off: the cell also holds the label, and centres its children.
    position: 'relative',
  },
  tile: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    // Close to the iOS squircle, so a tile reads as the icon rather than as a
    // photo of one.
    borderRadius: 18,
    overflow: 'hidden',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: -BADGE_SIZE / 3,
    right: -BADGE_SIZE / 3,
    height: BADGE_SIZE,
    width: BADGE_SIZE,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
