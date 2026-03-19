import React, { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { OnboardingActionBar } from '~/features/onboarding/components/OnboardingActionBar';
import { OnboardingChoiceCard } from '~/features/onboarding/components/OnboardingChoiceCard';
import { OnboardingStepHeader } from '~/features/onboarding/components/OnboardingStepHeader';
import {
  ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  ONBOARDING_HORIZONTAL_PADDING,
} from '~/features/onboarding/constants/layout';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface OnboardingModeStepProps {
  onBack: () => void;
  onSelectSimple: () => void;
  onSelectPower: () => void;
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingHorizontal: ONBOARDING_HORIZONTAL_PADDING,
    paddingBottom: ONBOARDING_ACTION_BAR_RESERVED_SPACE,
  },
});

export function OnboardingModeStep({
  onBack,
  onSelectSimple,
  onSelectPower,
}: OnboardingModeStepProps) {
  const swipeBackGesture = useEdgeSwipeBack(onBack);
  const [selected, setSelected] = useState<'simple' | 'power' | null>(null);
  const { height: windowHeight } = useWindowDimensions();
  const isCompact = windowHeight < 700;

  const handleContinue = () => {
    if (!selected) return;
    void triggerHaptic('medium');
    if (selected === 'simple') onSelectSimple();
    else onSelectPower();
  };

  return (
    <GestureDetector gesture={swipeBackGesture}>
      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <OnboardingStepHeader title={I18n.t('onboarding.mode.title')} />

          <Animated.View
            entering={FadeIn.delay(150).duration(300)}
            className={isCompact ? 'mt-4 gap-3' : 'mt-8 gap-4'}
          >
            <OnboardingChoiceCard
              title={I18n.t('onboarding.mode.simple_title')}
              description={I18n.t('onboarding.mode.simple_description')}
              selected={selected === 'simple'}
              centered
              onPress={() => {
                void triggerHaptic('selection');
                setSelected('simple');
              }}
              accessibilityLabel={I18n.t('onboarding.mode.simple_title')}
            />

            <OnboardingChoiceCard
              title={I18n.t('onboarding.mode.power_title')}
              description={I18n.t('onboarding.mode.power_description')}
              selected={selected === 'power'}
              centered
              onPress={() => {
                void triggerHaptic('selection');
                setSelected('power');
              }}
              accessibilityLabel={I18n.t('onboarding.mode.power_title')}
            />
          </Animated.View>

          <Text variant="caption" tone="muted" className="mt-4 text-center">
            {I18n.t('onboarding.mode.subtitle')}
          </Text>
        </ScrollView>

        <OnboardingActionBar
          onBack={() => {
            void triggerHaptic('selection');
            onBack();
          }}
          onPrimary={handleContinue}
          primaryLabel={I18n.t('common.continue')}
          primaryDisabled={!selected}
        />
      </View>
    </GestureDetector>
  );
}
