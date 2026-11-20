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
      <View className="px-5 pt-3">
        <Button haptic="none" disabled={primaryDisabled} onPress={onPrimary}>
          <Text>{primaryLabel}</Text>
        </Button>
        {/* The link row is always there, empty when a step has no link, so the
            button sits at the same height on every step. */}
        <View className="mt-1 h-10 items-center justify-center">
          {secondary ? (
            <Pressable
              onPress={secondary.onPress}
              hitSlop={8}
              className="px-4 py-2"
              accessibilityRole="button"
              accessibilityLabel={secondary.label}
            >
              <Text variant="caption" tone="muted">
                {secondary.label}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
