import { Image, type ImageSource } from 'expo-image';
import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import type { MascotName } from '~/components/feedback/Mascot';
import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';

import type { OnboardingSecondaryAction } from './OnboardingActionBar';
import { OnboardingStepLayout } from './OnboardingStepLayout';

export interface OnboardingFeature {
  title: string;
  subtitle: string;
  /** A line icon in a tinted tile, or an illustration in its place. */
  icon?: LucideIcon;
  image?: ImageSource;
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
 * notifications), each a picture or icon, a title and one line.
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
  const themeColors = useThemeColors();

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
            className="flex-row items-center gap-4 rounded-[22px] border border-border/40 bg-card px-4 py-4"
          >
            {feature.image ? (
              <Image
                source={feature.image}
                style={{ width: 64, height: 64 }}
                contentFit="contain"
                accessible={false}
              />
            ) : feature.icon ? (
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <feature.icon size={22} color={themeColors.primary} />
              </View>
            ) : null}
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
