import React, { memo, useMemo } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';

import { CategoryEmoji, Text, TimeValueInline } from '~/components/ui';
import { motionDurations } from '~/constants/motion';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations, UserSettings } from '~/types';
import { cn } from '~/utils';
import {
  amountToHoursByRate,
  formatAmount,
  formatCurrency,
  formatHours,
  formatRelativeDate,
} from '~/utils/formatters';

type TransactionDisplaySettings = Pick<UserSettings, 'currencySymbol' | 'displayMode'>;

interface TransactionItemProps {
  transaction: TransactionWithRelations;
  onPress?: () => void;
  onPressTransaction?: (transaction: TransactionWithRelations) => void;
  onLongPress?: () => void;
  onLongPressTransaction?: (transaction: TransactionWithRelations) => void;
  /** When provided AND the row has unpaid splits, the red count badge becomes
   *  tappable and routes here instead of bubbling to onPress. */
  onPressSplitBadge?: (transaction: TransactionWithRelations) => void;
  disableAnimations?: boolean;
  showDateInSubtitle?: boolean;
  compact?: boolean;
  selected?: boolean;
  selectionMode?: boolean;
  settings: TransactionDisplaySettings;
  getTrueHourlyRateForDate: (dateIso: string) => number;
}

interface TransactionItemViewProps {
  transaction: TransactionWithRelations;
  onPress?: () => void;
  onLongPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  onPressSplitBadge?: () => void;
  showDateInSubtitle: boolean;
  compact: boolean;
  selected: boolean;
  selectionMode: boolean;
  settings: TransactionDisplaySettings;
  getTrueHourlyRateForDate: (dateIso: string) => number;
}

