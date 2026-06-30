import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { ThemeModal } from '~/components/ui/theme-modal';
import {
  isAnyPromptVisible,
  markPromptHidden,
  markPromptVisible,
} from '~/services/globalPromptCoordinator';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import {
  declineFeedback,
  handlePrePromptDismissed,
  handlePrePromptHappy,
  handlePrePromptUnhappy,
  openFeedbackContact,
  type ReviewPrePromptTrigger,
} from '~/services/reviewPrompt';
import { subscribeShowReviewPrePromptRequest } from '~/services/reviewPromptNavigation';

type Step = 'initial' | 'unhappy';

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  faceLabel: {
    fontSize: 40,
    lineHeight: 48,
  },
});

export function ReviewPrePromptSheet() {
  const [visible, setVisible] = useState(false);
  const [trigger, setTrigger] = useState<ReviewPrePromptTrigger>('manual');
  const [step, setStep] = useState<Step>('initial');

  useEffect(() => {
    return subscribeShowReviewPrePromptRequest(({ trigger: nextTrigger }) => {
      // Yield if another global overlay is up — stacking RN modals can freeze
      // the page. The trigger is cadence-gated, so skipping one is harmless.
      if (isAnyPromptVisible('reviewPrePrompt')) return;
      markPromptVisible('reviewPrePrompt');
      setTrigger(nextTrigger);
      setStep('initial');
      setVisible(true);
    });
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    markPromptHidden('reviewPrePrompt');
  }, []);

  const onHappy = useCallback(() => {
    void triggerHaptic('success');
    close();
    void handlePrePromptHappy(trigger);
  }, [close, trigger]);

  const onUnhappy = useCallback(() => {
    void triggerHaptic('selection');
    void handlePrePromptUnhappy(trigger);
    setStep('unhappy');
  }, [trigger]);

  const onSendFeedback = useCallback(() => {
    void triggerHaptic('selection');
    close();
    void openFeedbackContact(trigger);
  }, [close, trigger]);

  const onSkipFeedback = useCallback(() => {
    close();
    declineFeedback(trigger);
  }, [close, trigger]);

  const onDismissInitial = useCallback(() => {
    close();
    void handlePrePromptDismissed(trigger);
  }, [close, trigger]);

  const onBackdropPress = useCallback(() => {
    if (step === 'initial') {
      onDismissInitial();
    } else {
      onSkipFeedback();
    }
  }, [step, onDismissInitial, onSkipFeedback]);

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onBackdropPress}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onBackdropPress}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          className="w-full max-w-[360px] rounded-[26px] border border-border/45 bg-background px-5 py-6 shadow-soft"
        >
          {step === 'initial' ? (
            <>
              <View className="items-center">
                <Text variant="subheading" className="text-center">
                  {I18n.t('review_prompt.preprompt_title')}
                </Text>
                <Text variant="friendly" tone="muted" className="mt-2 text-center">
                  {I18n.t('review_prompt.preprompt_subtitle')}
                </Text>
              </View>

              <View className="mt-5 flex-row gap-3">
                <Pressable
                  onPress={onUnhappy}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('review_prompt.preprompt_unhappy')}
                  className="flex-1 rounded-2xl border border-border/40 bg-secondary/40 py-5 items-center gap-2 active:opacity-90"
                >
                  <Text style={styles.faceLabel}>😞</Text>
                  <Text variant="caption" tone="muted">
                    {I18n.t('review_prompt.preprompt_unhappy')}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={onHappy}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('review_prompt.preprompt_happy')}
                  className="flex-1 rounded-2xl border border-primary/50 bg-primary/10 py-5 items-center gap-2 active:opacity-90"
                >
                  <Text style={styles.faceLabel}>😍</Text>
                  <Text variant="caption" tone="primary">
                    {I18n.t('review_prompt.preprompt_happy')}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={onDismissInitial}
                accessibilityRole="button"
                className="mt-3 py-2 items-center"
              >
                <Text variant="caption" tone="muted">
                  {I18n.t('review_prompt.preprompt_dismiss')}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text variant="subheading">{I18n.t('review_prompt.feedback_prompt')}</Text>
              <View className="mt-5 gap-2.5">
                <Button onPress={onSendFeedback}>
                  <Text>{I18n.t('review_prompt.feedback_open')}</Text>
                </Button>
                <Button variant="secondary" onPress={onSkipFeedback}>
                  <Text>{I18n.t('review_prompt.feedback_skip')}</Text>
                </Button>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}
