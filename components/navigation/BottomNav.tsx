import { BlurView } from 'expo-blur';
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
import { FLOATING_NAV_HEIGHT, getFloatingNavBottomGap } from '~/components/navigation/floatingNav';
import { ClayIcon, type ClayIconName } from '~/components/ui/ClayIcon';
import { useIsFlatIcons, useResolvedTheme } from '~/context/ThemeContext';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

export type TabName = 'accounts' | 'calendar' | 'insights' | 'albums' | 'settings';

interface BottomNavProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
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

const FLOATING_NAV_MARGIN_H = 20;
const FLOATING_NAV_MAX_WIDTH = 520;
// Calendar zoom layers use positive z-indices and extend beneath the floating bar.
// Keep the bar above them so it remains visible and receives touches.
const NAV_OVERLAY_Z_INDEX = 20;
// How far the bar shrinks/sinks when minimized on scroll.
const FLOATING_MINIMIZE_SCALE = 0.88;
const FLOATING_MINIMIZE_TRANSLATE_Y = 12;
const FLOATING_MINIMIZE_OPACITY = 0.8;

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

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const resolvedTheme = useResolvedTheme();
  const { minimizeProgress } = useBottomNavMinimize();
  const staticProgress = useSharedValue(0);
  const progress = minimizeProgress ?? staticProgress;

  const minimizeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: progress.value * FLOATING_MINIMIZE_TRANSLATE_Y },
      { scale: 1 - progress.value * (1 - FLOATING_MINIMIZE_SCALE) },
    ],
    opacity: 1 - progress.value * (1 - FLOATING_MINIMIZE_OPACITY),
  }));

  const handleTabPress = useCallback(
    (tab: TabName) => {
      void triggerHaptic('medium');
      onTabChange(tab);
    },
    [onTabChange],
  );

  const { isTablet } = useDeviceLayout();

  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 items-center"
      style={{ bottom: getFloatingNavBottomGap(safeBottom), zIndex: NAV_OVERLAY_Z_INDEX }}
    >
      <Animated.View
        style={[
          minimizeStyle,
          {
            width: '100%',
            maxWidth: isTablet ? FLOATING_NAV_MAX_WIDTH : undefined,
            paddingHorizontal: FLOATING_NAV_MARGIN_H,
          },
        ]}
      >
        <View className="rounded-full shadow-float" style={{ height: FLOATING_NAV_HEIGHT }}>
          <View className="flex-1 overflow-hidden rounded-full border border-border/50">
            {Platform.OS === 'ios' ? (
              <BlurView
                pointerEvents="none"
                intensity={70}
                tint={resolvedTheme === 'dark' ? 'dark' : 'light'}
                style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
              />
            ) : null}
            <View
              pointerEvents="none"
              className={
                Platform.OS === 'ios'
                  ? 'absolute inset-0 bg-card/40'
                  : 'absolute inset-0 bg-card/80'
              }
            />
            <View className="flex-1 flex-row items-center px-2">
              {TABS.map((tab) => (
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
        </View>
      </Animated.View>
    </View>
  );
}
