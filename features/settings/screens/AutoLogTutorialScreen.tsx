import { Image, type ImageSource } from 'expo-image';
import { Download, ImageIcon, Play } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Button, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import {
  AUTO_LOG_VIDEO_URLS,
  LOG_CARD_PAYMENT_INTENT_NAME,
  NEW_TRANSACTION_INTENT_NAME,
  NEW_TRANSACTION_SHORTCUT_URL,
  SCAN_SCREENSHOT_INTENT_NAME,
  SCAN_SCREENSHOT_SHORTCUT_URL,
} from '~/constants/autoLogIntents';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { AutoLogTutorialTopic } from '~/navigation/settingsStack';
import { triggerHaptic } from '~/services/haptics';

interface AutoLogTutorialScreenProps {
  topic: AutoLogTutorialTopic;
  onBack: () => void;
}

/**
 * Steps carry a real screenshot captured on a physical iPhone (Shortcuts,
 * Wallet, and Accessibility → Back Tap), annotated to circle the exact control to
 * tap. Metro needs a literal path, so each require is spelled out rather than
 * built from the step key. A step with `image: null` renders a blank frame (the
 * frame icon) — used for steps that have no capture yet or that are pure copy,
 * like the "download the shortcut" step. To add art, drop the file in
 * `assets/autolog/` and swap the null for a `require(...)`.
 *
 * New Transaction and Log Screenshot both ship a ready-made shortcut the user
 * installs from an iCloud link (`download: true`), so their tutorials only cover
 * the trigger, not building the shortcut. Log Card Payment has no link (an
 * automation can't be shared), so it keeps the full hand-built flow.
 */
interface TutorialStep {
  key: string;
  image: ImageSource | null;
  /** Flagged in the counter so a nice-to-have never reads as a required step. */
  optional?: boolean;
  /** Renders the "Get Shortcut" CTA under the caption, opening the topic's link. */
  download?: boolean;
}

const STEPS: Record<AutoLogTutorialTopic, TutorialStep[]> = {
  // Built from scratch (no shareable link): create a Wallet automation, add the
  // Log Card Payment action, bind its Amount/Merchant variables, and set the
  // account. Frames are annotated captures from the walkthrough video.
  logPayment: [
    { key: 'log_payment_step_1', image: require('~/assets/autolog/lp_1.png') },
    { key: 'log_payment_step_2', image: require('~/assets/autolog/lp_2.png') },
    { key: 'log_payment_step_3', image: require('~/assets/autolog/lp_3.png') },
    { key: 'log_payment_step_4', image: require('~/assets/autolog/lp_4.png') },
    { key: 'log_payment_step_5', image: require('~/assets/autolog/lp_5.png') },
    { key: 'log_payment_step_6', image: require('~/assets/autolog/lp_6.png') },
    { key: 'log_payment_step_7', image: require('~/assets/autolog/lp_7.png') },
    { key: 'log_payment_step_8', image: require('~/assets/autolog/lp_8.png') },
  ],
  // Step 1 installs the ready-made shortcut from iCloud, then a Back Tap is wired
  // to run it. Frames are annotated captures from the walkthrough video.
  newTransaction: [
    { key: 'new_transaction_step_1', image: require('~/assets/autolog/nt_1.png'), download: true },
    { key: 'new_transaction_step_2', image: require('~/assets/autolog/nt_2.png') },
    { key: 'new_transaction_step_3', image: require('~/assets/autolog/nt_3.png') },
    { key: 'new_transaction_step_4', image: require('~/assets/autolog/nt_4.png') },
  ],
  // Step 1 installs the ready-made shortcut from iCloud; the rest wire a Back Tap
  // to run it, then show the screenshot → Always Allow → auto-log flow. Frames
  // are annotated captures from the walkthrough video.
  logScreenshot: [
    { key: 'log_screenshot_step_1', image: require('~/assets/autolog/ls_1.png'), download: true },
    { key: 'log_screenshot_step_2', image: require('~/assets/autolog/ls_2.png') },
    { key: 'log_screenshot_step_3', image: require('~/assets/autolog/ls_3.png') },
    { key: 'log_screenshot_step_4', image: require('~/assets/autolog/ls_4.png') },
    { key: 'log_screenshot_step_5', image: require('~/assets/autolog/ls_5.png') },
    { key: 'log_screenshot_step_6', image: require('~/assets/autolog/ls_6.png') },
  ],
};

