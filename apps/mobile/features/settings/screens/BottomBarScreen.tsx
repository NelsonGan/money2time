import { GripVertical, Lock, Minus, Plus } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { NAV_TAB_META } from '~/components/navigation/BottomNav';
import {
  addNavTab,
  availableNavTabs,
  canRemoveNavTab,
  isPinnedNavTab,
  MAX_NAV_TABS,
  parseNavTabs,
  removeNavTab,
  serializeNavTabs,
  type TabName,
} from '~/components/navigation/navTabs';
import {
  Card,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { ClayIcon } from '~/components/ui/ClayIcon';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';

const ROW_HEIGHT = 56;
const ICON_SIZE = 30;

interface BottomBarScreenProps {
  onBack: () => void;
}

/**
 * Settings > Display > Bottom bar: which pages sit in the bar and in what
 * order. Every change is saved straight away, so the bar under the page is
 * the preview. The rules (pinned pages, the five-page cap, what gets stored)
 * live in `components/navigation/navTabs`.
 */
export function BottomBarScreen({ onBack }: BottomBarScreenProps) {
  const { settings, updateSettings } = useApp();
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  // Sortable rows are absolutely positioned while dragging, so they need an
  // explicit width rather than '100%' (as in the other reorderable lists).
  const { contentWidth } = useDeviceLayout();
  const rowWidth = Math.max(contentWidth - SETTINGS_HORIZONTAL_PADDING * 2, 0);

  const tabs = useMemo(() => parseNavTabs(settings.navTabsJson), [settings.navTabsJson]);
  const morePages = useMemo(() => availableNavTabs(tabs), [tabs]);
  const isFull = tabs.length >= MAX_NAV_TABS;
  const isDefault = settings.navTabsJson === null;

  const save = useCallback(
    (next: TabName[], change: 'add' | 'remove' | 'reorder' | 'reset') => {
      void triggerHaptic('selection');
      updateSettings({ navTabsJson: serializeNavTabs(next) });
      void trackEvent(AnalyticsEvents.NAV_TABS_CHANGED, {
        change,
        tabs: next.join(','),
        tab_count: next.length,
      });
    },
    [updateSettings],
  );

  return (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('settings.bottom_bar.title')}
        />
      </View>
      <Animated.ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={[styles.scrollContent, bottomNavInset]}
        showsVerticalScrollIndicator={false}
      >
        <Sortable.Flex
          activeItemScale={1.02}
          activeItemShadowOpacity={0.08}
          customHandle
          dragActivationDelay={0}
          flexDirection="column"
          flexWrap="nowrap"
          gap={8}
          inactiveItemOpacity={1}
          onDragEnd={({ fromIndex, toIndex, order }) => {
            if (fromIndex === toIndex) return;
            save(order(tabs), 'reorder');
          }}
          scrollableRef={scrollRef}
          width="fill"
        >
          {tabs.map((tab, index) => {
            const meta = NAV_TAB_META[tab];
            const label = I18n.t(meta.labelKey);
            const pinned = isPinnedNavTab(tab);
            const removable = canRemoveNavTab(tabs, tab);
            const isHome = index === 0;
            return (
              <View
                key={tab}
                style={[
                  styles.row,
                  {
                    width: rowWidth,
                    backgroundColor: themeColors.card,
                    borderColor: themeColors.border,
                  },
                ]}
              >
                <Sortable.Handle>
                  <View
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={`${I18n.t('common.reorder')} ${label}`}
                    style={styles.dragHandle}
                  >
                    <GripVertical size={16} color={themeColors.textMuted} />
                  </View>
                </Sortable.Handle>
                <ClayIcon name={meta.icon} size={ICON_SIZE} flatSize={20} />
                <View style={styles.labelRow}>
                  <Text variant="body" numberOfLines={1} className="shrink">
                    {label}
                  </Text>
                  {/* The first page is where the app opens, so dragging a page
                      to the top is how home is chosen. */}
                  {isHome ? (
                    <View className="rounded-full bg-primary/12 px-2 py-0.5">
                      <Text variant="caption" style={{ color: themeColors.primary }}>
                        {I18n.t('settings.bottom_bar.home')}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {pinned ? (
                  <View
                    accessible
                    accessibilityLabel={I18n.t('settings.bottom_bar.pinned')}
                    style={styles.trailingButton}
                  >
                    <Lock size={16} color={themeColors.textMuted} />
                  </View>
                ) : (
                  <Pressable
                    onPress={() => save(removeNavTab(tabs, tab), 'remove')}
                    disabled={!removable}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !removable }}
                    accessibilityLabel={I18n.t('settings.bottom_bar.remove', { page: label })}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.trailingButton,
                      { opacity: !removable ? 0.35 : pressed ? 0.6 : 1 },
                    ]}
                  >
                    <View style={[styles.roundButton, { backgroundColor: themeColors.error }]}>
                      <Minus size={14} color="#fff" strokeWidth={3} />
                    </View>
                  </Pressable>
                )}
              </View>
            );
          })}
        </Sortable.Flex>

        {morePages.length > 0 ? (
          <View className="mt-6">
            <Text variant="caption" tone="muted" className="mb-2 px-1 uppercase">
              {I18n.t('settings.bottom_bar.more_pages')}
            </Text>
            <Card>
              {morePages.map((tab, index) => {
                const meta = NAV_TAB_META[tab];
                const label = I18n.t(meta.labelKey);
                return (
                  <Pressable
                    key={tab}
                    disabled={isFull}
                    onPress={() => save(addNavTab(tabs, tab), 'add')}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isFull }}
                    accessibilityLabel={I18n.t('settings.bottom_bar.add', { page: label })}
                    style={({ pressed }) => ({ opacity: isFull ? 0.45 : pressed ? 0.6 : 1 })}
                  >
                    {/* The row layout sits on a plain View: on a Pressable's
                        style callback the flex direction did not apply. */}
                    <View
                      style={[
                        styles.moreRow,
                        index > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: themeColors.border,
                        },
                      ]}
                    >
                      <ClayIcon name={meta.icon} size={ICON_SIZE} flatSize={20} />
                      <Text variant="body" numberOfLines={1} style={styles.label}>
                        {label}
                      </Text>
                      <View style={[styles.roundButton, { backgroundColor: themeColors.primary }]}>
                        <Plus size={14} color="#fff" strokeWidth={3} />
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </Card>
          </View>
        ) : null}

        {!isDefault ? (
          <Pressable
            onPress={() => save([...parseNavTabs(null)], 'reset')}
            accessibilityRole="button"
            className="mt-5 items-center py-2 active:opacity-70"
          >
            <Text variant="bodyStrong" style={{ color: themeColors.primary }}>
              {I18n.t('settings.bottom_bar.reset')}
            </Text>
          </Pressable>
        ) : null}
      </Animated.ScrollView>
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
  row: {
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    height: ROW_HEIGHT,
    paddingRight: spacing.sm,
  },
  dragHandle: {
    alignItems: 'center',
    height: ROW_HEIGHT,
    justifyContent: 'center',
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
  },
  label: {
    flex: 1,
  },
  labelRow: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
  },
  trailingButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  roundButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  moreRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: ROW_HEIGHT,
    paddingHorizontal: spacing.md,
  },
});
