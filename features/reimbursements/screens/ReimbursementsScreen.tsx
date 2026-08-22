import { Check, RotateCcw, Wallet } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import {
  AccountPickerSheet,
  CategoryEmoji,
  InfoTooltipButton,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp, useTransactions } from '~/context/AppContext';
import {
  bucketReimbursements,
  sumReporting,
} from '~/features/reimbursements/lib/reimbursementMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations } from '~/types';
import { formatCurrency, formatRelativeDate } from '~/utils/formatters';

interface ReimbursementsScreenProps {
  onBack: () => void;
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/**
 * Full-page home for reimbursements, reached from the Settings grid.
 *
 * Two things live here: whether a reimbursable expense counts as spending, and
 * the checklist of expenses waiting to be paid back. Ticking one off asks which
 * account the money landed in, then writes the money-in entry for it.
 *
 * The page opens for everyone. Flagging an expense in the first place is the
 * Pro gate (see the editor's options panel), so a free user who has never
 * flagged anything simply sees the empty state.
 */
export function ReimbursementsScreen({ onBack }: ReimbursementsScreenProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const {
    settings,
    updateSettings,
    accounts,
    accountGroups,
    getAccountById,
    markTransactionReimbursed,
    unmarkTransactionReimbursed,
  } = useApp();
  const { transactions } = useTransactions();

  // The transaction the account picker is about to settle.
  const [pendingSettleId, setPendingSettleId] = useState<string | null>(null);

  useEffect(() => {
    trackEvent(AnalyticsEvents.REIMBURSEMENT_OPENED);
  }, []);

  const { pending, settled } = useMemo(() => bucketReimbursements(transactions), [transactions]);
  const pendingTotal = useMemo(() => sumReporting(pending), [pending]);

  const formatReporting = useCallback(
    (value: number) => formatCurrency(value, settings.currencySymbol),
    [settings.currencySymbol],
  );

  const handleToggleCountAsExpense = useCallback(
    (value: boolean) => {
      void triggerHaptic('selection');
      updateSettings({ reimbursementsCountAsExpense: value });
      void trackEvent(AnalyticsEvents.REIMBURSEMENT_COUNT_SETTING_CHANGED, { counts: value });
    },
    [updateSettings],
  );

  const handleStartSettle = useCallback(
    (transaction: TransactionWithRelations) => {
      void triggerHaptic('selection');
      if (accounts.length === 0) {
        Alert.alert(I18n.t('reimbursements.no_account'));
        return;
      }
      setPendingSettleId(transaction.id);
    },
    [accounts.length],
  );

  const handlePickAccount = useCallback(
    (accountId: string) => {
      const transactionId = pendingSettleId;
      setPendingSettleId(null);
      if (!transactionId) return;
      void triggerHaptic('success');
      markTransactionReimbursed(transactionId, { accountId });
    },
    [markTransactionReimbursed, pendingSettleId],
  );

  const handleUndo = useCallback(
    (transaction: TransactionWithRelations) => {
      void triggerHaptic('warning');
      Alert.alert(I18n.t('reimbursements.undo_title'), I18n.t('reimbursements.undo_message'), [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('reimbursements.undo_action'),
          style: 'destructive',
          onPress: () => unmarkTransactionReimbursed(transaction.id),
        },
      ]);
    },
    [unmarkTransactionReimbursed],
  );

  const pendingSettleTransaction = pendingSettleId
    ? (transactions.find((transaction) => transaction.id === pendingSettleId) ?? null)
    : null;

  const rowTitle = (transaction: TransactionWithRelations) =>
    transaction.note?.trim() || transaction.categoryName || I18n.t('reimbursements.untitled');

