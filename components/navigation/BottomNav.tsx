import { BarChart2, House, Landmark, Plus, Settings, Wallet } from 'lucide-react-native';
import React, { memo, useCallback } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Path, Svg } from 'react-native-svg';

import { Text } from '~/components/ui';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

export type TabName = 'transactions' | 'account' | 'home' | 'insights' | 'settings';

interface BottomNavProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  hideTabs?: TabName[];
  onPressAdd?: () => void;
}

const TABS: { name: TabName; labelKey: string; icon: typeof House }[] = [
  { name: 'transactions', labelKey: 'nav.activity', icon: Wallet },
  { name: 'account', labelKey: 'nav.account', icon: Landmark },
  { name: 'home', labelKey: 'nav.home', icon: House },
  { name: 'insights', labelKey: 'nav.insights', icon: BarChart2 },
  { name: 'settings', labelKey: 'nav.settings', icon: Settings },
];

const NAV_CONTENT_HEIGHT = 62;
const FAB_SIZE = 60;
// Arc radius — slightly larger than FAB radius so it snugly curves around it
const ARC_R = 36;

const NavItem = memo(function NavItem({
  tab,
  icon: Icon,
  label,
  isActive,
  onPressTab,
  tintActive,
  tintInactive,
}: {
  tab: TabName;
  icon: typeof House;
  label: string;
  isActive: boolean;
  onPressTab: (tab: TabName) => void;
  tintActive: string;
  tintInactive: string;
}) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.92 });
  const handlePress = useCallback(() => onPressTab(tab), [onPressTab, tab]);

  return (
    <Animated.View style={animatedStyle} className="flex-1">
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className={cn('items-center gap-1 py-2 rounded-2xl mx-0.5', isActive && 'bg-primary/10')}
      >
        <Icon size={18} color={isActive ? tintActive : tintInactive} />
        <Text variant="label" className={cn(isActive ? 'text-primary' : 'text-muted-foreground')}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
});

export function BottomNav({ activeTab, onTabChange, hideTabs, onPressAdd }: BottomNavProps) {
  const themeColors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const { bottom: safeBottom } = useSafeAreaInsets();

  const handleTabPress = useCallback(
    (tab: TabName) => {
      void triggerHaptic('medium');
      onTabChange(tab);
    },
    [onTabChange],
  );
  const handlePressAdd = useCallback(() => {
    void triggerHaptic('medium');
    onPressAdd?.();
  }, [onPressAdd]);

  const visibleTabs = hideTabs?.length ? TABS.filter((t) => !hideTabs.includes(t.name)) : TABS;
  const midIndex = Math.floor(visibleTabs.length / 2);
  const showAddButton = !!onPressAdd;

  const totalHeight = NAV_CONTENT_HEIGHT + safeBottom;
  const cx = screenWidth / 2;

  // Perfect semicircle dent: horizontal line meets arc tangentially (no sharp corner)
  // Arc center is at (cx, 0) — top edge of the nav — radius ARC_R dips straight down
  const bgPath = [
    `M 0 0`,
    `H ${cx - ARC_R}`,
    `A ${ARC_R} ${ARC_R} 0 0 1 ${cx + ARC_R} 0`,
    `H ${screenWidth}`,
    `V ${totalHeight}`,
    `H 0`,
    `Z`,
  ].join(' ');

  const borderPath = [
    `M 0 0`,
    `H ${cx - ARC_R}`,
    `A ${ARC_R} ${ARC_R} 0 0 1 ${cx + ARC_R} 0`,
    `H ${screenWidth}`,
  ].join(' ');

  // FAB center sits at the arc center (cx, 0) — half above, half inside the dent
  const fabTop = -(FAB_SIZE / 2);

  const renderTabs = (tabs: typeof visibleTabs) =>
    tabs.map((tab) => (
      <NavItem
        key={tab.name}
        tab={tab.name}
        icon={tab.icon}
        label={I18n.t(tab.labelKey)}
        isActive={activeTab === tab.name}
        tintActive={themeColors.primary}
        tintInactive={themeColors.textMuted}
        onPressTab={handleTabPress}
      />
    ));

  return (
    <View style={{ height: totalHeight, overflow: 'visible' }}>
      {/* SVG curved background */}
      <Svg
        width={screenWidth}
        height={totalHeight}
        style={{ position: 'absolute', top: 0, left: 0 }}
      >
        <Path d={bgPath} fill={themeColors.card} />
        <Path d={borderPath} fill="none" stroke={themeColors.border} strokeWidth={0.8} />
      </Svg>

      {/* Protruding FAB */}
      {showAddButton ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            top: fabTop,
            left: 0,
            right: 0,
            height: FAB_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20,
          }}
        >
          <Pressable
            onPress={handlePressAdd}
            accessibilityRole="button"
            style={{
              width: FAB_SIZE,
              height: FAB_SIZE,
              borderRadius: FAB_SIZE / 2,
              backgroundColor: themeColors.primary,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Plus size={28} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : null}

      {/* Tab row */}
      <View
        style={{
          flexDirection: 'row',
          height: NAV_CONTENT_HEIGHT,
          alignItems: 'center',
          paddingHorizontal: 4,
        }}
      >
        {showAddButton ? (
          <>
            {renderTabs(visibleTabs.slice(0, midIndex))}
            {/* Spacer under the FAB — matches the arc diameter */}
            <View style={{ width: ARC_R * 2 + 16 }} />
            {renderTabs(visibleTabs.slice(midIndex))}
          </>
        ) : (
          renderTabs(visibleTabs)
        )}
      </View>
    </View>
  );
}
