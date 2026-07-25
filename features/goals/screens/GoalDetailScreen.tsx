import { Archive, ArchiveRestore, ChevronRight, Pencil } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, CategoryEmoji, SettingsHeader, Text } from '~/components/ui';
import { useApp, useTransactions } from '~/context/AppContext';
import {
  type DepositSource,
  DepositSourceSheet,
  type WithdrawTarget,
  WithdrawTargetSheet,
} from '~/features/goals/components/DepositSourceSheet';
import { useGoals } from '~/features/goals/useGoals';
import { SavingsRateRing } from '~/features/insights/components/SavingsRateRing';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations } from '~/types';
import { formatAmount, formatRelativeDate, formatShortDate } from '~/utils/formatters';

interface GoalDetailScreenProps {
  accountId: string;
  onClose: () => void;
  onEdit: (accountId: string) => void;
  /**
   * Open the pre-filled transaction editor to add money: a transfer from
   * another account, or outside money recorded as income into the goal.
   */
  onDeposit: (accountId: string, source: DepositSource) => void;
  /** Open the editor to move money out: back to an account, or spent directly. */
  onWithdraw: (accountId: string, target: WithdrawTarget) => void;
  /** Open the full account transaction view (month pager, bulk edit). */
  onOpenAllActivity: (accountId: string) => void;
}

const SCROLL_CONTENT = { padding: 20, paddingBottom: 48 } as const;
const RECENT_LIMIT = 12;

/** Signed effect of a transaction on the goal account, in its own currency. */
function amountForGoal(tx: TransactionWithRelations, goalAccountId: string): number {
  if (tx.type === 'transfer') {
    if (tx.toAccountId === goalAccountId) return tx.toAmount ?? tx.amount;
    return -tx.amount;
  }
  const value = tx.accountAmount ?? tx.amount;
  if (tx.type === 'income') return value;
  if (tx.type === 'expense') return -value;
  return value; // balance_adjustment rows carry their own sign
}

