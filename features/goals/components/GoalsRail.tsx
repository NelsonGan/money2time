import { Plus } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { GoalCard } from '~/features/goals/components/GoalCard';
import { useGoals } from '~/features/goals/useGoals';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { formatAmount } from '~/utils/formatters';

/**
 * The savings-goals section on the Accounts tab: progress cards for active
 * goals, a gated "new goal" button, and a collapsed archived list. Renders
 * nothing in Simple mode; in Power mode the empty state stays visible as the
 * feature's discovery surface.
 */
export function GoalsRail({
  hideBalances,
  onOpenGoal,
  onOpenGoalEditor,
}: {
  hideBalances: boolean;
  onOpenGoal: (accountId: string) => void;
  onOpenGoalEditor: (params?: { accountId?: string }) => void;
}) {
  const { settings, currentMonthWage, isSimpleMode } = useApp();
  const { active, archived } = useGoals();
  const { checkLimit } = useProGate();
  const themeColors = useThemeColors();
  const [showArchived, setShowArchived] = useState(false);

  const totalSaved = useMemo(
    () => active.reduce((sum, goal) => sum + Math.max(0, goal.progress.saved), 0),
    [active],
  );

  const handleAdd = useCallback(() => {
    if (!checkLimit('goals', active.length)) return;
    void triggerHaptic('selection');
    onOpenGoalEditor();
  }, [active.length, checkLimit, onOpenGoalEditor]);

  if (isSimpleMode) return null;

  return (
    <View className="mb-5">
      <View className="flex-row items-center justify-between px-1 pb-2.5">
        <View>
          <Text variant="subheading">{I18n.t('goals.rail_title')}</Text>
          {active.length > 0 ? (
            <Text variant="caption" tone="muted" className="mt-0.5">
              {hideBalances
                ? '••••'
                : I18n.t('goals.rail_total_saved', {
                    amount: formatAmount(totalSaved, settings, {
                      trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
                    }),
                  })}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={handleAdd}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('goals.new_goal')}
          className="h-9 w-9 items-center justify-center rounded-full border border-border/30 bg-card"
        >
          <Plus size={18} color={themeColors.primary} />
        </Pressable>
      </View>

      {active.length === 0 ? (
        <Pressable
          onPress={handleAdd}
          accessibilityRole="button"
          className="items-center rounded-[22px] border border-dashed border-border/60 bg-card/60 px-5 py-6"
        >
          <Text variant="body" className="text-center">
            {I18n.t('goals.empty_title')}
          </Text>
          <Text variant="caption" tone="muted" className="mt-1 text-center">
            {I18n.t('goals.empty_message')}
          </Text>
          <View className="mt-3 rounded-full bg-primary/15 px-4 py-2">
            <Text variant="caption" className="text-primary">
              {I18n.t('goals.new_goal')}
            </Text>
          </View>
        </Pressable>
      ) : (
        <View className="gap-2.5">
          {active.map((goal) => (
            <GoalCard
              key={goal.account.id}
              goal={goal}
              hideBalances={hideBalances}
              onPress={onOpenGoal}
            />
          ))}
        </View>
      )}

      {archived.length > 0 ? (
        <View className="mt-2.5">
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              setShowArchived((v) => !v);
            }}
            accessibilityRole="button"
            className="items-center py-1.5"
          >
            <Text variant="caption" tone="muted">
              {showArchived
                ? I18n.t('goals.hide_archived')
                : I18n.t('goals.show_archived', { count: archived.length })}
            </Text>
          </Pressable>
          {showArchived ? (
            <View className="mt-1 gap-2.5 opacity-70">
              {archived.map((goal) => (
                <GoalCard
                  key={goal.account.id}
                  goal={goal}
                  hideBalances={hideBalances}
                  onPress={onOpenGoal}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
