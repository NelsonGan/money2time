import React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';

import { Mascot } from './Mascot';

interface EmptyStateProps {
  title: string;
  message: string;
  mascotMood?: 'happy' | 'thinking' | 'sleepy' | 'curious' | 'proud';
  action?: { label: string; onPress: () => void };
  animateIn?: boolean;
}

export function EmptyState({
  title,
  message,
  mascotMood = 'thinking',
  action,
  animateIn = true,
}: EmptyStateProps) {
  return (
    <Animated.View entering={animateIn ? FadeIn.duration(400).springify() : undefined}>
      <View className="items-center justify-center py-14 px-8">
        <View className="w-[140px] h-[140px] rounded-full bg-primary/8 items-center justify-center mb-2">
          <Mascot size={120} mood={mascotMood} animate={false} />
        </View>
        <Text variant="subheading" className="mt-4 text-center">
          {title}
        </Text>
        <Text variant="friendly" tone="muted" className="text-center mt-2">
          {message}
        </Text>
        {action ? (
          <Button variant="warm" size="sm" className="mt-5" onPress={action.onPress}>
            <Text>{action.label}</Text>
          </Button>
        ) : null}
      </View>
    </Animated.View>
  );
}