  const renderRow = (transaction: TransactionWithRelations, isSettled: boolean) => {
    const account = transaction.reimbursementAccountId
      ? getAccountById(transaction.reimbursementAccountId)
      : null;
    return (
      <View
        key={transaction.id}
        className="flex-row items-center gap-3 rounded-2xl border border-border/30 bg-card px-3.5 py-3"
      >
        <View className="h-11 w-11 items-center justify-center rounded-full bg-secondary/50">
          <CategoryEmoji icon={transaction.categoryIcon} size={22} className="text-[19px]" />
        </View>
        <View className="flex-1">
          <Text variant="bodyStrong" numberOfLines={1}>
            {rowTitle(transaction)}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {isSettled && account
              ? I18n.t('reimbursements.paid_into', { account: account.name })
              : formatRelativeDate(transaction.date)}
          </Text>
        </View>
        <Text variant="bodyStrong" className={isSettled ? 'text-success' : 'text-warning'}>
          {formatReporting(transaction.reportingAmount ?? transaction.amount)}
        </Text>
        <Pressable
          onPress={() => (isSettled ? handleUndo(transaction) : handleStartSettle(transaction))}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            isSettled
              ? I18n.t('reimbursements.undo_action')
              : I18n.t('reimbursements.mark_reimbursed')
          }
          className={
            isSettled
              ? 'h-8 w-8 items-center justify-center rounded-full bg-secondary/60 active:opacity-70'
              : 'h-8 w-8 items-center justify-center rounded-full border-2 border-primary/50 active:opacity-70'
          }
        >
          {isSettled ? (
            <RotateCcw size={15} color={themeColors.textMuted} />
          ) : (
            <Check size={16} color={themeColors.primary} />
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('reimbursements.title')}
        infoTooltip={I18n.t('reimbursements.subtitle')}
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
      >
        {/* Whether a flagged expense still counts as spending. Off pulls it, and
            the money-in entry paired with it, out of every spending total. The
            what-it-does detail sits behind the ⓘ rather than a caption line. */}
        <View className="mt-2 rounded-[24px] border border-border/25 bg-card/60 px-4 py-4">
          <View style={styles.settingRow}>
            <View style={[styles.iconBubble, { backgroundColor: `${themeColors.primary}14` }]}>
              <Wallet size={18} color={themeColors.primary} />
            </View>
            <View className="flex-1 flex-row items-center gap-1.5">
              <Text variant="bodyStrong">{I18n.t('reimbursements.count_as_expense_label')}</Text>
              <InfoTooltipButton
                title={I18n.t('reimbursements.count_as_expense_label')}
                infoTooltip={I18n.t('reimbursements.count_as_expense_hint')}
              />
            </View>
            <Switch
              value={settings.reimbursementsCountAsExpense}
              onValueChange={handleToggleCountAsExpense}
              trackColor={{ false: themeColors.border, true: themeColors.primary }}
            />
          </View>
        </View>

        {pending.length === 0 && settled.length === 0 ? (
          <View className="mt-6">
            <EmptyState
              title={I18n.t('reimbursements.empty_title')}
              message={I18n.t('reimbursements.empty_message')}
              mascotName="reading"
            />
          </View>
        ) : null}

        {pending.length > 0 ? (
          <View className="mt-6">
            <View className="flex-row items-baseline justify-between">
              <Text variant="bodyStrong">{I18n.t('reimbursements.pending_title')}</Text>
              <Text variant="bodyStrong" className="text-warning">
                {formatReporting(pendingTotal)}
              </Text>
            </View>
            <Text variant="caption" tone="muted">
              {I18n.t('reimbursements.pending_total_label')}
            </Text>
            <View className="mt-3 gap-2">
              {pending.map((transaction) => renderRow(transaction, false))}
            </View>
          </View>
        ) : null}

        {settled.length > 0 ? (
          <View className="mt-6">
            <Text variant="bodyStrong">{I18n.t('reimbursements.settled_title')}</Text>
            <View className="mt-3 gap-2">
              {settled.map((transaction) => renderRow(transaction, true))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <AccountPickerSheet
        visible={!!pendingSettleTransaction}
        onClose={() => setPendingSettleId(null)}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={
          pendingSettleTransaction?.reimbursementAccountId ??
          settings.defaultPaybackAccountId ??
          pendingSettleTransaction?.accountId ??
          null
        }
        onSelect={handlePickAccount}
      />
    </SettingsPageLayout>
  );
}
