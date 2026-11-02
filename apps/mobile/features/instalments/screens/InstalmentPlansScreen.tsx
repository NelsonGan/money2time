import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import { EdgeSwipeBackContainer } from '~/components/navigation/EdgeSwipeBackContainer';
import {
  AddIconButton,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import {
  financialMonthKeyForDate,
  financialMonthRange,
  monthCycleOf,
} from '~/utils/financialMonth';
import { dayKeyFromDateLocal, formatAmount } from '~/utils/formatters';

import { InstalmentPlanCard } from '../components/InstalmentPlanCard';
import { instalmentDueBetween } from '../lib/instalmentPlan';

interface InstalmentPlansScreenProps {
  onBack?: () => void;
  onOpenPlan: (planId: string) => void;
  /** Opens the add form, where an expense becomes a plan. */
  onAddPlan: () => void;
  useNativeBackGesture?: boolean;
}

/**
 * Settings › Instalments: every plan, what is due this month and what is left
 * to pay. A plan is started from the add form (the Instalments chip), so the
 * add button here opens that form.
 */
export function InstalmentPlansScreen({
  onBack,
  onOpenPlan,
  onAddPlan,
  useNativeBackGesture = false,
}: InstalmentPlansScreenProps) {
  const bottomNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
  const { settings, instalmentPlans, convertToReporting } = useApp();

  const active = useMemo(() => instalmentPlans.filter((plan) => !plan.complete), [instalmentPlans]);
  const finished = useMemo(
    () => instalmentPlans.filter((plan) => plan.complete),
    [instalmentPlans],
  );

  // "This month" follows the user's month cycle (a payday month can start on the 25th).
  const { dueThisMonth, leftToPay } = useMemo(() => {
    const cycle = monthCycleOf(settings);
    const range = financialMonthRange(financialMonthKeyForDate(new Date(), cycle), cycle);
    return {
      dueThisMonth: instalmentDueBetween(
        active,
        dayKeyFromDateLocal(range.start),
        dayKeyFromDateLocal(range.endInclusive),
        convertToReporting,
      ),
      leftToPay: active.reduce(
        (sum, plan) => sum + convertToReporting(plan.leftAmount, plan.rule.currency),
        0,
      ),
    };
  }, [active, convertToReporting, settings]);

  const money = (amount: number) => formatAmount(amount, settings);

  const content = (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pb-3 pt-5"
          onBack={onBack}
          title={I18n.t('instalments.title')}
          rightAccessory={
            <AddIconButton
              onPress={onAddPlan}
              accessibilityLabel={I18n.t('instalments.new_plan')}
            />
          }
        />
      </View>
      <ScrollView contentContainerStyle={[styles.listContent, bottomNavInset]}>
        {instalmentPlans.length === 0 ? (
          <EmptyState
            title={I18n.t('instalments.empty_title')}
            message={I18n.t('instalments.empty_message')}
            mascotMood="curious"
            action={{ label: I18n.t('instalments.empty_action'), onPress: onAddPlan }}
          />
        ) : (
          <View className="gap-2">
            {active.length > 0 ? (
              <View className="mb-3 flex-row gap-3">
                <View className="flex-1 rounded-[22px] border border-border/30 bg-card px-4 py-3.5">
                  <Text variant="label" tone="muted">
                    {I18n.t('instalments.due_this_month')}
                  </Text>
                  <Text variant="headingSm" className="mt-1">
                    {money(dueThisMonth)}
                  </Text>
                </View>
                <View className="flex-1 rounded-[22px] border border-border/30 bg-card px-4 py-3.5">
                  <Text variant="label" tone="muted">
                    {I18n.t('instalments.left_to_pay')}
                  </Text>
                  <Text variant="headingSm" className="mt-1">
                    {money(leftToPay)}
                  </Text>
                </View>
              </View>
            ) : null}
            {active.length > 0 ? (
              <Text variant="label" tone="muted" className="pb-1">
                {I18n.t('instalments.section_active')}
              </Text>
            ) : null}
            {active.map((plan) => (
              <InstalmentPlanCard
                key={plan.rule.id}
                plan={plan}
                onPress={() => onOpenPlan(plan.rule.id)}
              />
            ))}
            {finished.length > 0 ? (
              <Text variant="label" tone="muted" className="pb-1 pt-4">
                {I18n.t('instalments.section_finished')}
              </Text>
            ) : null}
            {finished.map((plan) => (
              <InstalmentPlanCard
                key={plan.rule.id}
                plan={plan}
                onPress={() => onOpenPlan(plan.rule.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SettingsPageLayout>
  );

  if (useNativeBackGesture || !onBack) return content;
  return <EdgeSwipeBackContainer onBack={onBack}>{content}</EdgeSwipeBackContainer>;
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  listContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
  },
});
