import { Image, type ImageSource } from 'expo-image';
import React from 'react';
import { View } from 'react-native';

import type { MascotName } from '~/components/feedback/Mascot';
import { Text } from '~/components/ui';

import { ONBOARDING_CARD } from '../constants/styles';
import type { OnboardingSecondaryAction } from './OnboardingActionBar';
import { OnboardingStepLayout } from './OnboardingStepLayout';

export interface OnboardingFeature {
  title: string;
  subtitle: string;
  /** A crayon illustration in the mascot's style. */
  image: ImageSource;
}

interface OnboardingFeatureListStepProps {
  title: string;
  subtitle?: string;
  mascot?: MascotName;
  features: OnboardingFeature[];
  onBack: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  secondary?: OnboardingSecondaryAction;
}

/**
 * A step that pitches something as a short list of cards (automations, backup,
 * notifications), each a crayon picture, a title and one line.
 */
export function OnboardingFeatureListStep({
  title,
  subtitle,
  mascot,
  features,
  onBack,
  primaryLabel,
  onPrimary,
  secondary,
}: OnboardingFeatureListStepProps) {
  return (
    <OnboardingStepLayout
      title={title}
      subtitle={subtitle}
      mascot={mascot}
      onBack={onBack}
      primaryLabel={primaryLabel}
      onPrimary={onPrimary}
      secondary={secondary}
    >
      <View className="gap-3">
        {features.map((feature) => (
          <View
            key={feature.title}
            className={`flex-row items-center gap-4 px-4 py-3 ${ONBOARDING_CARD}`}
          >
            <Image
              source={feature.image}
              style={{ width: 56, height: 56 }}
              contentFit="contain"
              accessible={false}
            />
            <View className="flex-1">
              <Text variant="bodyStrong" className="text-foreground">
                {feature.title}
              </Text>
              <Text variant="caption" tone="muted" className="mt-0.5">
                {feature.subtitle}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </OnboardingStepLayout>
  );
}
