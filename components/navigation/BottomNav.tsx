import { BarChart2, House, Landmark, Settings, Wallet } from 'lucide-react-native';
import React, { memo, useCallback } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Text } from '~/components/ui/text';
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
}

const TABS: { name: TabName; labelKey: string; icon: typeof House }[] = [
  { name: 'transactions', labelKey: 'nav.activity', icon: Wallet },
  { name: 'account', labelKey: 'nav.account', icon: Landmark },
  { name: 'home', labelKey: 'nav.home', icon: House },
  { name: 'insights', labelKey: 'nav.insights', icon: BarChart2 },
  { name: 'settings', labelKey: 'nav.settings', icon: Settings },
];

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

export function BottomNav({ activeTab, onTabChange, hideTabs }: BottomNavProps) {
  const themeColors = useThemeColors();
  const handleTabPress = useCallback(
    (tab: TabName) => {
      void triggerHaptic('medium');
      onTabChange(tab);
    },
    [onTabChange],
  );

  const visibleTabs = hideTabs?.length ? TABS.filter((t) => !hideTabs.includes(t.name)) : TABS;

  return (
    <View className="bg-card border-t border-border/40 pb-7">
      <View className="flex-row items-center px-1 py-1.5">
        {visibleTabs.map((tab) => (
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
        ))}
      </View>
    </View>
  );
}
