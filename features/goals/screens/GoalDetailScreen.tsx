import { Minus, MoreHorizontal, Plus, Trash2 } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, SettingsHeader, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { GoalWithStats } from '~/types';
import { withColorAlpha } from '~/utils/color';
import { formatRelativeDate } from '~/utils/formatters';

import { formatReportingMoney, GoalProgressBar, GoalValue } from '../components';

interface GoalDetailScreenProps {
  goalId: string;
  onClose: () => void;
  onEdit: (goalId: string) => void;
  onAddContribution: (goalId: string, mode: 'deposit' | 'withdraw') => void;
}

const MILESTONES = [0.25, 0.5, 0.75, 1] as const;
const SCROLL_CONTENT = { padding: 20, paddingBottom: 48 } as const;

function statusText(goal: GoalWithStats): string | null {
  switch (goal.deadlineStatus) {
    case 'onTrack':
      return I18n.t('goals.status_on_track');
    case 'behind':
      return I18n.t('goals.status_behind');
    case 'pastDue':
      return I18n.t('goals.status_past_due');
    case 'met':
      return I18n.t('goals.status_met');
    default:
      return null;
  }
}

export function GoalDetailScreen({
  goalId,
  onClose,
  onEdit,
  onAddContribution,
}: GoalDetailScreenProps) {
  const {
    goals,
    settings,
    getGoalContributions,
    deleteContribution,
    archiveGoal,
    updateGoal,
    deleteGoal,
  } = useApp();
  const themeColors = useThemeColors();

  const goal = useMemo(() => goals.find((g) => g.id === goalId) ?? null, [goalId, goals]);
  const contributions = useMemo(
    () => (goal ? [...getGoalContributions(goal.id)].reverse() : []),
    [getGoalContributions, goal],
  );

  const handleOverflow = useCallback(() => {
    if (!goal) return;
    void triggerHaptic('selection');
    Alert.alert(goal.name, undefined, [
      { text: I18n.t('goals.edit_title'), onPress: () => onEdit(goal.id) },
      goal.status === 'archived'
        ? {
            text: I18n.t('goals.unarchive'),
            onPress: () => updateGoal(goal.id, { status: 'active' }),
          }
        : {
            text: I18n.t('goals.archive'),
            onPress: () => {
              archiveGoal(goal.id);
              onClose();
            },
          },
      {
        text: I18n.t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteGoal(goal.id);
          onClose();
        },
      },
      { text: I18n.t('common.cancel'), style: 'cancel' },
    ]);
  }, [archiveGoal, deleteGoal, goal, onClose, onEdit, updateGoal]);

  const handleDeleteContribution = useCallback(
    (id: string) => {
      void triggerHaptic('warning');
      deleteContribution(id);
    },
    [deleteContribution],
  );

  if (!goal) {
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="px-5">
          <SettingsHeader className="px-0 pb-3 pt-5" onBack={onClose} title="" />
        </View>
      </SafeAreaView>
    );
  }

  const barColor = goal.isComplete ? themeColors.success : themeColors.primary;
  const status = statusText(goal);
  const percentLabel = `${Math.round(goal.percentComplete * 100)}%`;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pb-3 pt-5"
          onBack={onClose}
          title={goal.name}
          rightAccessory={
            <Pressable
              onPress={handleOverflow}
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
              accessibilityRole="button"
              accessibilityLabel={I18n.t('goals.options')}
            >
              <MoreHorizontal size={18} color={themeColors.textMuted} />
            </Pressable>
          }
        />
      </View>

      <ScrollView contentContainerStyle={SCROLL_CONTENT} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View className="rounded-3xl border border-border/45 bg-card p-5">
          <View className="flex-row items-end justify-between">
            <View>
              <Text variant="label" tone="muted">
                {I18n.t('goals.saved')}
              </Text>
              <GoalValue
                money={Math.max(0, goal.savedAmount)}
                hours={goal.savedHours}
                settings={settings}
                variant="monoLg"
                className="mt-1 text-foreground"
              />
            </View>
            <Text variant="heading" style={{ color: barColor }}>
              {percentLabel}
            </Text>
          </View>

          <View className="mt-3">
            <GoalProgressBar percent={goal.percentComplete} color={barColor} height={10} />
          </View>

          <View className="mt-3 flex-row items-center justify-between">
            <Text variant="caption" tone="muted">
              {I18n.t('goals.remaining')}
            </Text>
            <GoalValue
              money={goal.remainingAmount}
              hours={goal.remainingHours}
              settings={settings}
              variant="bodyStrong"
            />
          </View>

          {/* Milestones */}
          <View className="mt-4 flex-row items-center gap-2">
            {MILESTONES.map((m) => {
              const reached = goal.percentComplete >= m;
              return (
                <View
                  key={m}
                  className="h-2 flex-1 rounded-full"
                  style={{
                    backgroundColor: reached ? barColor : withColorAlpha(barColor, 0.14),
                  }}
                />
              );
            })}
          </View>
        </View>

        {/* Pace / forecast / deadline */}
        {(goal.weeklyPace > 0 || goal.deadline || status) && !goal.isComplete ? (
          <View className="mt-3 gap-2 rounded-2xl border border-border/45 bg-card p-4">
            {goal.weeklyPace > 0 ? (
              <View className="flex-row items-center justify-between">
                <Text variant="caption" tone="muted">
                  {I18n.t('goals.pace')}
                </Text>
                <Text variant="body">
                  {I18n.t('goals.per_week', {
                    amount: formatReportingMoney(goal.weeklyPace, settings),
                  })}
                </Text>
              </View>
            ) : null}
            {goal.forecastDate ? (
              <View className="flex-row items-center justify-between">
                <Text variant="caption" tone="muted">
                  {I18n.t('goals.forecast')}
                </Text>
                <Text variant="body">{formatRelativeDate(goal.forecastDate, settings.locale)}</Text>
              </View>
            ) : null}
            {goal.deadline ? (
              <View className="flex-row items-center justify-between">
                <Text variant="caption" tone="muted">
                  {I18n.t('goals.deadline_label')}
                </Text>
                <Text variant="body">{formatRelativeDate(goal.deadline, settings.locale)}</Text>
              </View>
            ) : null}
            {goal.requiredWeeklyRate != null ? (
              <View className="flex-row items-center justify-between">
                <Text variant="caption" tone="muted">
                  {I18n.t('goals.required_rate')}
                </Text>
                <Text variant="body">
                  {I18n.t('goals.per_week', {
                    amount: formatReportingMoney(goal.requiredWeeklyRate, settings),
                  })}
                </Text>
              </View>
            ) : null}
            {status ? (
              <Text variant="caption" style={{ color: barColor }}>
                {status}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Actions */}
        <View className="mt-4 flex-row gap-3">
          <View className="flex-1">
            <Button onPress={() => onAddContribution(goal.id, 'deposit')}>
              <View className="flex-row items-center gap-1.5">
                <Plus size={16} color="#fff" />
                <Text style={{ color: '#fff' }} variant="bodyStrong">
                  {I18n.t('goals.contribute_cta')}
                </Text>
              </View>
            </Button>
          </View>
          <Button
            variant="secondary"
            size="icon"
            onPress={() => onAddContribution(goal.id, 'withdraw')}
            accessibilityLabel={I18n.t('goals.withdraw')}
          >
            <Minus size={18} color={themeColors.textMuted} />
          </Button>
        </View>

        {goal.note ? (
          <Text variant="body" tone="muted" className="mt-4 px-1">
            {goal.note}
          </Text>
        ) : null}

        {/* Contribution history */}
        {contributions.length > 0 ? (
          <View className="mt-6 gap-2">
            <Text variant="label" tone="muted" className="px-1">
              {I18n.t('goals.history')}
            </Text>
            {contributions.map((c) => {
              const value = c.reportingAmount ?? c.amount;
              const isWithdrawal = value < 0;
              return (
                <View
                  key={c.id}
                  className="flex-row items-center gap-3 rounded-2xl border border-border/45 bg-card px-4 py-3"
                >
                  <View className="flex-1">
                    <Text variant="bodyStrong">
                      {(isWithdrawal ? '-' : '+') + formatReportingMoney(Math.abs(value), settings)}
                    </Text>
                    <Text variant="caption" tone="muted" className="mt-0.5">
                      {formatRelativeDate(c.date, settings.locale)}
                      {c.note ? ` · ${c.note}` : ''}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleDeleteContribution(c.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('common.delete')}
                  >
                    <Trash2 size={16} color={withColorAlpha(themeColors.textMuted, 0.7)} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
