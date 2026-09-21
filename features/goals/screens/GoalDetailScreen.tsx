import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, Pencil } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CategoryEmoji, SettingsHeader, Text } from '~/components/ui';
import { useApp, useTransactions } from '~/context/AppContext';
import {
  type DepositSource,
  DepositSourceSheet,
  type WithdrawTarget,
  WithdrawTargetSheet,
} from '~/features/goals/components/GoalMoneySheets';
import { useGoals } from '~/features/goals/useGoals';
import { SavingsRateRing } from '~/features/insights/components/SavingsRateRing';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { getGoalCoverUri } from '~/services/userAssets';
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
// The hero sheet carries its own padding, so the scroll container adds none —
// the photo has to reach the screen's edges.
const HERO_SCROLL_CONTENT = { paddingBottom: 0 } as const;
// Pulls the content sheet up over the bottom of the cover photo, which is what
// makes the page read as a sheet resting on the image rather than two stacked
// blocks. Matches the sheet's own 28px corner radius.
const SHEET_OVERLAP_PX = 26;
const SHEET_OVERLAP = { marginTop: -SHEET_OVERLAP_PX } as const;
const OVER_PHOTO_CHIP = { backgroundColor: 'rgba(0,0,0,0.45)' } as const;
// Share of the screen the cover photo takes before the content starts.
const HERO_HEIGHT_RATIO = 0.38;
// Height of the header bar below the status bar, and the scroll distance over
// which the floating chrome turns into it.
const HEADER_BAR_HEIGHT = 54;
const HEADER_FADE_DISTANCE = 56;
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

/** Label for an activity row; the user's own words win over a generic type name. */
function labelForTransaction(tx: TransactionWithRelations): string {
  const own = tx.note?.trim() || tx.categoryName;
  if (own) return own;
  switch (tx.type) {
    case 'transfer':
      return I18n.t('goals.activity_transfer');
    case 'balance_adjustment':
      return I18n.t('transactions.balance_adjustment_transaction_note');
    case 'income':
      return I18n.t('nav.income');
    default:
      return I18n.t('nav.expense');
  }
}

/**
 * One control in the cover-photo header. Over the photo it is a dark
 * translucent circle with a white glyph; once the photo has scrolled past it is
 * the ordinary card chip with a muted glyph. Both layers are rendered and
 * crossfaded by the scroll position rather than swapped at a threshold, so the
 * change follows the finger — and the Pressable underneath never changes, so a
 * press in progress is not interrupted by the transition.
 */
function HeroHeaderButton({
  onPress,
  accessibilityLabel,
  floatingStyle,
  solidStyle,
  renderIcon,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  floatingStyle: ReturnType<typeof useAnimatedStyle>;
  solidStyle: ReturnType<typeof useAnimatedStyle>;
  renderIcon: (overPhoto: boolean) => React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      className="h-10 w-10 items-center justify-center"
    >
      <Animated.View
        style={[floatingStyle, OVER_PHOTO_CHIP]}
        className="absolute inset-0 items-center justify-center rounded-full"
        pointerEvents="none"
      >
        {renderIcon(true)}
      </Animated.View>
      <Animated.View
        style={solidStyle}
        className="absolute inset-0 items-center justify-center rounded-full border border-border/30 bg-card"
        pointerEvents="none"
      >
        {renderIcon(false)}
      </Animated.View>
    </Pressable>
  );
}

/** One line in the goal's activity list. */
interface GoalActivityRow {
  key: string;
  label: string;
  date: string;
  amount: number;
}

