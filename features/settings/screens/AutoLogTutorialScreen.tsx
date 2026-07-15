import { Image, type ImageSource } from 'expo-image';
import { ChevronLeft, ImageIcon } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  FatButton,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

export type AutoLogTutorialTopic = 'automation' | 'backtap';

interface AutoLogTutorialScreenProps {
  topic: AutoLogTutorialTopic;
  onBack: () => void;
}

/**
 * Screenshots are added by dropping files in `assets/autolog/` and swapping the
 * null for a `require(...)`. A step with no image shows an empty frame, so the
 * layout already matches what it will be once the art lands.
 */
const STEPS: Record<AutoLogTutorialTopic, { key: string; image: ImageSource | null }[]> = {
  automation: [
    { key: 'tutorial_step_1', image: null },
    { key: 'tutorial_step_2', image: null },
    { key: 'tutorial_step_3', image: null },
    { key: 'tutorial_step_4', image: null },
    { key: 'tutorial_step_5', image: null },
    { key: 'tutorial_step_6', image: null },
    { key: 'tutorial_step_7', image: null },
  ],
  backtap: [
    { key: 'backtap_step_1', image: null },
    { key: 'backtap_step_2', image: null },
    { key: 'backtap_step_3', image: null },
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
    alignItems: 'center',
    gap: 12,
    paddingTop: 8,
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

  // FatButton fires its own selection haptic.
  const goNext = useCallback(() => {
    if (isLast) {
      onBack();
      return;
    }
    setIndex((current) => Math.min(current + 1, steps.length - 1));
  }, [isLast, onBack, steps.length]);

  const goBack = useCallback(() => {
    setIndex((current) => Math.max(current - 1, 0));
  }, []);

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

        <View style={[styles.nav, bottomNavInset ?? { paddingBottom: 24 }]}>
          {index > 0 ? (
            <FatButton
              className="flex-1"
              label={I18n.t('common.back')}
              color={themeColors.surfaceMuted}
              textColor={themeColors.text}
              leading={<ChevronLeft size={18} color={themeColors.text} />}
              onPress={goBack}
            />
          ) : null}
          <FatButton
            className="flex-[2]"
            label={isLast ? I18n.t('common.done') : I18n.t('common.next')}
            onPress={goNext}
          />
        </View>
      </View>
    </SettingsPageLayout>
  );
}
