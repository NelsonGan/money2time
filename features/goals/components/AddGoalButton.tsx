import React from 'react';

import { AddIconButton } from '~/components/ui';
import { useGoals } from '~/features/goals/useGoals';
import { useProGate } from '~/hooks/useProGate';
import { I18n } from '~/lib/i18n';

/**
 * The assets shell's top-right add action for the Goals sub-tab. A leaf
 * component so the Pro gate (which needs the live goal count) doesn't
 * subscribe the shell itself to goal state.
 */
export function AddGoalButton({
  onOpenGoalEditor,
}: {
  onOpenGoalEditor: (params?: { accountId?: string }) => void;
}) {
  const { active } = useGoals();
  const { checkLimit } = useProGate();

  return (
    <AddIconButton
      accessibilityLabel={I18n.t('goals.new_goal')}
      onPress={() => {
        if (!checkLimit('goals', active.length)) return;
        onOpenGoalEditor();
      }}
    />
  );
}
