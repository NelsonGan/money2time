import React from 'react';
import { View } from 'react-native';

import { Mascot, type MascotName } from '~/components/feedback/Mascot';
import { Text } from '~/components/ui';

/** Shared mascot size so every onboarding page matches. */
export const ONBOARDING_HEADER_MASCOT_SIZE = 64;

interface OnboardingStepHeaderProps {
  title: string;
  subtitle?: string;
  mascot?: MascotName;
}

/**
 * Every step opens the same way: a small mascot sticker, a large left-aligned
 * title, and at most one short line under it.
 */
export function OnboardingStepHeader({ title, subtitle, mascot }: OnboardingStepHeaderProps) {
  return (
    <View className="pt-2">
      {/* Still, not bobbing: onboarding pages are a reading task, and a mascot
          drifting up and down pulls the eye off the title. */}
      {mascot ? (
        <View className="mb-3 self-start">
          <Mascot size={ONBOARDING_HEADER_MASCOT_SIZE} name={mascot} animate={false} />
        </View>
      ) : null}
      <Text variant="title" className="text-foreground" accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="friendly" tone="muted" className="mt-2">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
