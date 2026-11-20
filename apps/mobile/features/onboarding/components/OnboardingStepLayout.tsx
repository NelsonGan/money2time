import React from 'react';
import { ScrollView, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn } from 'react-native-reanimated';

import type { MascotName } from '~/components/feedback/Mascot';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';

import { OnboardingActionBar, type OnboardingSecondaryAction } from './OnboardingActionBar';
import { OnboardingStepHeader } from './OnboardingStepHeader';

interface OnboardingStepLayoutProps {
  title: string;
  subtitle?: string;
  mascot?: MascotName;
  /** Edge-swipe target; the top bar's chevron goes to the same place. */
  onBack?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondary?: OnboardingSecondaryAction;
  children: React.ReactNode;
}

/**
 * The frame every onboarding step shares: header, a scrolling body, and the
 * button bar, which rides up with the keyboard on steps that have a field.
 */
export function OnboardingStepLayout({
  title,
  subtitle,
  mascot,
  onBack,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  secondary,
  children,
}: OnboardingStepLayoutProps) {
  const swipeBackGesture = useEdgeSwipeBack(onBack);

  return (
    <GestureDetector gesture={swipeBackGesture}>
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-6"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <OnboardingStepHeader title={title} subtitle={subtitle} mascot={mascot} />
          <Animated.View entering={FadeIn.delay(120).duration(280)} className="mt-6">
            {children}
          </Animated.View>
        </ScrollView>
        <View>
          <OnboardingActionBar
            onPrimary={onPrimary}
            primaryLabel={primaryLabel}
            primaryDisabled={primaryDisabled}
            secondary={secondary}
          />
        </View>
      </KeyboardAvoidingView>
    </GestureDetector>
  );
}
