import React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';

import { Mascot, type MascotName } from './Mascot';

interface EmptyStateProps {
  title: string;
  message?: string;
  mascotMood?: 'happy' | 'thinking' | 'sleepy' | 'curious' | 'proud';
  mascotName?: MascotName;
  action?: { label: string; onPress: () => void };
  animateIn?: boolean;
}

export function EmptyState({
  title,
  message,
  mascotMood = 'thinking',
  mascotName,
  action,
  animateIn = true,
}: EmptyStateProps) {
  const themeColors = useThemeColors();

  return (
    <Animated.View entering={animateIn ? FadeIn.duration(400).springify() : undefined}>
      <View className="items-center justify-center py-16 px-8 relative overflow-hidden">
        {/* Decorative background circles */}
        <View
          className="absolute top-6 left-1/4 h-32 w-32 rounded-full"
          style={{ backgroundColor: themeColors.primary, opacity: 0.03 }}
        />
        <View
          className="absolute bottom-10 right-1/4 h-20 w-20 rounded-full"
          style={{ backgroundColor: themeColors.accent, opacity: 0.04 }}
        />

        <Animated.View
          entering={
            animateIn ? FadeInDown.delay(100).duration(500).springify().damping(14) : undefined
          }
          className="w-[160px] h-[160px] rounded-full bg-primary/6 items-center justify-center"
        >
          <Mascot size={150} animate={false} name={mascotName} mood={mascotMood} />
        </Animated.View>
        <Text variant="heading" className="mt-5 text-center">
          {title}
        </Text>
        {message ? (
          <Text variant="body" tone="muted" className="text-center mt-2 max-w-[280px]">
            {message}
          </Text>
        ) : null}
        {action ? (
          <Button variant="default" size="sm" className="mt-6 shadow-glow" onPress={action.onPress}>
            <Text>{action.label}</Text>
          </Button>
        ) : null}
      </View>
    </Animated.View>
  );
}
