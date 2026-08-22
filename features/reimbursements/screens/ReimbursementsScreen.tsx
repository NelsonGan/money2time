import { ChevronDown, RotateCcw, Settings2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
import {
  AccountLogo,
  AccountPickerSheet,
  CategoryEmoji,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useSettingsBottomNavInset } from '~/components/ui/settings';
import { useApp, useTransactions } from '~/context/AppContext';
import { bucketReimbursements } from '~/features/reimbursements/lib/reimbursementMath';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations } from '~/types';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency, formatRelativeDate } from '~/utils/formatters';

interface ReimbursementsScreenProps {
  onBack: () => void;
  onOpenSettings: () => void;
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
});

/**
 * The checklist of expenses waiting to be paid back, and the ones that have
 * been. Reached from the Settings grid.
 *
 * A pending row carries its own destination-account chip and a mark-paid
 * button, the same shape Settle Up uses for a split payback, so the two read as
 * one gesture. The count-as-spending preference sits behind the header gear
 * rather than on the page, again mirroring Settle Up.
 *
 * The page opens for everyone. Flagging an expense in the first place is the
 * Pro gate (see the editor's options panel), so a free user who has never
 * flagged anything simply sees the empty state.
 */
export function ReimbursementsScreen({ onBack, onOpenSettings }: ReimbursementsScreenProps) {
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset();
  const {
    settings,
    accounts,
    accountGroups,
    getAccountById,
    updateTransaction,
    markTransactionReimbursed,
    unmarkTransactionReimbursed,
  } = useApp();
  const { transactions } = useTransactions();

  // The row whose destination account is being picked.
  const [pickerForId, setPickerForId] = useState<string | null>(null);

  useEffect(() => {
    void trackEvent(AnalyticsEvents.REIMBURSEMENT_OPENED);
  }, []);

  const { pending, settled } = useMemo(() => bucketReimbursements(transactions), [transactions]);

  const formatNative = useCallback(
    (value: number, currency: string) => formatCurrency(value, currencySymbolForCode(currency)),
    [],
  );

  // Where the money will land. Falls back to the account the expense came out
  // of, which is also what `markTransactionReimbursed` assumes when nothing was
  // picked, so the chip never shows one account and the refund lands in another.
  const destinationAccountId = useCallback(
    (transaction: TransactionWithRelations) =>
      transaction.reimbursementAccountId ?? transaction.accountId ?? null,
    [],
  );

  const handlePickAccount = useCallback(
    (accountId: string) => {
      const transactionId = pickerForId;
      setPickerForId(null);
      if (!transactionId) return;
      void triggerHaptic('selection');
      updateTransaction(transactionId, { reimbursementAccountId: accountId });
    },
    [pickerForId, updateTransaction],
  );

  const handleMarkPaid = useCallback(
    (transaction: TransactionWithRelations) => {
      const accountId = destinationAccountId(transaction);
      if (!accountId) {
        Alert.alert(I18n.t('reimbursements.no_account'));
        return;
      }
      void triggerHaptic('success');
      markTransactionReimbursed(transaction.id, { accountId });
    },
    [destinationAccountId, markTransactionReimbursed],
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

  const pickerTransaction = pickerForId
    ? (transactions.find((transaction) => transaction.id === pickerForId) ?? null)
    : null;

  const rowTitle = (transaction: TransactionWithRelations) =>
    transaction.note?.trim() || transaction.categoryName || I18n.t('reimbursements.untitled');

  /** Icon, title, date and amount: the top half of every card, in both states. */
  const renderSummary = (transaction: TransactionWithRelations, isSettled: boolean) => (
    <View className="flex-row items-center gap-3">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/50">
        <CategoryEmoji icon={transaction.categoryIcon} size={22} className="text-[19px]" />
      </View>
      <View className="flex-1">
        <Text variant="bodyStrong" numberOfLines={1}>
          {rowTitle(transaction)}
        </Text>
        <Text variant="caption" tone="muted">
          {formatRelativeDate(transaction.date)}
        </Text>
      </View>
      <Text variant="bodyStrong" className={isSettled ? 'text-success' : undefined}>
        {formatNative(transaction.amount, transaction.currency)}
      </Text>
    </View>
  );

  const renderPending = (transaction: TransactionWithRelations) => {
    const accountId = destinationAccountId(transaction);
    const account = accountId ? getAccountById(accountId) : null;
    return (
      <View
        key={transaction.id}
        className="rounded-2xl border border-border/25 bg-card/60 px-4 py-3.5"
      >
        {renderSummary(transaction, false)}

        <View className="my-3 h-px bg-border/15" />

        <View className="flex-row items-center gap-2">
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              setPickerForId(transaction.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${rowTitle(transaction)} · ${
              account?.name ?? I18n.t('common.no_account')
            }`}
            className="min-w-0 flex-shrink flex-row items-center gap-1.5 rounded-full bg-secondary/50 py-1.5 pl-2 pr-2.5 active:opacity-70"
          >
            {account ? (
              <AccountLogo
                logoId={account.logoId}
                type={account.type}
                goalEmoji={account.goalEmoji}
                size={16}
              />
            ) : null}
            <Text variant="caption" tone="muted" numberOfLines={1} className="max-w-[150px]">
              {account?.name ?? I18n.t('common.no_account')}
            </Text>
            <ChevronDown size={12} color={themeColors.textMuted} />
          </Pressable>
          <View className="flex-1" />
          <Pressable
            onPress={() => handleMarkPaid(transaction)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${I18n.t('reimbursements.mark_reimbursed')} · ${rowTitle(
              transaction,
            )}`}
            className="rounded-full bg-success/15 px-3.5 py-2 active:opacity-70"
          >
            <Text variant="caption" className="text-success font-medium">
              {I18n.t('reimbursements.mark_reimbursed')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderSettled = (transaction: TransactionWithRelations) => {
    const account = transaction.reimbursementAccountId
      ? getAccountById(transaction.reimbursementAccountId)
      : null;
    return (
      <View
        key={transaction.id}
        className="rounded-2xl border border-border/25 bg-card/60 px-4 py-3.5"
      >
        {renderSummary(transaction, true)}

        <View className="my-3 h-px bg-border/15" />

        <View className="flex-row items-center gap-2">
          <View className="min-w-0 flex-shrink flex-row items-center gap-1.5 rounded-full bg-secondary/50 py-1.5 pl-2 pr-2.5">
            {account ? (
              <AccountLogo
                logoId={account.logoId}
                type={account.type}
                goalEmoji={account.goalEmoji}
                size={16}
              />
            ) : null}
            <Text variant="caption" tone="muted" numberOfLines={1} className="max-w-[180px]">
              {account
                ? I18n.t('reimbursements.paid_into', { account: account.name })
                : I18n.t('common.no_account')}
            </Text>
          </View>
          <View className="flex-1" />
          <Pressable
            onPress={() => handleUndo(transaction)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${I18n.t('reimbursements.undo_action')} · ${rowTitle(
              transaction,
            )}`}
            className="h-8 w-8 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
          >
            <RotateCcw size={15} color={themeColors.textMuted} />
          </Pressable>
        </View>
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
        rightAccessory={
          <Pressable
            onPress={() => {
              void triggerHaptic('selection');
              onOpenSettings();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('reimbursements.settings_title')}
            className="h-9 w-9 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
          >
            <Settings2 size={18} color={themeColors.textMuted} />
          </Pressable>
        }
      />

      <ScrollView className="flex-1" contentContainerStyle={[styles.scrollContent, bottomNavInset]}>
        {pending.length === 0 && settled.length === 0 ? (
          <View className="mt-6">
            <EmptyState
              title={I18n.t('reimbursements.empty_title')}
              message={I18n.t('reimbursements.empty_message')}
              mascotName="receipt"
            />
          </View>
        ) : null}

        {pending.length > 0 ? (
          <View className="mt-4">
            <Text variant="bodyStrong">{I18n.t('reimbursements.pending_title')}</Text>
            <View className="mt-3 gap-2">{pending.map(renderPending)}</View>
          </View>
        ) : null}

        {settled.length > 0 ? (
          <View className="mt-6">
            <Text variant="bodyStrong">{I18n.t('reimbursements.settled_title')}</Text>
            <View className="mt-3 gap-2">{settled.map(renderSettled)}</View>
          </View>
        ) : null}
      </ScrollView>

      <AccountPickerSheet
        visible={!!pickerTransaction}
        onClose={() => setPickerForId(null)}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={
          pickerTransaction
            ? (destinationAccountId(pickerTransaction) ?? settings.defaultPaybackAccountId)
            : null
        }
        onSelect={handlePickAccount}
      />
    </SettingsPageLayout>
  );
}
