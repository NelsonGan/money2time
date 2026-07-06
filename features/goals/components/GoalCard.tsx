import { CalendarClock, CheckCircle2 } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { GoalWithStats, UserSettings } from '~/types';
import { withColorAlpha } from '~/utils/color';

import { GoalProgressBar, GoalValue } from './GoalDisplay';

function deadlineLabel(goal: GoalWithStats): string | null {
  switch (goal.deadlineStatus) {
    case 'onTrack':
      return I18n.t('goals.status_on_track');
    case 'behind':
      return I18n.t('goals.status_behind');
    case 'pastDue':
      return I18n.t('goals.status_past_due');
    default:
      return null;
  }
}

/** A goal row: cover + name, progress bar, saved/target, and a status chip. */
export function GoalCard({
  goal,
  settings,
  onPress,
}: {
  goal: GoalWithStats;
  settings: UserSettings;
  onPress: () => void;
}) {
  const themeColors = useThemeColors();
  const percentLabel = `${Math.round(goal.percentComplete * 100)}%`;
  const status = deadlineLabel(goal);
  const statusColor =
    goal.deadlineStatus === 'onTrack'
      ? themeColors.success
      : goal.deadlineStatus === 'behind' || goal.deadlineStatus === 'pastDue'
        ? themeColors.coral
        : themeColors.mutedForeground;
  const barColor = goal.isComplete ? themeColors.success : themeColors.primary;

  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      className="rounded-2xl border border-border/45 bg-card p-4"
      accessibilityRole="button"
      accessibilityLabel={goal.name}
    >
      <View className="flex-row items-center gap-3">
        <View
          className="h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: withColorAlpha(barColor, 0.14) }}
        >
          {goal.emoji ? (
            <Text style={{ fontSize: 22 }}>{goal.emoji}</Text>
          ) : goal.isComplete ? (
            <CheckCircle2 size={22} color={themeColors.success} />
          ) : (
            <Text variant="bodyStrong" style={{ color: barColor }}>
              {goal.name.slice(0, 1).toUpperCase()}
            </Text>
          )}
        </View>
        <View className="flex-1">
          <Text variant="bodyStrong" numberOfLines={1}>
            {goal.name}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-1">
            <GoalValue
              money={Math.max(0, goal.savedAmount)}
              hours={goal.savedHours}
              settings={settings}
              variant="caption"
              className="text-primary"
            />
            <Text variant="caption" tone="muted">
              /
            </Text>
            <GoalValue
              money={goal.targetReportingAmount}
              hours={
                goal.savedHours != null && goal.remainingHours != null
                  ? goal.savedHours + goal.remainingHours
                  : null
              }
              settings={settings}
              variant="caption"
              className="text-muted-foreground"
            />
          </View>
        </View>
        <Text variant="bodyStrong" style={{ color: barColor }}>
          {percentLabel}
        </Text>
      </View>

      <View className="mt-3">
        <GoalProgressBar percent={goal.percentComplete} color={barColor} />
      </View>

      {status ? (
        <View className="mt-2.5 flex-row items-center gap-1.5">
          <CalendarClock size={12} color={statusColor} strokeWidth={2.2} />
          <Text variant="caption" style={{ color: statusColor }}>
            {status}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
