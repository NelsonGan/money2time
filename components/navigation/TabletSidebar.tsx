import { CalendarDays, Plus } from 'lucide-react-native';
import React, { memo, useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Mascot } from '~/components/feedback/Mascot';
import { MAIN_TABS, type NavIconComponent, type TabName } from '~/components/navigation/BottomNav';
import { ClayIcon, type ClayIconName } from '~/components/ui/ClayIcon';
import { Text } from '~/components/ui/text';
import { useIsFlatIcons } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { TABLET_SIDEBAR_WIDTH } from '~/utils/deviceLayout';

interface TabletSidebarProps {
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  onAddTransaction: () => void;
  onToday: () => void;
  hideContextActions?: boolean;
}

const SidebarItem = memo(function SidebarItem({
  tab,
  labelKey,
  icon,
  activeIcon,
  FlatIcon,
  active,
  onPressTab,
}: {
  tab: TabName;
  labelKey: string;
  icon: ClayIconName;
  activeIcon: ClayIconName;
  FlatIcon: NavIconComponent;
  active: boolean;
  onPressTab: (tab: TabName) => void;
}) {
  const isFlat = useIsFlatIcons();
  const themeColors = useThemeColors();
  const onPress = useCallback(() => onPressTab(tab), [onPressTab, tab]);

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={I18n.t(labelKey)}
      onPress={onPress}
      className={cn(
        'h-12 flex-row items-center gap-3 rounded-2xl px-3 active:opacity-80',
        active ? 'bg-primary/10' : 'bg-transparent',
      )}
    >
      <View className="h-8 w-8 items-center justify-center">
        {isFlat ? (
          <FlatIcon
            size={23}
            color={active ? themeColors.primary : themeColors.textMuted}
            strokeWidth={active ? 2.2 : 1.7}
            filled={active}
          />
        ) : (
          <ClayIcon name={active ? activeIcon : icon} size={28} opacity={active ? 1 : 0.72} />
        )}
      </View>
      <Text variant="bodyStrong" tone={active ? 'primary' : 'secondary'} numberOfLines={1}>
        {I18n.t(labelKey)}
      </Text>
    </Pressable>
  );
});

export function TabletSidebar({
  activeTab,
  onTabChange,
  onAddTransaction,
  onToday,
  hideContextActions = false,
}: TabletSidebarProps) {
  const themeColors = useThemeColors();
  const handleTabChange = useCallback(
    (tab: TabName) => {
      void triggerHaptic('medium');
      onTabChange(tab);
    },
    [onTabChange],
  );

  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left']}
      className="border-r border-border/35 bg-card"
      style={{ width: TABLET_SIDEBAR_WIDTH }}
    >
      <View className="flex-1 px-3 pb-4 pt-2">
        <View className="mb-5 flex-row items-center gap-2.5 px-1">
          <Mascot name="happy" size={42} />
          <Text variant="subheading" className="flex-1 tracking-tight" numberOfLines={1}>
            {I18n.t('app.name')}
          </Text>
        </View>

        <View className="gap-1">
          {MAIN_TABS.map((tab) => (
            <SidebarItem
              key={tab.name}
              tab={tab.name}
              labelKey={tab.labelKey}
              icon={tab.icon}
              activeIcon={tab.activeIcon}
              FlatIcon={tab.flatIcon}
              active={activeTab === tab.name}
              onPressTab={handleTabChange}
            />
          ))}
        </View>

        <View className="flex-1" />

        {!hideContextActions ? (
          <View className="gap-2">
            {activeTab === 'calendar' ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.today')}
                onPress={() => {
                  void triggerHaptic('selection');
                  onToday();
                }}
                className="h-11 flex-row items-center justify-center gap-2 rounded-2xl border border-border/45 bg-background active:opacity-75"
              >
                <CalendarDays size={18} color={themeColors.textSoft} />
                <Text variant="bodyStrong" tone="secondary">
                  {I18n.t('common.today')}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={I18n.t('onboarding.bootstrap.add_transaction')}
              onPress={() => {
                void triggerHaptic('medium');
                onAddTransaction();
              }}
              className="h-12 flex-row items-center justify-center gap-2 rounded-2xl bg-primary px-3 shadow-soft active:opacity-80"
            >
              <Plus size={20} color={themeColors.background} strokeWidth={2.6} />
              <Text variant="bodyStrong" tone="inverse" numberOfLines={1}>
                {I18n.t('onboarding.bootstrap.add_transaction')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
