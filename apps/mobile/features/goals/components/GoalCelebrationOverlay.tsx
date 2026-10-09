import React, { useEffect, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Mascot } from '~/components/feedback/Mascot';
import { Button, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Account } from '~/types';

/**
 * One-shot celebration shown when a savings goal first reaches its target.
 * Driven entirely by AppContext's pendingGoalCelebration (the persisted
 * goalAchievedAt stamp guarantees it never repeats), so it can fire on
 * whatever screen the user happens to be on, review-prompt style.
 */
export function GoalCelebrationOverlay() {
  const { pendingGoalCelebration, clearGoalCelebration } = useApp();
  const visible = pendingGoalCelebration != null;

  // Holds the last celebration's data across the dismiss. `<Modal>` must stay
  // mounted with `visible` going straight to false, not be unmounted while
  // still showing — Fabric tearing down a *visible* ReactModalHostView (rather
  // than the Modal's own dismiss path reacting to `visible={false}`) crashes
  // both platforms' native modal teardown (Sentry MONEY2TIME-3Y on Android;
  // the same race is the likely cause of the iOS "no view controller managing
  // visible view" hang/crash). `pendingGoalCelebration` used to gate an early
  // `return null` that unmounted the Modal directly on every dismiss.
  const [content, setContent] = useState<Account | null>(null);

  useEffect(() => {
    if (pendingGoalCelebration) {
      setContent(pendingGoalCelebration);
      void triggerHaptic('success');
    }
  }, [pendingGoalCelebration]);

  if (!content) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={clearGoalCelebration}>
      <Pressable
        className="flex-1 items-center justify-center bg-black/50 px-8"
        onPress={clearGoalCelebration}
      >
        <Pressable
          className="w-full max-w-[360px] items-center rounded-[28px] bg-card px-6 py-8"
          onPress={() => {}}
        >
          {/* The save flipbook: a coin drops into the piggy bank, then the
              mascot hugs it. Reaching a savings goal is exactly that moment,
              and it carries it on its own — the goal's own icon under it was a
              second piece of artwork competing with it, and the goal is already
              named in the line below. */}
          <Mascot sequence="save" size={96} />
          <Text variant="headingSm" className="mt-4 text-center">
            {I18n.t('goals.celebration_title')}
          </Text>
          <Text variant="body" tone="muted" className="mt-2 text-center">
            {I18n.t('goals.celebration_message', { name: content.name })}
          </Text>
          <View className="mt-6 w-full">
            <Button onPress={clearGoalCelebration} accessibilityLabel={I18n.t('common.done')}>
              <Text>{I18n.t('goals.celebration_cta')}</Text>
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
