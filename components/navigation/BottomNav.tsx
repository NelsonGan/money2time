import { GlassView } from 'expo-glass-effect';
import React, { memo, useCallback } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AlbumsIcon,
  HomeIcon,
  InsightsIcon,
  SettingsIcon,
  WalletIcon,
} from '~/components/icons/NavIcons';
import { useBottomNavMinimize } from '~/components/navigation/BottomNavMinimize';
import {
  getGlassNavBottomGap,
  getGlassNavReservedInset,
  GLASS_NAV_HEIGHT,
  isLiquidGlassNavEnabled,
} from '~/components/navigation/liquidGlass';
import { ClayIcon, type ClayIconName } from '~/components/ui/ClayIcon';
import { useIsFlatIcons, useResolvedTheme } from '~/context/ThemeContext';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

export type TabName = 'accounts' | 'calendar' | 'insights' | 'albums' | 'settings';

interface BottomNavProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  hideTabs?: TabName[];
}

type NavIconComponent = typeof HomeIcon;

/**
 * Tab glyphs in both icon styles.
 *
 * Clay artwork carries its own colour, so an active clay tab is a different
 * *file* rather than a tint — see components/ui/ClayIcon.tsx. The albums sheet
 * only ever drew one pose, so that tab reuses its resting art and leans on the
 * size and opacity step instead. The flat set is the pre-clay SVG pair, which
 * does the opposite: one component, tinted and filled when active.
 */
const TABS: {
  name: TabName;
  icon: ClayIconName;
  activeIcon: ClayIconName;
  flatIcon: NavIconComponent;
  labelKey: string;
}[] = [
  {
    name: 'calendar',
    icon: 'nav/home',
    activeIcon: 'nav/home-active',
    flatIcon: HomeIcon,
    labelKey: 'nav.tab_calendar',
  },
  {
    name: 'accounts',
    icon: 'nav/wallet',
    activeIcon: 'nav/wallet-active',
    flatIcon: WalletIcon,
    labelKey: 'nav.tab_accounts',
  },
  {
    name: 'insights',
    icon: 'nav/insights',
    activeIcon: 'nav/insights-active',
    flatIcon: InsightsIcon,
    labelKey: 'nav.tab_insights',
  },
  {
    name: 'albums',
    icon: 'settings/albums',
    activeIcon: 'settings/albums',
    flatIcon: AlbumsIcon,
    labelKey: 'nav.tab_albums',
  },
  {
    name: 'settings',
    icon: 'nav/settings',
    activeIcon: 'nav/settings-active',
    flatIcon: SettingsIcon,
    labelKey: 'nav.tab_settings',
  },
];

const NAV_ROW_HEIGHT = 58;
const ICON_SIZE = 26;
const ICON_SIZE_ACTIVE = 30;
const ICON_OPACITY_RESTING = 0.72;

const GLASS_NAV_MARGIN_H = 20;
const GLASS_NAV_MAX_WIDTH = 520;
// How far the bar shrinks/sinks when minimized on scroll.
const GLASS_MINIMIZE_SCALE = 0.88;
const GLASS_MINIMIZE_TRANSLATE_Y = 12;
const GLASS_MINIMIZE_OPACITY = 0.8;

export function getBottomNavSafePadding(safeBottom: number) {
  return Platform.OS === 'ios' ? Math.max(safeBottom - 12, 8) : Math.max(safeBottom, 10);
}

export function getBottomNavReservedInset(safeBottom: number) {
  if (isLiquidGlassNavEnabled()) {
    return getGlassNavReservedInset(safeBottom);
  }
  return NAV_ROW_HEIGHT + getBottomNavSafePadding(safeBottom);
}

