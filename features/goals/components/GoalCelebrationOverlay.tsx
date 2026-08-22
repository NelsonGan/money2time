import React, { useEffect } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Mascot } from '~/components/feedback/Mascot';
import { Button, CategoryEmoji, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

/**
 * One-shot celebration shown when a savings goal first reaches its target.
 * Driven entirely by AppContext's pendingGoalCelebration (the persisted
 * goalAchievedAt stamp guarantees it never repeats), so it can fire on
 * whatever screen the user happens to be on, review-prompt style.
 */
export function GoalCelebrationOverlay() {
  const { pendingGoalCelebration, clearGoalCelebration } = useApp();
  const visible = pendingGoalCelebration != null;

  useEffect(() => {
    if (visible) void triggerHaptic('success');
  }, [visible]);

  if (!pendingGoalCelebration) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={clearGoalCelebration}>
      <Pressable
        className="flex-1 items-center justify-center bg-black/50 px-8"
        onPress={clearGoalCelebration}
      >
        <Pressable
          className="w-full max-w-[360px] items-center rounded-[28px] bg-card px-6 py-8"
          onPress={() => {}}
        >
          {/* The save flipbook: a coin drops into the piggy bank, then the
              mascot hugs it. Reaching a savings goal is exactly that moment. */}
          <Mascot sequence="save" size={96} />
          <View className="mt-3 h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
            <CategoryEmoji
              icon={pendingGoalCelebration.goalEmoji || 'target'}
              style={{ fontSize: 28 }}
            />
          </View>
          <Text variant="headingSm" className="mt-4 text-center">
            {I18n.t('goals.celebration_title')}
          </Text>
          <Text variant="body" tone="muted" className="mt-2 text-center">
            {I18n.t('goals.celebration_message', { name: pendingGoalCelebration.name })}
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