export function GoalDetailScreen({
  accountId,
  onClose,
  onEdit,
  onDeposit,
  onWithdraw,
  onOpenAllActivity,
}: GoalDetailScreenProps) {
  const { settings, currentMonthWage, getTransactionsByAccount, setGoalArchived } = useApp();
  const { transactions: allTransactions } = useTransactions();
  const { active, archived } = useGoals();
  const { checkLimit } = useProGate();
  const themeColors = useThemeColors();
  const [showDepositSheet, setShowDepositSheet] = useState(false);
  const [showWithdrawSheet, setShowWithdrawSheet] = useState(false);

  const goal = useMemo(
    () => [...active, ...archived].find((g) => g.account.id === accountId) ?? null,
    [accountId, active, archived],
  );
  // getTransactionsByAccount is identity-stable across transaction churn, so
  // this memo must key on the live transactions array (CLAUDE.md rule) or
  // balance-neutral edits (note/category/date) would show stale rows.
  const transactions = useMemo(
    () => getTransactionsByAccount(accountId).slice(0, RECENT_LIMIT),
    [accountId, getTransactionsByAccount, allTransactions],
  );

  const trueHourlyRate = currentMonthWage?.trueHourlyRate ?? 0;

  const handleArchiveToggle = useCallback(() => {
    if (!goal) return;
    const isArchived = goal.account.goalArchivedAt != null;
    if (isArchived) {
      // Un-archiving re-enters the active pool, so it re-runs the Pro gate.
      if (!checkLimit('goals', active.length)) return;
      void triggerHaptic('selection');
      setGoalArchived(goal.account.id, false);
      return;
    }
    void triggerHaptic('warning');
    const hasBalance = goal.progress.saved > 0;
    Alert.alert(
      I18n.t('goals.archive_title'),
      hasBalance
        ? `${I18n.t('goals.archive_message')} ${I18n.t('goals.archive_balance_hint')}`
        : I18n.t('goals.archive_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('goals.archive_confirm'),
          style: 'destructive',
          onPress: () => {
            setGoalArchived(goal.account.id, true);
            onClose();
          },
        },
      ],
    );
  }, [active.length, checkLimit, goal, onClose, setGoalArchived]);

  if (!goal) {
    // Deleted or restored away underneath us; there is nothing to show.
    return (
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="px-5">
          <SettingsHeader className="px-0 pt-5 pb-3" onBack={onClose} title="" />
        </View>
      </SafeAreaView>
    );
  }

  const { account, progress } = goal;
  const isArchived = account.goalArchivedAt != null;
  const achieved = progress.pace === 'achieved';
  const fillRatio = Math.max(0, Math.min(1, progress.ratio));
  const ringColor = achieved ? themeColors.success : themeColors.primary;
  const format = (value: number) =>
    formatAmount(value, settings, { trueHourlyRate, currencyCode: account.currency });

  const paceLine = (() => {
    if (achieved) return I18n.t('goals.detail_achieved');
    if (!account.goalTargetDate) return null;
    const dateLabel = formatShortDate(account.goalTargetDate, settings.locale);
    return progress.pace === 'onTrack'
      ? I18n.t('goals.detail_on_track', { date: dateLabel })
      : I18n.t('goals.detail_behind', { date: dateLabel });
  })();

  const projectionLine = (() => {
    if (achieved) return null;
    if (progress.requiredMonthly != null && progress.pace === 'behind') {
      return I18n.t('goals.detail_required_monthly', {
        amount: format(progress.requiredMonthly),
      });
    }
    if (progress.projectedDate && progress.monthlyRate != null) {
      return I18n.t('goals.detail_projection', {
        amount: format(progress.monthlyRate),
        date: formatShortDate(progress.projectedDate, settings.locale),
      });
    }
    return null;
  })();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onClose}
          title={account.name}
          rightAccessory={
            <View className="flex-row gap-2">
              <Pressable
                onPress={handleArchiveToggle}
                hitSlop={8}
                className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
                accessibilityRole="button"
                accessibilityLabel={
                  isArchived ? I18n.t('goals.unarchive') : I18n.t('goals.archive_title')
                }
              >
                {isArchived ? (
                  <ArchiveRestore size={18} color={themeColors.primary} />
                ) : (
                  <Archive size={18} color={themeColors.textMuted} />
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onEdit(account.id);
                }}
                hitSlop={8}
                className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
                accessibilityRole="button"
                accessibilityLabel={I18n.t('goals.edit_title')}
              >
                <Pencil size={18} color={themeColors.textMuted} />
              </Pressable>
            </View>
          }
        />
      </View>

      <ScrollView contentContainerStyle={SCROLL_CONTENT}>
        {isArchived ? (
          <View className="mb-4 rounded-2xl border border-border/40 bg-secondary/40 px-4 py-3">
            <Text variant="caption" tone="muted">
              {I18n.t('goals.archived_banner')}
            </Text>
          </View>
        ) : null}

        <View className="items-center">
          <SavingsRateRing
            size={172}
            strokeWidth={14}
            progress={fillRatio}
            color={ringColor}
            trackColor={themeColors.border}
          >
            <View className="items-center">
              <CategoryEmoji icon={account.goalEmoji || '🎯'} style={{ fontSize: 34 }} />
              <Text variant="monoLg" className="mt-1">
                {Math.round(progress.ratio * 100)}%
              </Text>
            </View>
          </SavingsRateRing>

          <Text variant="headingSm" className="mt-4 text-center">
            {I18n.t('goals.saved_of_target', {
              saved: format(progress.saved),
              target: format(progress.target),
            })}
          </Text>

          {paceLine ? (
            <Text
              variant="caption"
              tone={achieved ? 'primary' : progress.pace === 'behind' ? 'muted' : 'primary'}
              className="mt-1.5 text-center"
            >
              {paceLine}
            </Text>
          ) : null}
          {projectionLine ? (
            <Text variant="caption" tone="muted" className="mt-1 px-6 text-center">
              {projectionLine}
            </Text>
          ) : null}
        </View>

        {!isArchived ? (
          <View className="mt-6 flex-row gap-3">
            <View className="flex-1">
              <Button
                onPress={() => setShowDepositSheet(true)}
                accessibilityLabel={I18n.t('goals.deposit')}
              >
                <Text>{I18n.t('goals.deposit')}</Text>
              </Button>
            </View>
            <View className="flex-1">
              <Button
                variant="secondary"
                disabled={progress.saved <= 0}
                onPress={() => setShowWithdrawSheet(true)}
                accessibilityLabel={I18n.t('goals.withdraw')}
              >
                <Text>{I18n.t('goals.withdraw')}</Text>
              </Button>
            </View>
          </View>
        ) : null}

        <View className="mt-7">
          <View className="flex-row items-center justify-between px-1 pb-2">
            <Text variant="subheading">{I18n.t('goals.activity_title')}</Text>
            {transactions.length > 0 ? (
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onOpenAllActivity(account.id);
                }}
                hitSlop={8}
                accessibilityRole="button"
                className="flex-row items-center gap-0.5"
              >
                <Text variant="caption" className="text-primary">
                  {I18n.t('goals.view_all_activity')}
                </Text>
                <ChevronRight size={14} color={themeColors.primary} />
              </Pressable>
            ) : null}
          </View>

          {transactions.length === 0 ? (
            <View className="items-center rounded-[22px] border border-dashed border-border/60 bg-card/60 px-5 py-6">
              <Text variant="caption" tone="muted" className="text-center">
                {I18n.t('goals.activity_empty')}
              </Text>
            </View>
          ) : (
            <View className="rounded-[22px] border border-border/30 bg-card px-4">
              {transactions.map((tx, index) => {
                const signed = amountForGoal(tx, account.id);
                const label =
                  tx.note?.trim() ||
                  tx.categoryName ||
                  (tx.type === 'transfer'
                    ? I18n.t('goals.activity_transfer')
                    : tx.type === 'balance_adjustment'
                      ? I18n.t('transactions.balance_adjustment_transaction_note')
                      : tx.type === 'income'
                        ? I18n.t('nav.income')
                        : I18n.t('nav.expense'));
                return (
                  <View
                    key={tx.id}
                    className={
                      index === 0
                        ? 'flex-row items-center justify-between py-3'
                        : 'flex-row items-center justify-between border-t border-border/20 py-3'
                    }
                  >
                    <View className="flex-1 pr-3">
                      <Text variant="body" numberOfLines={1}>
                        {label}
                      </Text>
                      <Text variant="caption" tone="muted" className="mt-0.5">
                        {formatRelativeDate(tx.date, settings.locale)}
                      </Text>
                    </View>
                    <Text variant="mono" className={signed >= 0 ? 'text-primary' : undefined}>
                      {formatAmount(signed, settings, {
                        showSign: true,
                        trueHourlyRate,
                        currencyCode: account.currency,
                      })}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      <DepositSourceSheet
        visible={showDepositSheet}
        onClose={() => setShowDepositSheet(false)}
        onSelect={(source) => {
          setShowDepositSheet(false);
          void trackEvent(AnalyticsEvents.GOAL_DEPOSIT_OPENED, { source });
          onDeposit(account.id, source);
        }}
      />
      <WithdrawTargetSheet
        visible={showWithdrawSheet}
        onClose={() => setShowWithdrawSheet(false)}
        onSelect={(target) => {
          setShowWithdrawSheet(false);
          void trackEvent(AnalyticsEvents.GOAL_WITHDRAW_OPENED, { target });
          onWithdraw(account.id, target);
        }}
      />
    </SafeAreaView>
  );
}
