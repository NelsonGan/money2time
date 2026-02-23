import React, { memo } from 'react';
import { View, Pressable } from 'react-native';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';

import { Text } from '~/components/ui/text';
import type { TransactionWithRelations, UserSettings } from '~/types';
import { formatAmount, formatRelativeDate } from '~/utils/formatters';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { motionDurations } from '~/constants/motion';
import { usePressScale } from '~/hooks/usePressScale';
import { I18n } from '~/lib/i18n';

type TransactionDisplaySettings = Pick<
  UserSettings,
  'currencySymbol' | 'displayMode' | 'hourRounding'
>;

interface TransactionItemProps {
  transaction: TransactionWithRelations;
  onPress?: () => void;
  onPressTransaction?: (transaction: TransactionWithRelations) => void;
  disableAnimations?: boolean;
  showDateInSubtitle?: boolean;
  compact?: boolean;
  settings: TransactionDisplaySettings;
  getTrueHourlyRateForDate: (dateIso: string) => number;
}

interface TransactionItemViewProps {
  transaction: TransactionWithRelations;
  onPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  showDateInSubtitle: boolean;
  compact: boolean;
  settings: TransactionDisplaySettings;
  getTrueHourlyRateForDate: (dateIso: string) => number;
}

function TransactionItemView({
  transaction,
  onPress,
  onPressIn,
  onPressOut,
  showDateInSubtitle,
  compact,
  settings,
  getTrueHourlyRateForDate,
}: TransactionItemViewProps) {
  const isIncome = transaction.type === 'income';
  const isTransfer = transaction.type === 'transfer';
  const isTimeMode = settings.displayMode === 'time';

  const hasNote = Boolean(transaction.note);
  let categoryInline: string | null = null;
  if (!isTransfer) {
    const categoryChild: string = String(transaction.categoryName ?? I18n.t('common.uncategorized'));
    const categoryParent: string | null = transaction.categoryParentName
      ? String(transaction.categoryParentName)
      : null;
    const hasSubcategory = Boolean(categoryParent && transaction.categoryName);
    const categoryPrimary: string = hasSubcategory
      ? (categoryParent ?? categoryChild)
      : categoryChild;
    const categorySecondary: string | null = hasSubcategory ? categoryChild : null;
    categoryInline = categorySecondary ? `${categoryPrimary} • ${categorySecondary}` : categoryPrimary;
  }
  const dateLabel = showDateInSubtitle ? formatRelativeDate(transaction.date) : null;
  const transferLabel =
    isTransfer && !hasNote
      ? `${transaction.fromAccountName ?? I18n.t('common.unknown')} → ${transaction.toAccountName ?? I18n.t('common.unknown')}`
      : null;

  const title = isTransfer
    ? transaction.note || transferLabel
    : transaction.note || (categoryInline ?? I18n.t('common.uncategorized'));

  const subtitle = isTransfer
    ? showDateInSubtitle
      ? `Transfer · ${dateLabel ?? ''}`
      : 'Transfer'
    : showDateInSubtitle
      ? transaction.note
        ? `${categoryInline ?? ''} · ${dateLabel ?? ''}`
        : dateLabel
      : transaction.note
        ? categoryInline
        : null;
  const rate = isTimeMode && !isTransfer ? getTrueHourlyRateForDate(transaction.date) : 0;
  const categoryEmoji = transaction.categoryIcon ?? undefined;
  const leadingEmoji = isTransfer ? '↔️' : categoryEmoji || (isIncome ? '⬆️' : '⬇️');

  return (
    <Pressable
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      className={cn(
        'flex-row items-center bg-card border border-border/40 shadow-soft',
        compact
          ? 'gap-2 px-2.5 py-2 rounded-[16px] mb-1'
          : 'gap-2.5 px-3 py-2.5 rounded-[20px] mb-1.5',
      )}
    >
      <View
        className={cn(
          compact
            ? 'w-8 h-8 rounded-full items-center justify-center'
            : 'w-9 h-9 rounded-full items-center justify-center',
          isTransfer ? 'bg-secondary' : isIncome ? 'bg-success/12' : 'bg-destructive/10',
        )}
      >
        <Text className={compact ? 'text-[15px]' : 'text-[16px]'}>{leadingEmoji}</Text>
      </View>

      <View className="flex-1 min-w-0 pr-1">
        <Text
          variant="friendly"
          className={cn(
            'text-foreground',
            compact ? 'text-[13px] leading-[16px]' : 'text-[14px] leading-[18px]',
          )}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="caption"
            tone="muted"
            className={compact ? '' : 'mt-0.5'}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View className="items-end">
        <Text
          variant="friendly"
          className={cn(
            compact ? 'text-[13px] leading-[16px]' : 'text-[14px] leading-[18px]',
            isTransfer ? 'text-muted-foreground' : isIncome ? 'text-success' : 'text-destructive',
          )}
        >
          {formatAmount(transaction.amount, settings, {
            showSign: false,
            neutralSign: isTransfer,
            trueHourlyRate: isTransfer ? 0 : rate,
          })}
        </Text>
        <Text variant="caption" tone="muted" className={compact ? '' : 'mt-0.5'} numberOfLines={1}>
          {isTransfer
            ? `${transaction.fromAccountName ?? '-'} → ${transaction.toAccountName ?? '-'}`
            : (transaction.accountName ?? I18n.t('common.no_account'))}
        </Text>
      </View>
    </Pressable>
  );
}

