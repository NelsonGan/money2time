import React from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { Text } from '~/components/ui/text';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

export type AssetsTab = 'accounts' | 'items';

interface AssetsTabBarProps {
  active: AssetsTab;
  onChange: (tab: AssetsTab) => void;
  tabs: { value: AssetsTab; label: string }[];
}

/** Underline tab bar that switches the assets page between accounts and items. */
export function AssetsTabBar({ active, onChange, tabs }: AssetsTabBarProps) {
  const themeColors = useThemeColors();
  const { width: screenWidth } = useWindowDimensions();
  const isSmallScreen = screenWidth < 380;

  return (
    <ScrollView
      horizontal
      className="flex-1"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 24, paddingHorizontal: 20, paddingTop: 8 }}
    >
      {tabs.map((tab) => {
        const isActive = tab.value === active;
        return (
          <Pressable
            key={tab.value}
            onPress={() => {
              if (isActive) return;
              void triggerHaptic('selection');
              onChange(tab.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            className="pb-2"
          >
            <Text
              variant={isSmallScreen ? 'subheading' : 'headingSm'}
              className={cn(
                'tracking-tight',
                isActive ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {tab.label}
            </Text>
            <View
              className="h-0.5 mt-1.5 rounded-full"
              style={{ backgroundColor: isActive ? themeColors.primary : 'transparent' }}
            />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