function TransactionItemView({
  transaction,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  onPressSplitBadge,
  showDateInSubtitle,
  compact,
  selected,
  selectionMode,
  settings,
  getTrueHourlyRateForDate,
}: TransactionItemViewProps) {
  const themeColors = useThemeColors();
  const isLegacyAdjustmentTransfer =
    transaction.type === 'transfer' &&
    !!transaction.accountId &&
    !transaction.fromAccountId &&
    !transaction.toAccountId;
  const isIncome = transaction.type === 'income';
  const isTransfer = transaction.type === 'transfer' && !isLegacyAdjustmentTransfer;
  const isBalanceAdjustment =
    transaction.type === 'balance_adjustment' || isLegacyAdjustmentTransfer;
  const isTimeMode = settings.displayMode === 'time';

  const hasNote = Boolean(transaction.note);
  let categoryInline: string | null = null;
  let categoryPrimaryLabel: string | null = null;
  if (!isTransfer && !isBalanceAdjustment) {
    const categoryChild: string = String(
      transaction.categoryName ?? I18n.t('common.uncategorized'),
    );
    const categoryParent: string | null = transaction.categoryParentName
      ? String(transaction.categoryParentName)
      : null;
    const hasSubcategory = Boolean(categoryParent && transaction.categoryName);
    const categoryPrimary: string = hasSubcategory
      ? (categoryParent ?? categoryChild)
      : categoryChild;
    categoryPrimaryLabel = categoryPrimary;
    const categorySecondary: string | null = hasSubcategory ? categoryChild : null;
    categoryInline = categorySecondary
      ? `${categoryPrimary} • ${categorySecondary}`
      : categoryPrimary;
  }
  const dateLabel = showDateInSubtitle ? formatRelativeDate(transaction.date) : null;
  const transferLabel =
    isTransfer && !hasNote
      ? `${transaction.fromAccountName ?? I18n.t('common.unknown')} → ${transaction.toAccountName ?? I18n.t('common.unknown')}`
      : null;
  const transferSubtitleLabel = I18n.t('transactions.filters.moved');
  const accountSubtitleLabel = !isTransfer
    ? (transaction.accountName ?? I18n.t('common.no_account'))
    : null;

  const splitsSummary = transaction.splitsSummary;
  // Tint the row + show a count badge while friends still owe. Once everyone's
  // settled, the parent expense already reflects only the user's share so the
  // row reverts to the standard look.
  const unpaidSplitsCount = splitsSummary
    ? Math.max(0, splitsSummary.count - splitsSummary.paidCount)
    : 0;
  const hasUnpaidSplits = unpaidSplitsCount > 0;

  const title = isTransfer
    ? transaction.note || transferLabel
    : isBalanceAdjustment
      ? transaction.note || I18n.t('transactions.filters.adjustment')
      : transaction.note || (categoryInline ?? I18n.t('common.uncategorized'));
  const joinSubtitleParts = (...parts: (string | null | undefined)[]) =>
    parts.filter((part): part is string => Boolean(part && part.trim().length > 0)).join(' · ');

  const subtitlePrimary = isTransfer
    ? showDateInSubtitle
      ? joinSubtitleParts(dateLabel, transferSubtitleLabel)
      : transferSubtitleLabel
    : isBalanceAdjustment
      ? showDateInSubtitle
        ? joinSubtitleParts(dateLabel, I18n.t('transactions.filters.adjustment'))
        : I18n.t('transactions.filters.adjustment')
      : showDateInSubtitle
        ? transaction.note
          ? joinSubtitleParts(dateLabel, categoryPrimaryLabel ?? categoryInline)
          : dateLabel
        : transaction.note
          ? categoryInline
          : null;
  const rate = !isTransfer && !isBalanceAdjustment ? getTrueHourlyRateForDate(transaction.date) : 0;
  const hasCategoryRef = Boolean(transaction.categoryIcon || transaction.categoryName);
  const amountToneClass = isTransfer
    ? 'text-muted-foreground'
    : isBalanceAdjustment
      ? transaction.amount > 0
        ? 'text-success'
        : transaction.amount < 0
          ? 'text-destructive'
          : 'text-muted-foreground'
      : isIncome
        ? 'text-success'
        : 'text-destructive';
  const primaryValue = formatAmount(transaction.amount, settings, {
    showSign: isBalanceAdjustment,
    neutralSign: isTransfer,
    trueHourlyRate: isTransfer || isBalanceAdjustment ? 0 : rate,
  });
  const secondaryValue =
    isTransfer || isBalanceAdjustment || rate <= 0
      ? null
      : isTimeMode
        ? formatCurrency(transaction.amount, settings.currencySymbol)
        : formatHours(amountToHoursByRate(transaction.amount, rate));
  const showsPrimaryTime = isTimeMode && rate > 0 && !isTransfer && !isBalanceAdjustment;
  const showsSecondaryTime = !isTimeMode && secondaryValue !== null;
  const valueColumnClassName = compact ? 'w-[96px]' : 'w-[116px]';
  const amountToneColor = isTransfer
    ? themeColors.textMuted
    : isBalanceAdjustment
      ? transaction.amount > 0
        ? themeColors.success
        : transaction.amount < 0
          ? themeColors.error
          : themeColors.textMuted
      : isIncome
        ? themeColors.success
        : themeColors.error;

  // Color-coded accent strip
  const accentColor = useMemo(() => {
    if (isTransfer) return themeColors.textMuted;
    if (isBalanceAdjustment) return themeColors.primary;
    if (isIncome) return themeColors.success;
    return themeColors.error;
  }, [isTransfer, isBalanceAdjustment, isIncome, themeColors]);

  return (
    <View className={cn('relative', compact ? 'mb-1' : 'mb-1.5')}>
      {hasUnpaidSplits ? (
        <Pressable
          onPress={onPressSplitBadge}
          disabled={!onPressSplitBadge}
          hitSlop={8}
          className="absolute z-10 -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive border-2 border-background items-center justify-center"
        >
          <Text className="text-white text-[10px] font-bold leading-[12px]">
            {unpaidSplitsCount}
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        className={cn(
          'flex-row items-center border shadow-soft overflow-hidden',
          hasUnpaidSplits ? 'bg-warning/10 border-warning/25' : 'bg-card border-border/30',
          selectionMode && selected ? 'border-primary/50 bg-primary/15' : null,
          compact ? 'gap-2 px-2.5 py-2 rounded-[18px]' : 'gap-3 pl-0 pr-3.5 py-3 rounded-[22px]',
        )}
      >
        {/* Color-coded left accent strip */}
        {!compact ? (
          <View
            className="w-[3px] self-stretch rounded-full ml-1"
            style={{ backgroundColor: accentColor, opacity: 0.5 }}
          />
        ) : null}

        {selectionMode ? (
          <View
            className={cn(
              'mr-1 h-5 w-5 rounded-full border items-center justify-center',
              selected ? 'border-primary bg-primary/20' : 'border-border/50 bg-secondary/35',
            )}
          >
            {selected ? (
              <Text variant="label" className="text-primary">
                ✓
              </Text>
            ) : null}
          </View>
        ) : null}

        <View
          className={cn(
            'items-center justify-center',
            compact ? 'w-8 h-8' : 'w-10 h-10 rounded-2xl',
            !compact && !isTransfer && !isBalanceAdjustment ? 'bg-secondary/40' : null,
            isTransfer ? 'rounded-full bg-secondary/50' : null,
            isBalanceAdjustment ? 'rounded-full bg-primary/10' : null,
          )}
        >
          {isTransfer ? (
            <Text className={compact ? 'text-[15px]' : 'text-[18px]'}>↔️</Text>
          ) : isBalanceAdjustment ? (
            <Text className={compact ? 'text-[15px]' : 'text-[18px]'}>⚖️</Text>
          ) : hasCategoryRef ? (
            <CategoryEmoji
              icon={transaction.categoryIcon}
              className={compact ? 'text-[15px]' : 'text-[18px]'}
            />
          ) : (
            <Text className={compact ? 'text-[15px]' : 'text-[18px]'}>
              {isIncome ? '⬆️' : '⬇️'}
            </Text>
          )}
        </View>

        <View className="flex-1 min-w-0 pr-1">
          <Text
            variant="bodyStrong"
            className={cn(
              'min-w-0 text-foreground',
              compact ? 'text-[13px] leading-[16px]' : 'text-[15px] leading-[20px]',
            )}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitlePrimary || accountSubtitleLabel ? (
            accountSubtitleLabel ? (
              <View className={cn('flex-row items-center', compact ? '' : 'mt-0.5')}>
                <View className="min-w-0 w-1/2 pr-2">
                  <Text variant="caption" tone="muted" numberOfLines={1}>
                    {subtitlePrimary ?? ''}
                  </Text>
                </View>
                <View className="min-w-0 w-1/2 justify-center pl-2">
                  <View className="max-w-full self-start rounded-full border border-border/30 bg-secondary/55 px-2 py-0.5">
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {accountSubtitleLabel}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <Text
                variant="caption"
                tone="muted"
                className={compact ? '' : 'mt-0.5'}
                numberOfLines={1}
              >
                {subtitlePrimary ?? ''}
              </Text>
            )
          ) : null}
        </View>

        <View className={cn('shrink-0 items-end', valueColumnClassName)}>
          <View className="flex-row items-center justify-end gap-1">
            {showsPrimaryTime ? (
              <TimeValueInline
                value={primaryValue}
                variant="mono"
                containerClassName="justify-end"
                textClassName={cn(
                  compact ? 'text-[13px] leading-[16px]' : 'text-[15px] leading-[20px]',
                  amountToneClass,
                )}
                iconSize={compact ? 10 : 11}
                iconColor={amountToneColor}
              />
            ) : (
              <Text
                variant="mono"
                className={cn(
                  compact ? 'text-[13px] leading-[16px]' : 'text-[15px] leading-[20px]',
                  amountToneClass,
                )}
              >
                {primaryValue}
              </Text>
            )}
          </View>
          {secondaryValue ? (
            showsSecondaryTime ? (
              <TimeValueInline
                value={secondaryValue}
                variant="label"
                tone="muted"
                containerClassName={cn('justify-end', compact ? '' : 'mt-0.5')}
                iconSize={compact ? 9 : 10}
                numberOfLines={1}
              />
            ) : (
              <Text
                variant="label"
                tone="muted"
                className={compact ? '' : 'mt-0.5'}
                numberOfLines={1}
              >
                {secondaryValue}
              </Text>
            )
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

function AnimatedTransactionItem({
  transaction,
  onPress,
  onLongPress,
  onPressSplitBadge,
  showDateInSubtitle,
  compact,
  selected,
  selectionMode,
  settings,
  getTrueHourlyRateForDate,
}: TransactionItemViewProps) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.98 });

  return (
    <Animated.View
      layout={Platform.OS === 'android' ? undefined : Layout.springify().damping(18).stiffness(260)}
      entering={FadeIn.duration(motionDurations.fast)}
      exiting={FadeOut.duration(motionDurations.fast)}
      style={animatedStyle}
    >
      <TransactionItemView
        transaction={transaction}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPressSplitBadge={onPressSplitBadge}
        showDateInSubtitle={showDateInSubtitle}
        compact={compact}
        selected={selected}
        selectionMode={selectionMode}
        settings={settings}
        getTrueHourlyRateForDate={getTrueHourlyRateForDate}
      />
    </Animated.View>
  );
}

function StaticTransactionItem({
  transaction,
  onPress,
  onLongPress,
  onPressSplitBadge,
  showDateInSubtitle,
  compact,
  selected,
  selectionMode,
  settings,
  getTrueHourlyRateForDate,
}: TransactionItemViewProps) {
  return (
    <TransactionItemView
      transaction={transaction}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressSplitBadge={onPressSplitBadge}
      showDateInSubtitle={showDateInSubtitle}
      compact={compact}
      selected={selected}
      selectionMode={selectionMode}
      settings={settings}
      getTrueHourlyRateForDate={getTrueHourlyRateForDate}
    />
  );
}

function TransactionItemComponent({
  transaction,
  onPress,
  onPressTransaction,
  onLongPress,
  onLongPressTransaction,
  onPressSplitBadge,
  disableAnimations = false,
  showDateInSubtitle = true,
  compact = false,
  selected = false,
  selectionMode = false,
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
  const handleLongPress = onLongPress
    ? () => {
        void triggerHaptic('medium');
        onLongPress();
      }
    : onLongPressTransaction
      ? () => {
          void triggerHaptic('medium');
          onLongPressTransaction(transaction);
        }
      : undefined;
  const handlePressSplitBadge = onPressSplitBadge
    ? () => {
        void triggerHaptic('light');
        onPressSplitBadge(transaction);
      }
    : undefined;

  if (disableAnimations) {
    return (
      <StaticTransactionItem
        transaction={transaction}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onPressSplitBadge={handlePressSplitBadge}
        showDateInSubtitle={showDateInSubtitle}
        compact={compact}
        selected={selected}
        selectionMode={selectionMode}
        settings={settings}
        getTrueHourlyRateForDate={getTrueHourlyRateForDate}
      />
    );
  }

  return (
    <AnimatedTransactionItem
      transaction={transaction}
      onPress={handlePress}
      onLongPress={handleLongPress}
      onPressSplitBadge={handlePressSplitBadge}
      showDateInSubtitle={showDateInSubtitle}
      compact={compact}
      selected={selected}
      selectionMode={selectionMode}
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
    prev.onLongPress === next.onLongPress &&
    prev.onLongPressTransaction === next.onLongPressTransaction &&
    prev.onPressSplitBadge === next.onPressSplitBadge &&
    prev.disableAnimations === next.disableAnimations &&
    prev.showDateInSubtitle === next.showDateInSubtitle &&
    prev.compact === next.compact &&
    prev.selected === next.selected &&
    prev.selectionMode === next.selectionMode &&
    prev.settings.currencySymbol === next.settings.currencySymbol &&
    prev.settings.displayMode === next.settings.displayMode &&
    prev.getTrueHourlyRateForDate === next.getTrueHourlyRateForDate,
);
