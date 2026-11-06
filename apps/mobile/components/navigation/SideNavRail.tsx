import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getSideRailFootGap,
  getSideRailTopGap,
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
 * The tab bar on iPhone Duo and iPad. The Duo moves app bars into a strip
 * down the side of the display, below its clock and camera, so the tabs run
 * down that strip here with the + button at the foot. On iPad the rail is a
 * sidebar at the top of the leading edge, with the + under it. AddFab
 * positions itself into the slot kept for it, and the pill stays put whether
 * or not the + is showing, so the tabs never jump when switching pages.
 */
export function SideNavRail({ tabs, activeTab, onTabChange, onRailPillEnd }: TabNavProps) {
  const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets();
  const { navEdge, navRailInset, navRailAlign } = useDeviceLayout();
  const handleTabPress = useTabPressHandler(onTabChange);
  const atTop = navRailAlign === 'top';

  return (
    <View
      pointerEvents="box-none"
      className={`absolute top-0 bottom-0 items-center ${atTop ? 'justify-start' : 'justify-end'}`}
      style={{
        [navEdge]: 0,
        width: navRailInset,
        ...(atTop
          ? { paddingTop: getSideRailTopGap(safeTop) }
          : { paddingBottom: getSideRailFootGap(safeBottom) + SIDE_RAIL_FAB_SLOT }),
        zIndex: NAV_OVERLAY_Z_INDEX,
      }}
    >
      <View
        onLayout={
          atTop && onRailPillEnd
            ? (event) => onRailPillEnd(event.nativeEvent.layout.y + event.nativeEvent.layout.height)
            : undefined
        }
      >
        <NavSurface axis="vertical" thickness={SIDE_RAIL_PILL_WIDTH}>
          {tabs.map((tab) => (
            <NavItem
              key={tab}
              tab={tab}
              tabs={tabs}
              axis="vertical"
              isActive={activeTab === tab}
              onPressTab={handleTabPress}
            />
          ))}
        </NavSurface>
      </View>
    </View>
  );
}