/** iCloud shortcut links, one per topic that ships a downloadable shortcut. */
const DOWNLOAD_URL: Partial<Record<AutoLogTutorialTopic, string>> = {
  newTransaction: NEW_TRANSACTION_SHORTCUT_URL,
  logScreenshot: SCAN_SCREENSHOT_SHORTCUT_URL,
};

/**
 * The action's own name, so the header matches both the Settings section that
 * linked here and the action the steps tell the user to find in Shortcuts.
 * Hardcoded English on purpose — see constants/autoLogIntents.ts.
 */
const TITLE: Record<AutoLogTutorialTopic, string> = {
  logPayment: LOG_CARD_PAYMENT_INTENT_NAME,
  newTransaction: NEW_TRANSACTION_INTENT_NAME,
  logScreenshot: SCAN_SCREENSHOT_INTENT_NAME,
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
  captionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xxs,
  },
  download: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  videoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  nav: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  // The page already pads the bottom safe area (SettingsPageLayout edges), so
  // this is just breathing room above it.
  navBottom: {
    paddingBottom: spacing.md,
  },
});

export function AutoLogTutorialScreen({ topic, onBack }: AutoLogTutorialScreenProps) {
  const themeColors = useThemeColors();
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

  const openDownload = useCallback(() => {
    void triggerHaptic('medium');
    const url = DOWNLOAD_URL[topic];
    if (url) void Linking.openURL(url);
  }, [topic]);

  const openVideo = useCallback(() => {
    void triggerHaptic('selection');
    void Linking.openURL(AUTO_LOG_VIDEO_URLS[topic]);
  }, [topic]);

  return (
    <SettingsPageLayout edges={['top', 'bottom']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={TITLE[topic]}
          rightAccessory={
            <Pressable
              style={styles.videoLink}
              onPress={openVideo}
              hitSlop={8}
              accessibilityRole="link"
              accessibilityLabel={I18n.t('settings.auto_log.video_tutorial')}
            >
              <Play size={13} color={themeColors.primary} fill={themeColors.primary} />
              <Text variant="caption" style={{ color: themeColors.primary }}>
                {I18n.t('settings.auto_log.video_tutorial')}
              </Text>
            </Pressable>
          }
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
          <View style={styles.captionMeta}>
            <Text variant="caption" tone="muted">
              {I18n.t('settings.auto_log.step_counter', {
                current: index + 1,
                total: steps.length,
              })}
            </Text>
            {step.optional ? (
              <Text variant="caption" style={{ color: themeColors.primary }}>
                {I18n.t('settings.auto_log.step_optional')}
              </Text>
            ) : null}
          </View>
          <Text variant="body" className="text-foreground">
            {I18n.t(`settings.auto_log.${step.key}`)}
          </Text>
          {step.download ? (
            <Pressable
              style={[styles.download, { backgroundColor: themeColors.primary }]}
              onPress={openDownload}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('settings.auto_log.download_shortcut_button')}
            >
              <Download size={16} color="#fff" />
              <Text variant="caption" style={{ color: '#fff', fontWeight: '600' }}>
                {I18n.t('settings.auto_log.download_shortcut_button')}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Mirrors OnboardingActionBar (ghost back at flex-1, primary at
            flex-[2]) rather than reusing it. The page pads the bottom safe area
            (edges above), so the row only adds a little breathing room. */}
        <View style={[styles.nav, styles.navBottom]} className="border-t border-border/15">
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
