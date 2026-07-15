import { Image, type ImageSource } from 'expo-image';
import { ImageIcon } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

export type AutoLogTutorialTopic = 'automation' | 'backtap';

interface AutoLogTutorialScreenProps {
  topic: AutoLogTutorialTopic;
  onBack: () => void;
}

/**
 * Every step is wired to its own file in `assets/autolog/`, so replacing the art
 * is a matter of overwriting the file — no code change, no rebuild beyond the
 * usual bundle. Metro needs a literal path, which is why each require is spelled
 * out rather than built from the step key.
 *
 * They currently all point at the same generated placeholder: these steps are
 * screenshots of Shortcuts, Wallet and Accessibility on a *real* iPhone, and a
 * simulator can produce almost none of them (no Wallet card, and no Back Tap
 * without the hardware). A step with no image still falls back to the frame's
 * icon, so `null` remains valid if a step should stay blank.
 */
const STEPS: Record<AutoLogTutorialTopic, { key: string; image: ImageSource | null }[]> = {
  automation: [
    { key: 'tutorial_step_1', image: require('../../../assets/autolog/automation-1.png') },
    { key: 'tutorial_step_2', image: require('../../../assets/autolog/automation-2.png') },
    { key: 'tutorial_step_3', image: require('../../../assets/autolog/automation-3.png') },
    { key: 'tutorial_step_4', image: require('../../../assets/autolog/automation-4.png') },
    { key: 'tutorial_step_5', image: require('../../../assets/autolog/automation-5.png') },
    { key: 'tutorial_step_6', image: require('../../../assets/autolog/automation-6.png') },
    { key: 'tutorial_step_7', image: require('../../../assets/autolog/automation-7.png') },
  ],
  backtap: [
    { key: 'backtap_step_1', image: require('../../../assets/autolog/backtap-1.png') },
    { key: 'backtap_step_2', image: require('../../../assets/autolog/backtap-2.png') },
    { key: 'backtap_step_3', image: require('../../../assets/autolog/backtap-3.png') },
  ],
};

const TITLE_KEY: Record<AutoLogTutorialTopic, string> = {
  automation: 'settings.auto_log.automation_row',
  backtap: 'settings.auto_log.backtap_row',
};

const styles = StyleSheet.create({
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },
  frame: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameImage: {
    width: '100%',
    height: '100%',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  caption: {
    minHeight: 72,
  },
  nav: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
});

export function AutoLogTutorialScreen({ topic, onBack }: AutoLogTutorialScreenProps) {
  const themeColors = useThemeColors();
  // This screen is a fixed flex layout rather than a ScrollView, so it has to
  // inset the nav row itself or the floating bottom nav covers Next/Done.
  const bottomNavInset = useSettingsBottomNavInset(24);
  const steps = STEPS[topic];
  const [index, setIndex] = useState(0);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Haptics are fired here rather than by the Button, matching how the
  // onboarding steps drive OnboardingActionBar.
  const goNext = useCallback(() => {
    void triggerHaptic('medium');
    if (isLast) {
      onBack();
      return;
    }
    setIndex((current) => Math.min(current + 1, steps.length - 1));
  }, [isLast, onBack, steps.length]);

  // Back stays on screen for every step so the 1:2 split never reflows; on the
  // first step there is nowhere back to go but out, which is what the header's
  // back does too.
  const goBack = useCallback(() => {
    void triggerHaptic('selection');
    if (index === 0) {
      onBack();
      return;
    }
    setIndex((current) => Math.max(current - 1, 0));
  }, [index, onBack]);

  return (
    <SettingsPageLayout>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t(TITLE_KEY[topic])}
        />
      </View>

      <View style={styles.body}>
        <View style={[styles.frame, { backgroundColor: `${themeColors.primary}0A` }]}>
          {step.image ? (
            <Image source={step.image} style={styles.frameImage} contentFit="contain" />
          ) : (
            <ImageIcon size={28} color={themeColors.textMuted} />
          )}
        </View>

        <View style={styles.dots}>
          {steps.map((item, dotIndex) => (
            <View
              key={item.key}
              style={[
                styles.dot,
                {
                  width: dotIndex === index ? 18 : 6,
                  backgroundColor:
                    dotIndex === index ? themeColors.primary : `${themeColors.primary}33`,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.caption}>
          <Text variant="caption" tone="muted" className="mb-1">
            {I18n.t('settings.auto_log.step_counter', {
              current: index + 1,
              total: steps.length,
            })}
          </Text>
          <Text variant="body" className="text-foreground">
            {I18n.t(`settings.auto_log.${step.key}`)}
          </Text>
        </View>

        {/* Mirrors OnboardingActionBar (ghost back at flex-1, primary at
            flex-[2]) rather than reusing it: that component pins itself to
            bottom: 0, which the floating bottom nav covers on a settings
            screen — hence the inset here instead. */}
        <View
          style={[styles.nav, bottomNavInset ?? { paddingBottom: 24 }]}
          className="border-t border-border/15"
        >
          <Button variant="ghost" className="flex-1" haptic="none" onPress={goBack}>
            <Text>{I18n.t('common.back')}</Text>
          </Button>
          <Button className="flex-[2] shadow-glow" haptic="none" onPress={goNext}>
            <Text>{isLast ? I18n.t('common.done') : I18n.t('common.next')}</Text>
          </Button>
        </View>
      </View>
    </SettingsPageLayout>
  );
}
