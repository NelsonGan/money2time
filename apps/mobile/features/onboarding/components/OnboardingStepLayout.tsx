import React, { useCallback, useEffect, useRef } from 'react';
import { Keyboard, ScrollView, type ScrollViewInstance, TextInput, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MascotName } from '~/components/feedback/Mascot';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';

import { OnboardingActionBar, type OnboardingSecondaryAction } from './OnboardingActionBar';
import { OnboardingStepHeader } from './OnboardingStepHeader';

/** Room kept above the focused field when the keyboard scrolls it into view. */
const FOCUSED_FIELD_MARGIN = 16;

interface OnboardingStepLayoutProps {
  /** Left out where the page has a header of its own (Settings › Hourly value). */
  title?: string;
  subtitle?: string;
  mascot?: MascotName;
  /** Edge-swipe target; the top bar's chevron goes to the same place. */
  onBack?: () => void;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  secondary?: OnboardingSecondaryAction;
  /**
   * When the keyboard opens, scroll as far down as the focused field allows,
   * so what it changes below it (the hourly value) stays in view with it.
   */
  revealBelowOnKeyboard?: boolean;
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
  revealBelowOnKeyboard = false,
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

  const contentHeight = useRef(0);
  const keyboardOpen = useRef(false);

  // The end, unless that would push the focused field off the top. The
  // viewport is measured now, not taken from the last layout, since the
  // button bar has only just ridden up with the keyboard.
  const revealBelow = useCallback(() => {
    const scroll = scrollRef.current;
    const field = TextInput.State.currentlyFocusedInput();
    const content = scroll?.getInnerViewRef();
    if (!scroll || !field || !content) {
      scroll?.scrollToEnd({ animated: true });
      return;
    }
    scroll.measure((_x, _y, _width, viewportHeight) => {
      const endY = Math.max(0, contentHeight.current - viewportHeight);
      field.measureLayout(
        content,
        (_fieldX, fieldY) => {
          const fieldTop = Math.max(0, fieldY - FOCUSED_FIELD_MARGIN);
          scroll.scrollTo({ y: Math.min(endY, fieldTop), animated: true });
        },
        () => scroll.scrollToEnd({ animated: true }),
      );
    });
  }, []);

  useEffect(() => {
    if (!revealBelowOnKeyboard) return undefined;
    const shown = Keyboard.addListener('keyboardDidShow', () => {
      keyboardOpen.current = true;
      revealBelow();
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardOpen.current = false;
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [revealBelowOnKeyboard, revealBelow]);

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
          onContentSizeChange={(_width, height) => {
            const grew = height > contentHeight.current;
            contentHeight.current = height;
            // What a field changes can grow while the keyboard is up (the
            // hourly value's breakdown appears once extra time counts); keep
            // it in view as the keyboard's own reveal did.
            if (grew && revealBelowOnKeyboard && keyboardOpen.current) revealBelow();
          }}
        >
          {title ? (
            <>
              <OnboardingStepHeader title={title} subtitle={subtitle} mascot={mascot} />
              <View className="mt-6">{children}</View>
            </>
          ) : (
            <View className="pt-2">{children}</View>
          )}
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
