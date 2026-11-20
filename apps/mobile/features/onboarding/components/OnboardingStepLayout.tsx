import React, { useEffect, useRef } from 'react';
import { Keyboard, ScrollView, type ScrollViewInstance, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { FadeIn, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  /** Scroll to the end when the keyboard opens, so what a field changes stays in view. */
  scrollToEndOnKeyboard?: boolean;
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
  scrollToEndOnKeyboard = false,
  children,
}: OnboardingStepLayoutProps) {
  const swipeBackGesture = useEdgeSwipeBack(onBack);
  const scrollRef = useRef<ScrollViewInstance>(null);
  // The button bar rides on the keyboard. Its own bottom padding already covers
  // the home indicator, so the keyboard only adds what is left above that.
  const keyboard = useReanimatedKeyboardAnimation();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const barStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(0, -keyboard.height.value - bottomInset),
  }));

  useEffect(() => {
    if (!scrollToEndOnKeyboard) return undefined;
    const subscription = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => subscription.remove();
  }, [scrollToEndOnKeyboard]);

  return (
    <GestureDetector gesture={swipeBackGesture}>
      <View className="flex-1">
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="px-5 pb-6"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <OnboardingStepHeader title={title} subtitle={subtitle} mascot={mascot} />
          <Animated.View entering={FadeIn.delay(120).duration(280)} className="mt-6">
            {children}
          </Animated.View>
        </ScrollView>
        <Animated.View style={barStyle}>
          <OnboardingActionBar
            onPrimary={onPrimary}
            primaryLabel={primaryLabel}
            primaryDisabled={primaryDisabled}
            secondary={secondary}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
