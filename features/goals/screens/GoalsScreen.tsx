import { Plus } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import {
  Button,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';
import { I18n } from '~/lib/i18n';
import type { GoalWithStats } from '~/types';

import { GoalCard } from '../components';

interface GoalsScreenProps {
  onBack: () => void;
  onOpenGoal: (goalId: string) => void;
  onCreateGoal: () => void;
  safeAreaEdges?: Edge[];
}

export function GoalsScreen({
  onBack,
  onOpenGoal,
  onCreateGoal,
  safeAreaEdges = ['top'],
}: GoalsScreenProps) {
  const { goals, settings, activeGoalCount } = useApp();
  const { checkLimit } = useProGate();
  const listNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);

  const { active, completed, archived } = useMemo(() => {
    const activeGoals: GoalWithStats[] = [];
    const completedGoals: GoalWithStats[] = [];
    const archivedGoals: GoalWithStats[] = [];
    goals.forEach((goal) => {
      if (goal.status === 'archived') archivedGoals.push(goal);
      else if (goal.status === 'completed') completedGoals.push(goal);
      else activeGoals.push(goal);
    });
    return { active: activeGoals, completed: completedGoals, archived: archivedGoals };
  }, [goals]);

  const handleAdd = useCallback(() => {
    if (!checkLimit('goals', activeGoalCount)) return;
    onCreateGoal();
  }, [activeGoalCount, checkLimit, onCreateGoal]);

  return (
    <SettingsPageLayout edges={safeAreaEdges}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pb-3 pt-5"
          onBack={onBack}
          title={I18n.t('goals.title')}
          rightAccessory={
            <Button size="icon" onPress={handleAdd} accessibilityLabel={I18n.t('goals.add')}>
              <Plus size={18} color="#fff" />
            </Button>
          }
        />
      </View>

      {goals.length === 0 ? (
        <EmptyState
          title={I18n.t('goals.empty_title')}
          message={I18n.t('goals.empty_message')}
          mascotMood="curious"
          animateIn={false}
        />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={[
            { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: 10 },
            listNavInset,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {active.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              settings={settings}
              onPress={() => onOpenGoal(goal.id)}
            />
          ))}

          {completed.length > 0 ? (
            <>
              <Text variant="label" tone="muted" className="mt-4 px-1">
                {I18n.t('goals.section_completed')}
              </Text>
              {completed.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  settings={settings}
                  onPress={() => onOpenGoal(goal.id)}
                />
              ))}
            </>
          ) : null}

          {archived.length > 0 ? (
            <>
              <Text variant="label" tone="muted" className="mt-4 px-1">
                {I18n.t('goals.section_archived')}
              </Text>
              {archived.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  settings={settings}
                  onPress={() => onOpenGoal(goal.id)}
                />
              ))}
            </>
          ) : null}
        </ScrollView>
      )}
    </SettingsPageLayout>
  );
}
