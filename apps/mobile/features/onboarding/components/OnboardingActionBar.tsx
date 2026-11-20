import React from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '~/components/ui';

export interface OnboardingSecondaryAction {
  label: string;
  onPress: () => void;
}

interface OnboardingActionBarProps {
  onPrimary: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  /** A quiet text link under the button ("Not now", "Skip for now"). */
  secondary?: OnboardingSecondaryAction;
}

/**
 * One full-width button at the foot of every step, with an optional text link
 * under it. Going back is the top bar's chevron (or an edge swipe), so the bar
 * never carries a second button.
 */
export function OnboardingActionBar({
  onPrimary,
  primaryLabel,
  primaryDisabled = false,
  secondary,
}: OnboardingActionBarProps) {
  return (
    <SafeAreaView edges={['bottom']} className="bg-background">
      <View className="px-5 pt-3 pb-2">
        <Button haptic="none" disabled={primaryDisabled} onPress={onPrimary}>
          <Text>{primaryLabel}</Text>
        </Button>
        {secondary ? (
          <Pressable
            onPress={secondary.onPress}
            className="mt-1 items-center py-2.5"
            accessibilityRole="button"
            accessibilityLabel={secondary.label}
          >
            <Text variant="caption" tone="muted">
              {secondary.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
