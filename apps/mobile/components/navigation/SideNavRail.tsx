import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getSideRailFootGap,
  SIDE_RAIL_FAB_SLOT,
  SIDE_RAIL_PILL_WIDTH,
} from '~/components/navigation/floatingNav';
import {
  NAV_OVERLAY_Z_INDEX,
  NavItem,
  NavSurface,
  type TabNavProps,
  useTabPressHandler,
} from '~/components/navigation/NavChrome';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';

/**
 * The tab bar on iPhone Duo. The Duo moves app bars into a strip down the
 * side of the display, below its clock and camera, so the tabs run down that
 * strip here with the + button at the foot (AddFab positions itself into the
 * slot kept for it). The pill stays put whether or not the + is showing, so
 * the tabs never jump when switching pages.
 */
export function SideNavRail({ tabs, activeTab, onTabChange }: TabNavProps) {
  const { bottom: safeBottom } = useSafeAreaInsets();
  const { navEdge, navRailInset } = useDeviceLayout();
  const handleTabPress = useTabPressHandler(onTabChange);

  return (
    <View
      pointerEvents="box-none"
      className="absolute top-0 bottom-0 items-center justify-end"
      style={{
        [navEdge]: 0,
        width: navRailInset,
        paddingBottom: getSideRailFootGap(safeBottom) + SIDE_RAIL_FAB_SLOT,
        zIndex: NAV_OVERLAY_Z_INDEX,
      }}
    >
      <NavSurface axis="vertical" thickness={SIDE_RAIL_PILL_WIDTH}>
        {tabs.map((tab) => (
          <NavItem
            key={tab}
            tab={tab}
            axis="vertical"
            isActive={activeTab === tab}
            onPressTab={handleTabPress}
          />
        ))}
      </NavSurface>
    </View>
  );
}
