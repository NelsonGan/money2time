import React, { memo, useCallback, useEffect, useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CalendarIcon,
  HomeIcon,
  InsightsIcon,
  SettingsIcon,
  WalletIcon,
} from '~/components/icons/NavIcons';
import type { TutorialTargetRect } from '~/features/tutorial/types';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

export type TabName = 'home' | 'accounts' | 'calendar' | 'insights' | 'settings';

interface BottomNavProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  hideTabs?: TabName[];
  onTutorialTabLayout?: (tab: TabName, rect: TutorialTargetRect) => void;
  tutorialFocusedTab?: TabName | null;
  tutorialMeasureToken?: number;
}

type NavIconComponent = typeof HomeIcon;

const TABS: { name: TabName; icon: NavIconComponent }[] = [
  { name: 'home', icon: HomeIcon },
  { name: 'accounts', icon: WalletIcon },
  { name: 'calendar', icon: CalendarIcon },
  { name: 'insights', icon: InsightsIcon },
  { name: 'settings', icon: SettingsIcon },
];

const NAV_ROW_HEIGHT = 58;
const ICON_SIZE = 26;

export function getBottomNavSafePadding(safeBottom: number) {
  return Platform.OS === 'ios' ? Math.max(safeBottom - 12, 8) : Math.max(safeBottom, 10);
}

export function getBottomNavReservedInset(safeBottom: number) {
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

  const handleTabPress = useCallback(
    (tab: TabName) => {
      void triggerHaptic('medium');
      onTabChange(tab);
    },
    [onTabChange],
  );

  const { isTablet } = useDeviceLayout();
  const visibleTabs = hideTabs?.length ? TABS.filter((t) => !hideTabs.includes(t.name)) : TABS;

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
