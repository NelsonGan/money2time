import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { I18n } from '~/lib/i18n';

interface OnboardingModeStepProps {
  onBack: () => void;
  onSelectSimple: () => void;
  onSelectPower: () => void;
}

export function OnboardingModeStep({
  onBack,
  onSelectSimple,
  onSelectPower,
}: OnboardingModeStepProps) {
  const themeColors = useThemeColors();
  const [selected, setSelected] = useState<'simple' | 'power' | null>(null);

  const handleContinue = () => {
    if (!selected) return;
    void triggerHaptic('medium');
    if (selected === 'simple') onSelectSimple();
    else onSelectPower();
  };

  return (
    <View className="flex-1">
      <View className="flex-1 px-6 pt-6">
        <Animated.View entering={FadeIn.delay(100).duration(400)}>
          <Text variant="label" tone="muted" className="text-center uppercase tracking-wider">
            {I18n.t('onboarding.mode.step_label')}
          </Text>
          <Text variant="display" className="text-center mt-2 text-foreground">
            {I18n.t('onboarding.mode.title')}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(200).duration(400)} className="mt-3">
          <Text variant="friendly" tone="secondary" className="text-center px-2">
            {I18n.t('onboarding.mode.subtitle')}
          </Text>
        </Animated.View>

        <Animated.View entering={FadeIn.delay(350).duration(500)} className="mt-6 gap-4">
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              setSelected('simple');
            }}
            style={{
              borderRadius: 16,
              borderWidth: selected === 'simple' ? 2 : 1,
              borderColor:
                selected === 'simple' ? themeColors.primary : themeColors.textMuted + '30',
              backgroundColor:
                selected === 'simple' ? themeColors.primarySoft : themeColors.surface,
            }}
          >
            <View style={{ paddingVertical: 20, paddingHorizontal: 20 }}>
              <Text style={{ fontSize: 28, lineHeight: 36 }}>✨</Text>
              <Text variant="heading" className="text-foreground mt-2">
                {I18n.t('onboarding.mode.simple_title')}
              </Text>
              <Text variant="body" tone="secondary" className="mt-1">
                {I18n.t('onboarding.mode.simple_description')}
              </Text>
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              setSelected('power');
            }}
            style={{
              borderRadius: 16,
              borderWidth: selected === 'power' ? 2 : 1,
              borderColor:
                selected === 'power' ? themeColors.primary : themeColors.textMuted + '30',
              backgroundColor: selected === 'power' ? themeColors.primarySoft : themeColors.surface,
            }}
          >
            <View style={{ paddingVertical: 20, paddingHorizontal: 20 }}>
              <Text style={{ fontSize: 28, lineHeight: 36 }}>⚡️</Text>
              <Text variant="heading" className="text-foreground mt-2">
                {I18n.t('onboarding.mode.power_title')}
              </Text>
              <Text variant="body" tone="secondary" className="mt-1">
                {I18n.t('onboarding.mode.power_description')}
              </Text>
            </View>
          </Pressable>
        </Animated.View>
      </View>

      <View className="absolute bottom-0 left-0 right-0 bg-background/95 border-t border-border/20 px-6 pb-12 pt-4">
        <View className="flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onPress={() => {
              void triggerHaptic('selection');
              onBack();
            }}
          >
            <Text>{I18n.t('common.back')}</Text>
          </Button>
          <Button className="flex-[2]" disabled={!selected} onPress={handleContinue}>
            <Text>{I18n.t('common.continue')}</Text>
          </Button>
        </View>
      </View>
    </View>
  );
}
