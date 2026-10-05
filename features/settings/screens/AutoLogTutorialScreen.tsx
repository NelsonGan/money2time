import type { ImageSource } from 'expo-image';
import { Download, Play } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import {
  AUTO_LOG_VIDEO_URLS,
  LOG_CARD_PAYMENT_INTENT_NAME,
  NEW_TRANSACTION_INTENT_NAME,
  NEW_TRANSACTION_SHORTCUT_URL,
  SCAN_SCREENSHOT_INTENT_NAME,
  SCAN_SCREENSHOT_SHORTCUT_URL,
} from '~/constants/autoLogIntents';
import { spacing } from '~/constants/designSystem';
import { StepPager, useStepPager } from '~/features/tutorials/components/StepPager';
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
 *
 * Share Screenshot is the Android topic: there is nothing to install or wire up,
 * so its steps only show the share itself, captured on an Android emulator.
 */
interface TutorialStep {
  key: string;
  image: ImageSource | null;
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
    { key: 'log_payment_step_create_shortcut', image: require('~/assets/autolog/lp_4b.png') },
    { key: 'log_payment_step_5', image: require('~/assets/autolog/lp_5.png') },
    { key: 'log_payment_step_6', image: require('~/assets/autolog/lp_amount.png') },
    { key: 'log_payment_step_merchant', image: require('~/assets/autolog/lp_merchant.png') },
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
  // Android: share a screenshot (or any saved receipt photo) to the app from the
  // system share sheet. Frames are annotated emulator captures, see
  // scripts/data/autolog-shots.json.
  shareScreenshot: [
    { key: 'share_screenshot_step_1', image: require('~/assets/autolog/ss_1.png') },
    { key: 'share_screenshot_step_2', image: require('~/assets/autolog/ss_2.png') },
    { key: 'share_screenshot_step_3', image: require('~/assets/autolog/ss_3.png') },
    { key: 'share_screenshot_step_4', image: require('~/assets/autolog/ss_4.png') },
  ],
  // Android: turn on notification access, pick the banking and wallet apps,
  // say which account each pays from, and send a test alert.
  paymentAlertsAndroid: [
    { key: 'payment_alerts_android_step_1', image: null },
    { key: 'payment_alerts_android_step_2', image: null },
    { key: 'payment_alerts_android_step_3', image: null },
    { key: 'payment_alerts_android_step_4', image: null },
    { key: 'payment_alerts_android_step_5', image: null },
    { key: 'payment_alerts_android_step_6', image: null },
    { key: 'payment_alerts_android_step_7', image: null },
  ],
  // iOS 27+: a Shortcuts "Notification" automation per bank app, running Log
  // Payment Alert with the notification's Title, Subtitle and Body. Automations
  // cannot be shared, so this one is built by hand like Log Card Payment.
  paymentAlertsIos: [
    { key: 'payment_alerts_ios_step_1', image: null },
    { key: 'payment_alerts_ios_step_2', image: null },
    { key: 'payment_alerts_ios_step_3', image: null },
    { key: 'payment_alerts_ios_step_4', image: null },
    { key: 'payment_alerts_ios_step_5', image: null },
    { key: 'payment_alerts_ios_step_6', image: null },
    { key: 'payment_alerts_ios_step_7', image: null },
  ],
  // iOS 17+: a "Message" automation for bank text messages, same action.
  bankSmsIos: [
    { key: 'bank_sms_ios_step_1', image: null },
    { key: 'bank_sms_ios_step_2', image: null },
    { key: 'bank_sms_ios_step_3', image: null },
    { key: 'bank_sms_ios_step_4', image: null },
    { key: 'bank_sms_ios_step_5', image: null },
  ],
};

/** iCloud shortcut links, one per topic that ships a downloadable shortcut. */
const DOWNLOAD_URL: Partial<Record<AutoLogTutorialTopic, string>> = {
  newTransaction: NEW_TRANSACTION_SHORTCUT_URL,
  logScreenshot: SCAN_SCREENSHOT_SHORTCUT_URL,
};

/** Walkthrough videos exist for the iOS topics only. */
const VIDEO_URL: Partial<Record<AutoLogTutorialTopic, string>> = AUTO_LOG_VIDEO_URLS;

/**
 * The action's own name, so the header matches both the Settings section that
 * linked here and the action the steps tell the user to find in Shortcuts.
 * Hardcoded English on purpose — see constants/autoLogIntents.ts. The Android
 * topic names no Shortcuts action, so it is translated like the rest of the UI.
 */
function titleFor(topic: AutoLogTutorialTopic): string {
  switch (topic) {
    case 'logPayment':
      return LOG_CARD_PAYMENT_INTENT_NAME;
    case 'newTransaction':
      return NEW_TRANSACTION_INTENT_NAME;
    case 'logScreenshot':
      return SCAN_SCREENSHOT_INTENT_NAME;
    case 'shareScreenshot':
      return I18n.t('settings.auto_log.share_screenshot_title');
    case 'paymentAlertsAndroid':
      return I18n.t('payment_alerts.title');
    case 'paymentAlertsIos':
      return I18n.t('payment_alerts.ios_notifications_title');
    case 'bankSmsIos':
      return I18n.t('payment_alerts.ios_sms_title');
  }
}

const styles = StyleSheet.create({
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
});

export function AutoLogTutorialScreen({ topic, onBack }: AutoLogTutorialScreenProps) {
  const themeColors = useThemeColors();
  const steps = STEPS[topic];
  const { index, isLast, goNext, goBack } = useStepPager(steps.length, onBack);
  const step = steps[index];

  const openDownload = useCallback(() => {
    void triggerHaptic('medium');
    const url = DOWNLOAD_URL[topic];
    // Linking.openURL rejects (rather than resolving false, like canOpenURL)
    // when nothing can handle the link — e.g. the Shortcuts app association is
    // broken. Swallow it, matching the Discord-link precedent elsewhere in
    // settings, rather than letting it surface as an unhandled rejection
    // (Sentry MONEY2TIME-15).
    if (url) void Linking.openURL(url).catch(() => undefined);
  }, [topic]);

  const videoUrl = VIDEO_URL[topic];
  const openVideo = useCallback(() => {
    if (!videoUrl) return;
    void triggerHaptic('selection');
    void Linking.openURL(videoUrl).catch(() => undefined);
  }, [videoUrl]);

  return (
    <SettingsPageLayout edges={['top', 'bottom']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={titleFor(topic)}
          rightAccessory={
            videoUrl ? (
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
            ) : undefined
          }
        />
      </View>

      <StepPager
        image={step.image}
        count={steps.length}
        index={index}
        isLast={isLast}
        onNext={goNext}
        onBack={goBack}
      >
        <View style={styles.caption}>
          <View style={styles.captionMeta}>
            <Text variant="caption" tone="muted">
              {I18n.t('settings.auto_log.step_counter', {
                current: index + 1,
                total: steps.length,
              })}
            </Text>
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
      </StepPager>
    </SettingsPageLayout>
  );
}
