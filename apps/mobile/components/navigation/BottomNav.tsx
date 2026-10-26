import React from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBottomNavMinimize } from '~/components/navigation/BottomNavMinimize';
import { FLOATING_NAV_HEIGHT, getFloatingNavBottomGap } from '~/components/navigation/floatingNav';
import {
  NAV_OVERLAY_Z_INDEX,
  NavItem,
  NavSurface,
  type TabNavProps,
  useTabPressHandler,
} from '~/components/navigation/NavChrome';
import type { TabName } from '~/components/navigation/navTabs';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';

export type { TabName };

const FLOATING_NAV_MARGIN_H = 20;
const FLOATING_NAV_MAX_WIDTH = 520;
// How far the bar shrinks/sinks when minimized on scroll.
const FLOATING_MINIMIZE_SCALE = 0.88;
const FLOATING_MINIMIZE_TRANSLATE_Y = 12;
const FLOATING_MINIMIZE_OPACITY = 0.8;

export function BottomNav({ tabs, activeTab, onTabChange }: TabNavProps) {
  const { bottom: safeBottom } = useSafeAreaInsets();
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

  const handleTabPress = useTabPressHandler(onTabChange);
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
        <NavSurface axis="horizontal" thickness={FLOATING_NAV_HEIGHT}>
          {tabs.map((tab) => (
            <NavItem
              key={tab}
              tab={tab}
              axis="horizontal"
              isActive={activeTab === tab}
              onPressTab={handleTabPress}
            />
          ))}
        </NavSurface>
      </Animated.View>
    </View>
  );
}
