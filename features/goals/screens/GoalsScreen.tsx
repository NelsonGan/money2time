import { CircleCheck, PiggyBank, Target } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import {
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { GoalCard } from '~/features/goals/components/GoalCard';
import { useGoals } from '~/features/goals/useGoals';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { formatAmount } from '~/utils/formatters';

const NOOP = () => {};
const MASKED_VALUE = '••••';

interface GoalsScreenProps {
  /** Shared with the Accounts pane via the assets shell's eye toggle. */
  hideBalances: boolean;
  onOpenGoal: (accountId: string) => void;
  onOpenGoalEditor: (params?: { accountId?: string }) => void;
}

function GoalsSummaryBlock({
  totalSavedLabel,
  activeCount,
  achievedCount,
  themeColors,
}: {
  totalSavedLabel: string;
  activeCount: number;
  achievedCount: number;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View className="w-full overflow-hidden rounded-2xl border border-border/45 bg-card">
      <View className="px-4 pb-3 pt-3.5">
        <View className="flex-row items-center gap-1.5">
          <PiggyBank size={12} color={themeColors.primary} strokeWidth={2.4} />
          <Text variant="label" className="text-[10px] text-primary">
            {I18n.t('goals.summary_total_saved')}
          </Text>
        </View>
        <Text variant="monoLg" className="mt-1.5">
          {totalSavedLabel}
        </Text>
      </View>

      <View className="h-px bg-border/40" />

      <View className="flex-row">
        <View className="flex-1 px-4 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <Target size={12} color={themeColors.textMuted} strokeWidth={2.4} />
            <Text variant="label" className="text-[10px]" tone="muted">
              {I18n.t('goals.summary_active')}
            </Text>
          </View>
          <Text variant="mono" className="mt-1">
            {activeCount}
          </Text>
        </View>
        <View className="w-px bg-border/40" />
        <View className="flex-1 px-4 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <CircleCheck size={12} color={themeColors.textMuted} strokeWidth={2.4} />
            <Text variant="label" className="text-[10px]" tone="muted">
              {I18n.t('goals.pace_achieved')}
            </Text>
          </View>
          <Text variant="mono" className="mt-1">
            {achievedCount}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * The Goals pane of the assets page (Accounts | Goals | Items). Mirrors the
 * Items pane's structure — pinned summary block over an inset scroll of cards,
 * EmptyState when there is nothing yet — so switching sub-tabs lines up.
 */
export function GoalsScreen({ hideBalances, onOpenGoal, onOpenGoalEditor }: GoalsScreenProps) {
  const { settings, currentMonthWage, convertToReporting } = useApp();
  const { active, archived } = useGoals();
  const { checkLimit } = useProGate();
  const themeColors = useThemeColors();
  const listNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
  const [showArchived, setShowArchived] = useState(false);

  // Each goal's saved amount is native to its own currency; convert before
  // summing so a USD goal and a JPY goal don't add face values.
  const totalSaved = useMemo(
    () =>
      active.reduce(
        (sum, goal) =>
          sum + Math.max(0, convertToReporting(goal.progress.saved, goal.account.currency)),
        0,
      ),
    [active, convertToReporting],
  );
  const achievedCount = useMemo(
    () => active.filter((goal) => goal.progress.pace === 'achieved').length,
    [active],
  );

  const handleAdd = () => {
    if (!checkLimit('goals', active.length)) return;
    void triggerHaptic('selection');
    onOpenGoalEditor();
  };

  if (active.length === 0 && archived.length === 0) {
    return (
      <SettingsPageLayout edges={[]}>
        <EmptyState
          title={I18n.t('goals.empty_title')}
          message={I18n.t('goals.empty_message')}
          mascotMood="curious"
          animateIn={false}
          action={{ label: I18n.t('goals.new_goal'), onPress: handleAdd }}
        />
      </SettingsPageLayout>
    );
  }

  const totalSavedLabel = hideBalances
    ? MASKED_VALUE
    : formatAmount(totalSaved, settings, {
        trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
      });

  return (
    <SettingsPageLayout edges={[]}>
      {/* Same pinned-overview structure as the accounts and items panes so
          the content lines up when switching sub-tabs. */}
      <MonthControlsHeader
        title=""
        monthLabel=""
        onPrevMonth={NOOP}
        onNextMonth={NOOP}
        hideTitleRow
        hideNavigation
        showAccent={false}
      >
        <GoalsSummaryBlock
          totalSavedLabel={totalSavedLabel}
          activeCount={active.length}
          achievedCount={achievedCount}
          themeColors={themeColors}
        />
      </MonthControlsHeader>

      <ScrollView
        className="flex-1"
        contentContainerStyle={[
          { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
          listNavInset,
        ]}
        showsVerticalScrollIndicator={false}
      >
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
      </ScrollView>
    </SettingsPageLayout>
  );
}
