import React from 'react';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '~/constants/designSystem';

import { ThemeModal } from './theme-modal';

interface PromptSheetProps {
  visible: boolean;
  /** Back button and a tap outside the card. */
  onDismiss: () => void;
  children: React.ReactNode;
}

/** A one-time offer: a rounded card at the bottom over a dimmed screen. */
export function PromptSheet({ visible, onDismiss, children }: PromptSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      <Pressable
        className="flex-1 justify-end bg-black/50 px-4"
        style={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }}
        onPress={onDismiss}
      >
        <Pressable
          onPress={(event) => event.stopPropagation()}
          className="overflow-hidden rounded-[30px] border border-border/30 bg-background shadow-float"
        >
          {children}
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}
