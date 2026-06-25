import { GlassView } from 'expo-glass-effect';
import React, { memo, useCallback, useEffect, useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AlbumsIcon,
  CalendarIcon,
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
import { useResolvedTheme } from '~/context/ThemeContext';
import type { TutorialTargetRect } from '~/features/tutorial/types';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

export type TabName = 'accounts' | 'calendar' | 'insights' | 'albums' | 'settings';

interface BottomNavProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  hideTabs?: TabName[];
  onTutorialTabLayout?: (tab: TabName, rect: TutorialTargetRect) => void;
  tutorialFocusedTab?: TabName | null;
  tutorialMeasureToken?: number;
}

type NavIconComponent = typeof CalendarIcon;

const TABS: { name: TabName; icon: NavIconComponent }[] = [
  { name: 'calendar', icon: CalendarIcon },
  { name: 'accounts', icon: WalletIcon },
  { name: 'insights', icon: InsightsIcon },
  { name: 'albums', icon: AlbumsIcon },
  { name: 'settings', icon: SettingsIcon },
];

const NAV_ROW_HEIGHT = 58;
const ICON_SIZE = 26;

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
  Icon,
  isActive,
  isTutorialFocused,
  onPressTab,
  tintActive,
  tintInactive,
  onTutorialTabLayout,
  tutorialMeasureToken,
}: {
  tab: TabName;
  Icon: NavIconComponent;
  isActive: boolean;
  isTutorialFocused: boolean;
  onPressTab: (tab: TabName) => void;
  tintActive: string;
  tintInactive: string;
  onTutorialTabLayout?: (tab: TabName, rect: TutorialTargetRect) => void;
  tutorialMeasureToken?: number;
}) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.85 });
  // Measure the plain wrapper View, not the Pressable. On Android the
  // Pressable sits inside a reanimated `Animated.View` with no explicit
  // width, and `measureInWindow` on it returns the icon's intrinsic bounds
  // instead of the full tab slot — leaving the tutorial highlight rendered
  // as a small pill above the icon. The wrapper is not transformed and
  // owns the flex-1 slot width, so its measurement is stable.
  const navItemRef = useRef<View>(null);
  const handlePress = useCallback(() => onPressTab(tab), [onPressTab, tab]);

  const reportLayout = useCallback(() => {
    if (!onTutorialTabLayout) return;
    navItemRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) return;
      onTutorialTabLayout(tab, { x, y, width, height });
    });
  }, [onTutorialTabLayout, tab]);
  const isEmphasized = isActive || isTutorialFocused;

  useEffect(() => {
    if (!onTutorialTabLayout) return;
    if (!tutorialMeasureToken) return;
    const refresh = setTimeout(() => {
      reportLayout();
    }, 70);
    const androidExtra =
      Platform.OS === 'android'
        ? setTimeout(() => {
            reportLayout();
          }, 300)
        : null;
    return () => {
      clearTimeout(refresh);
      if (androidExtra) clearTimeout(androidExtra);
    };
  }, [onTutorialTabLayout, reportLayout, tutorialMeasureToken]);

  return (
    <View ref={navItemRef} onLayout={reportLayout} className="flex-1">
      <Animated.View style={animatedStyle} className="flex-1">
        <Pressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          className={cn(
            'items-center justify-center rounded-2xl mx-0.5',
            isTutorialFocused && 'bg-primary/12',
          )}
          style={{ height: NAV_ROW_HEIGHT }}
        >
          <Icon
            size={ICON_SIZE}
            color={isEmphasized ? tintActive : tintInactive}
            strokeWidth={isEmphasized ? 2.2 : 1.6}
            filled={isEmphasized}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
});

export function BottomNav({
  activeTab,
  onTabChange,
  hideTabs,
  onTutorialTabLayout,
  tutorialFocusedTab,
  tutorialMeasureToken,
}: BottomNavProps) {
  const themeColors = useThemeColors();
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
                Icon={tab.icon}
                isActive={activeTab === tab.name}
                isTutorialFocused={tutorialFocusedTab === tab.name}
                tintActive={themeColors.primary}
                tintInactive={themeColors.textMuted}
                onPressTab={handleTabPress}
                onTutorialTabLayout={onTutorialTabLayout}
                tutorialMeasureToken={tutorialMeasureToken}
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
            Icon={tab.icon}
            isActive={activeTab === tab.name}
            isTutorialFocused={tutorialFocusedTab === tab.name}
            tintActive={themeColors.primary}
            tintInactive={themeColors.textMuted}
            onPressTab={handleTabPress}
            onTutorialTabLayout={onTutorialTabLayout}
            tutorialMeasureToken={tutorialMeasureToken}
          />
        ))}
      </View>
    </View>
  );
}
