import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { ThemeModal } from '~/components/ui/theme-modal';

import { LoadingDots } from './LoadingDots';
import { Mascot, type MascotName } from './Mascot';

interface ImportingOverlayProps {
  visible: boolean;
  title: string;
  mascot?: MascotName;
}

export function ImportingOverlay({ visible, title, mascot = 'laptop' }: ImportingOverlayProps) {
  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      // Swallow Android hardware-back so the import can't be cancelled mid-flight.
      onRequestClose={() => {}}
    >
      <View className="flex-1 bg-foreground/35 items-center justify-center px-6">
        <View className="w-full max-w-[360px] rounded-[24px] border border-border/35 bg-card px-6 py-7 items-center">
          <Mascot size={120} name={mascot} animate />
          <Text variant="subheading" className="mt-4 text-center text-foreground">
            {title}
          </Text>
          <View className="mt-4">
            <LoadingDots size="small" />
          </View>
        </View>
      </View>
    </ThemeModal>
  );
}