export function GoalDetailScreen({
  accountId,
  onClose,
  onEdit,
  onDeposit,
  onWithdraw,
  onOpenAllActivity,
}: GoalDetailScreenProps) {
  const { settings, currentMonthWage, getTransactionsByAccount, setGoalArchived, isLoading } =
    useApp();
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
  const allActivity = useMemo(
    () => getTransactionsByAccount(accountId),
    [accountId, getTransactionsByAccount, allTransactions],
  );
  const transactions = useMemo(() => allActivity.slice(0, RECENT_LIMIT), [allActivity]);

  // Money a goal is created with sits on the account as its starting balance
  // rather than as a transaction, so the activity list would read "nothing yet"
  // while the ring already counts it. Append it as the oldest row. Skipped once
  // the list is truncated, where a row for the goal's origin would look like it
  // were merely the next-oldest transaction.
  const activityRows = useMemo<GoalActivityRow[]>(() => {
    const account = goal?.account;
    const rows: GoalActivityRow[] = transactions.map((tx) => ({
      key: tx.id,
      label: labelForTransaction(tx),
      date: tx.date,
      amount: amountForGoal(tx, accountId),
    }));
    if (account && account.startingBalance !== 0 && allActivity.length <= RECENT_LIMIT) {
      rows.push({
        key: `${account.id}-starting-balance`,
        label: I18n.t('accounts.starting_balance'),
        date: account.createdAt,
        amount: account.startingBalance,
      });
    }
    return rows;
  }, [accountId, allActivity.length, goal?.account, transactions]);

  const trueHourlyRate = currentMonthWage?.trueHourlyRate ?? 0;

  // Read before the "goal went away" early return below, since hooks cannot be
  // conditional — hence `goal?.account` rather than the destructured account.
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const heroHeight = Math.round(windowHeight * HERO_HEIGHT_RATIO);
  const coverUri = useMemo(
    () => getGoalCoverUri(goal?.account.goalCoverUri),
    [goal?.account.goalCoverUri],
  );
  // Skip a uri that failed to load natively; see CategoryEmoji for why.
  const [brokenCoverUri, setBrokenCoverUri] = useState<string | null>(null);
  const effectiveCoverUri = coverUri !== brokenCoverUri ? coverUri : null;

  // Drives the header's hand-off from floating chrome to a solid bar. The
  // crossfade finishes exactly as the photo's bottom edge meets the bar, so the
  // bar arrives at the moment there is no longer a photo behind the controls.
  const scrollY = useSharedValue(0);
  const onHeroScroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const headerBarHeight = insets.top + HEADER_BAR_HEIGHT;
  const fadeEnd = Math.max(1, heroHeight - headerBarHeight);
  const fadeStart = Math.max(0, fadeEnd - HEADER_FADE_DISTANCE);
  // A goal with little activity does not have enough content to scroll the
  // photo out from behind the bar, which left the header parked half-faded for
  // good — the one state it should never rest in. Giving the sheet a floor of
  // one screen (plus what it overlaps) guarantees the scroll range always
  // covers `fadeEnd`, so the transition can finish. On a page that is already
  // long enough this does nothing.
  const sheetMinHeight = windowHeight - headerBarHeight + SHEET_OVERLAP_PX;
  const solidHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [fadeStart, fadeEnd], [0, 1], Extrapolation.CLAMP),
  }));
  const floatingChromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [fadeStart, fadeEnd], [1, 0], Extrapolation.CLAMP),
  }));

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

  // The goal can vanish underneath this screen: usually deleted from the editor
  // pushed on top of it, but a restore or data reset does it too. Dismiss so the
  // user lands back on the goals list rather than on an empty screen they have
  // to back out of by hand. Gated on isLoading so a cold start cannot pop the
  // screen before accounts have been read.
  // The ref keeps this to a single dismiss: onClose is a fresh closure on every
  // render, so without it the effect would re-run and pop again.
  const dismissedRef = useRef(false);
  const goalMissing = goal == null && !isLoading;
  useEffect(() => {
    if (!goalMissing || dismissedRef.current) return;
    dismissedRef.current = true;
    onClose();
  }, [goalMissing, onClose]);

  if (!goal) {
    // Deleted or restored away underneath us; the effect above is dismissing
    // this screen, so render an empty frame rather than a half-built one.
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

  // The glyphs, apart from the chrome around them: the plain header draws them
  // in a card chip, the cover-photo header crossfades between a white copy over
  // the photo and this one.
  const renderArchiveIcon = (overPhoto: boolean) =>
    isArchived ? (
      <ArchiveRestore size={18} color={overPhoto ? '#ffffff' : themeColors.primary} />
    ) : (
      <Archive size={18} color={overPhoto ? '#ffffff' : themeColors.textMuted} />
    );
  const renderEditIcon = (overPhoto: boolean) => (
    <Pencil size={18} color={overPhoto ? '#ffffff' : themeColors.textMuted} />
  );
  const archiveLabel = isArchived ? I18n.t('goals.unarchive') : I18n.t('goals.archive_title');
  const handleEdit = () => {
    void triggerHaptic('selection');
    onEdit(account.id);
  };

  const plainHeaderActions = (
    <View className="flex-row gap-2">
      <Pressable
        onPress={handleArchiveToggle}
        hitSlop={8}
        className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
        accessibilityRole="button"
        accessibilityLabel={archiveLabel}
      >
        {renderArchiveIcon(false)}
      </Pressable>
      <Pressable
        onPress={handleEdit}
        hitSlop={8}
        className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
        accessibilityRole="button"
        accessibilityLabel={I18n.t('goals.edit_title')}
      >
        {renderEditIcon(false)}
      </Pressable>
    </View>
  );

  const detailContent = (
    <>
      {isArchived ? (
        <View className="mb-4 rounded-2xl border border-border/40 bg-secondary/40 px-4 py-3">
          <Text variant="caption" tone="muted">
            {I18n.t('goals.archived_banner')}
          </Text>
        </View>
      ) : null}

      {/* With a cover photo the ring is the second big round thing on the
          screen, and it competes with the photo for the same attention. A bar
          says the same thing in a strip, and it sits under the hero the way a
          caption does. Without a photo the ring is the page's centrepiece and
          stays. */}
      {effectiveCoverUri ? (
        <View>
          {/* The percentage reads as a badge on the end of the amount rather
              than a second number pushed to the far edge: the two say one
              thing, so they belong on the same line in reading order. */}
          <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
            <Text variant="headingSm">
              {I18n.t('goals.saved_of_target', {
                saved: format(progress.saved),
                target: format(progress.target),
              })}
            </Text>
            <View
              className={
                achieved
                  ? 'rounded-full bg-success/15 px-2 py-0.5'
                  : 'rounded-full bg-primary/15 px-2 py-0.5'
              }
            >
              <Text variant="caption" className={achieved ? 'text-success' : 'text-primary'}>
                {Math.round(progress.ratio * 100)}%
              </Text>
            </View>
          </View>
          <View className="mt-3 h-3 overflow-hidden rounded-full bg-secondary/60">
            <View
              className="h-3 rounded-full"
              style={{ width: `${fillRatio * 100}%`, backgroundColor: ringColor }}
            />
          </View>
          {paceLine ? (
            <Text
              variant="caption"
              tone={achieved ? 'primary' : progress.pace === 'behind' ? 'muted' : 'primary'}
              className="mt-2.5"
            >
              {paceLine}
            </Text>
          ) : null}
          {projectionLine ? (
            <Text variant="caption" tone="muted" className="mt-1">
              {projectionLine}
            </Text>
          ) : null}
        </View>
      ) : (
        <View className="items-center">
          <SavingsRateRing
            size={172}
            strokeWidth={14}
            progress={fillRatio}
            color={ringColor}
            trackColor={themeColors.border}
          >
            <View className="items-center">
              <CategoryEmoji icon={account.goalEmoji || 'target'} style={{ fontSize: 34 }} />
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
      )}

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

        {activityRows.length === 0 ? (
          <View className="items-center rounded-[22px] border border-dashed border-border/60 bg-card/60 px-5 py-6">
            <Text variant="caption" tone="muted" className="text-center">
              {I18n.t('goals.activity_empty')}
            </Text>
          </View>
        ) : (
          <View className="rounded-[22px] border border-border/30 bg-card px-4">
            {activityRows.map((row, index) => (
              <View
                key={row.key}
                className={
                  index === 0
                    ? 'flex-row items-center justify-between py-3'
                    : 'flex-row items-center justify-between border-t border-border/20 py-3'
                }
              >
                <View className="flex-1 pr-3">
                  <Text variant="body" numberOfLines={1}>
                    {row.label}
                  </Text>
                  <Text variant="caption" tone="muted" className="mt-0.5">
                    {formatRelativeDate(row.date, settings.locale)}
                  </Text>
                </View>
                <Text variant="mono" className={row.amount >= 0 ? 'text-primary' : undefined}>
                  {formatAmount(row.amount, settings, {
                    showSign: true,
                    trueHourlyRate,
                    currencyCode: account.currency,
                  })}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </>
  );

  // With a cover photo the screen turns into a hero page: the photo runs to the
  // top edge under the status bar, the chrome floats over it, and the content
  // rides up over the photo's bottom on a rounded sheet. Without one, nothing
  // changes — the ordinary header and scroll below are the whole screen.
  const shell = effectiveCoverUri ? (
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        contentContainerStyle={HERO_SCROLL_CONTENT}
        showsVerticalScrollIndicator={false}
        onScroll={onHeroScroll}
        scrollEventThrottle={16}
      >
        <View style={{ height: heroHeight }}>
          <Image
            source={{ uri: effectiveCoverUri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={140}
            onError={() => setBrokenCoverUri(effectiveCoverUri)}
          />
          {/* Top scrim: the floating back/archive/edit chips sit on whatever the
              photo happens to be, so they need a darkened band to read against. */}
          <LinearGradient
            colors={['rgba(0,0,0,0.45)', 'transparent']}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: insets.top + 64,
            }}
            pointerEvents="none"
          />
          {/* Bottom scrim carries the goal's name, which the plain header would
              otherwise be showing. Padded clear of the sheet's overlap below.
              It fades on the same curve as the chrome: the header bar below
              takes over the name, and without this the two titles are both
              half-visible through each other for the length of the crossfade. */}
          <Animated.View
            style={floatingChromeStyle}
            className="absolute inset-x-0 bottom-0"
            pointerEvents="none"
          >
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.65)']}
              style={{ paddingTop: 56, paddingBottom: 38, paddingHorizontal: 20 }}
            >
              <View className="flex-row items-center gap-2">
                <CategoryEmoji icon={account.goalEmoji || 'target'} style={{ fontSize: 22 }} />
                <Text variant="headingSm" numberOfLines={1} className="flex-1 text-white">
                  {account.name}
                </Text>
              </View>
            </LinearGradient>
          </Animated.View>
        </View>

        <View
          className="rounded-t-[28px] bg-background px-5 pb-12 pt-5"
          style={[SHEET_OVERLAP, { minHeight: sheetMinHeight }]}
        >
          {detailContent}
        </View>
      </Animated.ScrollView>

      {/* The bar that the floating chrome becomes. It fades in underneath the
          controls, which keep their position throughout — only what is drawn
          around them changes, so nothing jumps at the hand-off. */}
      <Animated.View
        className="absolute inset-x-0 top-0 border-b border-border/40 bg-background"
        style={[solidHeaderStyle, { height: headerBarHeight, paddingTop: insets.top }]}
        pointerEvents="none"
      >
        <View className="flex-1 justify-center px-[72px]">
          <Text variant="bodyStrong" numberOfLines={1} className="text-center">
            {account.name}
          </Text>
        </View>
      </Animated.View>

      <View
        className="absolute left-5 right-5 flex-row items-center justify-between"
        style={{ top: insets.top + 6 }}
        pointerEvents="box-none"
      >
        <HeroHeaderButton
          onPress={onClose}
          accessibilityLabel={I18n.t('common.back')}
          floatingStyle={floatingChromeStyle}
          solidStyle={solidHeaderStyle}
          renderIcon={(overPhoto) => (
            <ChevronLeft size={20} color={overPhoto ? '#ffffff' : themeColors.textMuted} />
          )}
        />
        <View className="flex-row gap-2">
          <HeroHeaderButton
            onPress={handleArchiveToggle}
            accessibilityLabel={archiveLabel}
            floatingStyle={floatingChromeStyle}
            solidStyle={solidHeaderStyle}
            renderIcon={renderArchiveIcon}
          />
          <HeroHeaderButton
            onPress={handleEdit}
            accessibilityLabel={I18n.t('goals.edit_title')}
            floatingStyle={floatingChromeStyle}
            solidStyle={solidHeaderStyle}
            renderIcon={renderEditIcon}
          />
        </View>
      </View>
    </View>
  ) : (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onClose}
          title={account.name}
          rightAccessory={plainHeaderActions}
        />
      </View>

      <ScrollView contentContainerStyle={SCROLL_CONTENT}>{detailContent}</ScrollView>
    </SafeAreaView>
  );

  return (
    <>
      {shell}
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
    </>
  );
}