function AnimatedTransactionItem({
  transaction,
  onPress,
  showDateInSubtitle,
  compact,
  settings,
  getTrueHourlyRateForDate,
}: TransactionItemViewProps) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.98 });

  return (
    <Animated.View
      layout={Layout.springify().damping(18).stiffness(260)}
      entering={FadeIn.duration(motionDurations.fast)}
      exiting={FadeOut.duration(motionDurations.fast)}
      style={animatedStyle}
    >
      <TransactionItemView
        transaction={transaction}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        showDateInSubtitle={showDateInSubtitle}
        compact={compact}
        settings={settings}
        getTrueHourlyRateForDate={getTrueHourlyRateForDate}
      />
    </Animated.View>
  );
}

function StaticTransactionItem({
  transaction,
  onPress,
  showDateInSubtitle,
  compact,
  settings,
  getTrueHourlyRateForDate,
}: TransactionItemViewProps) {
  return (
    <TransactionItemView
      transaction={transaction}
      onPress={onPress}
      showDateInSubtitle={showDateInSubtitle}
      compact={compact}
      settings={settings}
      getTrueHourlyRateForDate={getTrueHourlyRateForDate}
    />
  );
}

function TransactionItemComponent({
  transaction,
  onPress,
  onPressTransaction,
  disableAnimations = false,
  showDateInSubtitle = true,
  compact = false,
  settings,
  getTrueHourlyRateForDate,
}: TransactionItemProps) {
  const handlePress = onPress
    ? () => {
        void triggerHaptic('light');
        onPress();
      }
    : onPressTransaction
      ? () => {
          void triggerHaptic('light');
          onPressTransaction(transaction);
        }
      : undefined;

  if (disableAnimations) {
    return (
      <StaticTransactionItem
        transaction={transaction}
        onPress={handlePress}
        showDateInSubtitle={showDateInSubtitle}
        compact={compact}
        settings={settings}
        getTrueHourlyRateForDate={getTrueHourlyRateForDate}
      />
    );
  }

  return (
    <AnimatedTransactionItem
      transaction={transaction}
      onPress={handlePress}
      showDateInSubtitle={showDateInSubtitle}
      compact={compact}
      settings={settings}
      getTrueHourlyRateForDate={getTrueHourlyRateForDate}
    />
  );
}

export const TransactionItem = memo(
  TransactionItemComponent,
  (prev, next) =>
    prev.transaction.id === next.transaction.id &&
    prev.transaction.updatedAt === next.transaction.updatedAt &&
    prev.onPress === next.onPress &&
    prev.onPressTransaction === next.onPressTransaction &&
    prev.disableAnimations === next.disableAnimations &&
    prev.showDateInSubtitle === next.showDateInSubtitle &&
    prev.compact === next.compact &&
    prev.settings.currencySymbol === next.settings.currencySymbol &&
    prev.settings.displayMode === next.settings.displayMode &&
    prev.settings.hourRounding === next.settings.hourRounding &&
    prev.getTrueHourlyRateForDate === next.getTrueHourlyRateForDate,
);
