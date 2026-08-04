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
  compact?: boolean;
}

export function EmptyState({
  title,
  message,
  mascotMood = 'thinking',
  mascotName,
  action,
  animateIn = true,
  compact = false,
}: EmptyStateProps) {
  const themeColors = useThemeColors();
  const mascotCircleSize = compact ? 96 : 160;
  const mascotSize = compact ? 88 : 150;

  return (
    <Animated.View entering={animateIn ? FadeIn.duration(400) : undefined}>
      <View
        className={
          compact
            ? 'items-center justify-center py-6 px-6 relative overflow-hidden'
            : 'items-center justify-center py-16 px-8 relative overflow-hidden'
        }
      >
        {!compact ? (
          <>
            {/* Decorative background circles */}
            <View
              className="absolute top-6 left-1/4 h-32 w-32 rounded-full"
              style={{ backgroundColor: themeColors.primary, opacity: 0.03 }}
            />
            <View
              className="absolute bottom-10 right-1/4 h-20 w-20 rounded-full"
              style={{ backgroundColor: themeColors.accent, opacity: 0.04 }}
            />
          </>
        ) : null}

        {/* A plain fade, not a spring: the mascot overshooting and settling reads
            as a toy bounce on what is meant to be a calm, empty screen. */}
        <Animated.View
          entering={animateIn ? FadeInDown.delay(100).duration(400) : undefined}
          className="rounded-full bg-primary/6 items-center justify-center"
          style={{ width: mascotCircleSize, height: mascotCircleSize }}
        >
          <Mascot size={mascotSize} animate={false} name={mascotName} mood={mascotMood} />
        </Animated.View>
        <Text
          variant={compact ? 'subheading' : 'heading'}
          className={compact ? 'mt-3 text-center' : 'mt-5 text-center'}
        >
          {title}
        </Text>
        {message ? (
          <Text
            variant={compact ? 'caption' : 'body'}
            tone="muted"
            className={
              compact ? 'text-center mt-1 max-w-[260px]' : 'text-center mt-2 max-w-[280px]'
            }
          >
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