const NavItem = memo(function NavItem({
  tab,
  icon,
  activeIcon,
  FlatIcon,
  labelKey,
  isActive,
  onPressTab,
}: {
  tab: TabName;
  icon: ClayIconName;
  activeIcon: ClayIconName;
  FlatIcon: NavIconComponent;
  labelKey: string;
  isActive: boolean;
  onPressTab: (tab: TabName) => void;
}) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.85 });
  const handlePress = useCallback(() => onPressTab(tab), [onPressTab, tab]);
  const isFlat = useIsFlatIcons();
  const themeColors = useThemeColors();

  return (
    <View className="flex-1">
      <Animated.View style={animatedStyle} className="flex-1">
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          // The glyph is artwork with no text, so the label has to come from
          // here or a screen reader announces an unnamed button.
          accessibilityRole="tab"
          accessibilityState={{ selected: isActive }}
          accessibilityLabel={I18n.t(labelKey)}
          className="items-center justify-center rounded-2xl mx-0.5"
          style={{ height: NAV_ROW_HEIGHT }}
        >
          {isFlat ? (
            <FlatIcon
              size={ICON_SIZE}
              color={isActive ? themeColors.primary : themeColors.textMuted}
              strokeWidth={isActive ? 2.2 : 1.6}
              filled={isActive}
            />
          ) : (
            <ClayIcon
              name={isActive ? activeIcon : icon}
              size={isActive ? ICON_SIZE_ACTIVE : ICON_SIZE}
              opacity={isActive ? undefined : ICON_OPACITY_RESTING}
            />
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
});

export function BottomNav({ activeTab, onTabChange, hideTabs }: BottomNavProps) {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const resolvedTheme = useResolvedTheme();
  const { minimizeProgress } = useBottomNavMinimize();
  const staticProgress = useSharedValue(0);
  const progress = minimizeProgress ?? staticProgress;

  const minimizeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: progress.value * GLASS_MINIMIZE_TRANSLATE_Y },
      { scale: 1 - progress.value * (1 - GLASS_MINIMIZE_SCALE) },
    ],
    opacity: 1 - progress.value * (1 - GLASS_MINIMIZE_OPACITY),
  }));

  const handleTabPress = useCallback(
    (tab: TabName) => {
      void triggerHaptic('medium');
      onTabChange(tab);
    },
    [onTabChange],
  );

  const { isTablet } = useDeviceLayout();
  const visibleTabs = hideTabs?.length ? TABS.filter((t) => !hideTabs.includes(t.name)) : TABS;

  if (isLiquidGlassNavEnabled()) {
    return (
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: getGlassNavBottomGap(safeBottom),
          alignItems: 'center',
        }}
      >
        <Animated.View
          style={[
            minimizeStyle,
            {
              width: '100%',
              maxWidth: isTablet ? GLASS_NAV_MAX_WIDTH : undefined,
              paddingHorizontal: GLASS_NAV_MARGIN_H,
            },
          ]}
        >
          <GlassView
            glassEffectStyle="regular"
            isInteractive
            colorScheme={resolvedTheme}
            style={{
              height: GLASS_NAV_HEIGHT,
              borderRadius: GLASS_NAV_HEIGHT / 2,
              overflow: 'hidden',
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 8,
            }}
          >
            {visibleTabs.map((tab) => (
              <NavItem
                key={tab.name}
                tab={tab.name}
                icon={tab.icon}
                activeIcon={tab.activeIcon}
                FlatIcon={tab.flatIcon}
                labelKey={tab.labelKey}
                isActive={activeTab === tab.name}
                onPressTab={handleTabPress}
              />
            ))}
          </GlassView>
        </Animated.View>
      </View>
    );
  }

  const bottomPad = getBottomNavSafePadding(safeBottom);

  return (
    <View
      pointerEvents="box-none"
      style={[
        { paddingBottom: bottomPad },
        isTablet && {
          maxWidth: TABLET_CONTENT_MAX_WIDTH,
          alignSelf: 'center' as const,
          width: '100%',
        },
      ]}
      className="border-t border-border/30 bg-card"
    >
      <View className="flex-row items-center px-2" style={{ minHeight: NAV_ROW_HEIGHT }}>
        {visibleTabs.map((tab) => (
          <NavItem
            key={tab.name}
            tab={tab.name}
            icon={tab.icon}
            activeIcon={tab.activeIcon}
            FlatIcon={tab.flatIcon}
            labelKey={tab.labelKey}
            isActive={activeTab === tab.name}
            onPressTab={handleTabPress}
          />
        ))}
      </View>
    </View>
  );
}
