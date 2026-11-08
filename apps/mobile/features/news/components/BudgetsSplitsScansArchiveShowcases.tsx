import { Archive, Check, ChevronDown, ChevronUp, Info, Trash2 } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { LoadingDots } from '~/components/feedback/LoadingDots';
import { AccountLogo, Text } from '~/components/ui';
import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { ClayIcon } from '~/components/ui/ClayIcon';
import { useApp } from '~/context/AppContext';
import {
  type BudgetRing,
  budgetRingColor,
  BudgetRings,
} from '~/features/budget/components/BudgetRings';
import {
  budgetDaysLeft,
  budgetPeriodKeyForDate,
  budgetPeriodRange,
} from '~/features/budget/lib/budgetPeriods';
import { budgetPeriodName, money, monthNameLabel } from '~/features/budget/lib/format';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';
import { formatDayHeaderParts } from '~/utils/dayHeader';
import { monthCycleOf } from '~/utils/financialMonth';
import { dayKeyFromDateLocal } from '~/utils/formatters';

interface ShowcaseProps {
  width: number;
}

// The showcases draw the real screens in miniature, with the app's own copy.
// Merchant, person and account names are sample data, the same in every language.

/** A switch drawn, not wired: the showcase is a picture of the setting. */
function DrawnSwitch({ on }: { on: boolean }) {
  const colors = useThemeColors();
  return (
    <View
      className="h-6 w-10 justify-center rounded-full px-0.5"
      style={{ backgroundColor: on ? colors.primary : withColorAlpha(colors.border, 0.5) }}
    >
      <View className={`h-5 w-5 rounded-full bg-white ${on ? 'self-end' : 'self-start'}`} />
    </View>
  );
}

const SAMPLE_RINGS: BudgetRing[] = [
  { period: 'year', usageRatio: 0.42, percentLabel: '42%', isOver: false },
  { period: 'month', usageRatio: 0.71, percentLabel: '71%', isOver: false },
  { period: 'week', usageRatio: 0.88, percentLabel: '88%', isOver: false },
];
/** What is left of the sample month: 29% of a 2,000 budget. */
const MONTH_LEFT = 580;

/** The Budget page's card in miniature: the month in focus, with the year
 *  and week budgets as the outer and inner rings. */
export function PeriodBudgetsShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  // The running month and its days left, by the user's month cycle, as the
  // real header works them out.
  const now = new Date();
  const monthCycle = monthCycleOf(settings);
  const monthKey = budgetPeriodKeyForDate('month', now, {
    weekStartsOn: settings.weekStartsOn,
    monthCycle,
  });
  const daysLeft = budgetDaysLeft(budgetPeriodRange('month', monthKey, monthCycle), now);
  const focusColor = budgetRingColor('month', colors);
  // The real page draws the rings at 150; a narrow sheet scales them down.
  const ringSize = Math.min(150, Math.round(width * 0.48));
  return (
    <View className="rounded-3xl border border-border/45 bg-card px-4 pb-4 pt-3" style={{ width }}>
      <View className="flex-row items-center gap-1.5">
        <View
          className="h-10 w-10 items-center justify-center rounded-2xl"
          style={{ backgroundColor: withColorAlpha(focusColor, 0.14) }}
        >
          <CategoryEmoji icon="burger" size={22} />
        </View>
        <View className="ml-1.5 min-w-0 flex-1">
          <Text variant="bodyStrong" numberOfLines={1}>
            {budgetPeriodName('month')}
          </Text>
          <View className="mt-1 flex-row items-center gap-1.5">
            <View
              className="rounded-full px-2 py-0.5"
              style={{ backgroundColor: withColorAlpha(focusColor, 0.12) }}
            >
              <Text
                variant="caption"
                numberOfLines={1}
                className="text-[11px]"
                style={{ color: focusColor }}
              >
                {monthNameLabel(monthKey, settings.locale)}
              </Text>
            </View>
            <Text variant="caption" tone="muted" numberOfLines={1} className="shrink text-[11px]">
              {I18n.t(daysLeft === 1 ? 'budget.days_left_one' : 'budget.days_left_other', {
                count: daysLeft,
              })}
            </Text>
          </View>
        </View>
      </View>
      <View className="mt-3">
        <BudgetRings
          rings={SAMPLE_RINGS}
          focused="month"
          size={ringSize}
          themeColors={colors}
          onFocus={() => undefined}
        >
          <Text
            variant="monoLg"
            numberOfLines={1}
            adjustsFontSizeToFit
            className="self-start text-[24px] leading-[30px]"
            style={{ color: colors.success }}
          >
            {money(MONTH_LEFT, settings)}
          </Text>
        </BudgetRings>
      </View>
    </View>
  );
}

const SHARE_TOTAL = 1000;
const SHARE_PAYMENTS = [300, 350] as const;

/** A Who owes you card for a share paid in parts: what is still owed, of the
 *  whole share, a progress bar and each payment, then Remove and Mark paid. */
export function SplitPartPaymentsShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const paid = SHARE_PAYMENTS.reduce((sum, amount) => sum + amount, 0);
  const owed = SHARE_TOTAL - paid;
  const amount = (value: number) => money(value, settings);
  // Payments on recent days, so the sample never shows a date to come.
  const day = (daysAgo: number) => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return formatDayHeaderParts(dayKeyFromDateLocal(date), settings.locale).dateLabel;
  };
  const paymentDays = [day(6), day(1)];
  return (
    <View
      className="rounded-2xl border border-border/25 bg-card px-4 pb-2.5 pt-3.5"
      style={{ width }}
    >
      <View className="flex-row items-start gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-full bg-secondary/50">
          <Text variant="bodyStrong">A</Text>
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="bodyStrong" numberOfLines={1}>
            Aisha
          </Text>
          <View className="mt-1 max-w-full flex-row items-center gap-1.5 self-start rounded-full bg-secondary/50 py-1 pl-2 pr-2.5">
            <AccountLogo logoId="malaysia/maybank" type="debit" size={16} />
            <Text variant="caption" tone="muted" numberOfLines={1} className="shrink">
              Maybank
            </Text>
            <ChevronDown size={12} color={colors.textMuted} />
          </View>
        </View>
        <View className="items-end">
          <Text variant="bodyStrong">{amount(owed)}</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {I18n.t('transactions.settleUp.share_of_total', { total: amount(SHARE_TOTAL) })}
          </Text>
        </View>
      </View>

      <View className="mt-3 pl-[52px]">
        <View className="h-1.5 overflow-hidden rounded-full bg-secondary/60">
          <View
            className="h-full rounded-full bg-success"
            style={{ width: `${(paid / SHARE_TOTAL) * 100}%` }}
          />
        </View>
        <View className="mt-1.5">
          {SHARE_PAYMENTS.map((payment, index) => (
            <View
              key={index}
              className={`flex-row items-center gap-2 py-1.5 ${index > 0 ? 'border-t border-border/15' : ''}`}
            >
              <Check size={13} color={colors.success} />
              <Text variant="caption" tone="muted" className="flex-1" numberOfLines={1}>
                {paymentDays[index]}
              </Text>
              <Text variant="caption" tone="muted">
                {amount(payment)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="mt-2 flex-row items-center border-t border-border/15 pt-2">
        <View className="flex-row items-center gap-1.5 py-1.5 pr-2">
          <Trash2 size={14} color={colors.textMuted} />
          <Text variant="caption" tone="muted">
            {I18n.t('common.remove')}
          </Text>
        </View>
        <View className="flex-1" />
        <View className="flex-row items-center gap-1 rounded-full bg-success/15 px-3.5 py-2">
          <Check size={14} color={colors.success} />
          <Text variant="caption" className="font-medium text-success">
            {I18n.t('transactions.editor.split.mark_paid')}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Sample receipts already scanned in the batch: merchant and amount. */
const SCANNED_RECEIPTS = [
  { emoji: 'coffee', merchant: 'Kopi Kita', amount: 18.5 },
  { emoji: 'grocery-basket', merchant: 'FreshMart', amount: 64.2 },
  { emoji: 'gas-pump', merchant: 'Petrol Plus', amount: 120 },
] as const;
/** The album picks: the scanned receipts above, and one still scanning. */
const BATCH_PICKS = SCANNED_RECEIPTS.length + 1;

/** The album's numbered picks above the Home card for the batch, opened to
 *  show a row per receipt: logged ones with their amount, one still scanning. */
export function BatchScanShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const amount = (value: number) => money(value, settings);
  // One row of picks, 8pt apart.
  const tile = Math.round((width - (BATCH_PICKS - 1) * 8) / BATCH_PICKS);
  return (
    <View className="gap-2.5" style={{ width }}>
      {/* The album picker's multi-select: numbered picks, in pick order. */}
      <View className="flex-row gap-2">
        {Array.from({ length: BATCH_PICKS }, (_, index) => index + 1).map((pick) => (
          <View
            key={pick}
            className="items-center justify-center rounded-xl border border-border/30 bg-card"
            style={{ width: tile, height: Math.round(tile * 0.9) }}
          >
            <ClayIcon name="money-time/receipt" size={Math.round(tile * 0.5)} flatSize={20} />
            <View
              className="absolute right-1.5 top-1.5 h-5 w-5 items-center justify-center rounded-full border-2 border-card"
              style={{ backgroundColor: colors.sky }}
            >
              <Text variant="caption" className="text-[10px] font-bold text-white">
                {pick}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View className="rounded-2xl border border-border/50 bg-card">
        <View className="flex-row items-center gap-3 px-3 py-2.5">
          <View className="h-11 w-11 items-center justify-center rounded-2xl">
            <ClayIcon name="money-time/receipt" size={32} flatSize={22} />
          </View>
          <View className="flex-1">
            <View className="flex-row items-center justify-between gap-2">
              <View className="min-w-0 flex-1 flex-row items-center">
                <Text
                  variant="caption"
                  className="shrink font-medium text-foreground"
                  numberOfLines={1}
                >
                  {I18n.t('receiptScan.batch_scanning')}
                </Text>
                <LoadingDots size="small" color={colors.textMuted} style={{ marginLeft: 5 }} />
              </View>
              <Text variant="caption" tone="muted">
                {SCANNED_RECEIPTS.length}/{BATCH_PICKS}
              </Text>
            </View>
            <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary/60">
              <View
                className="h-full rounded-full"
                style={{
                  width: `${(SCANNED_RECEIPTS.length / BATCH_PICKS) * 100}%`,
                  backgroundColor: colors.primary,
                }}
              />
            </View>
          </View>
          <View className="h-7 w-7 items-center justify-center rounded-full bg-primary/15">
            <ChevronUp size={16} color={colors.primary} />
          </View>
        </View>
        <View className="border-t border-border/40 px-3 py-1">
          {SCANNED_RECEIPTS.map((receipt) => (
            <View key={receipt.merchant} className="flex-row items-center gap-2.5 py-1.5">
              <ClayIcon name="status/success" size={20} flatSize={15} />
              <CategoryEmoji icon={receipt.emoji} size={18} />
              <Text variant="body" className="flex-1 text-foreground" numberOfLines={1}>
                {receipt.merchant}
              </Text>
              <Text variant="bodyStrong" className="text-foreground" numberOfLines={1}>
                {amount(receipt.amount)}
              </Text>
            </View>
          ))}
          <View className="flex-row items-center gap-2.5 py-1.5">
            <ClayIcon name="money-time/receipt" size={20} flatSize={15} />
            <Text variant="body" tone="muted" numberOfLines={1} className="shrink">
              {I18n.t('receiptScan.banner_scanning').replace(/…\s*$/, '')}
            </Text>
            <LoadingDots size="small" color={colors.textMuted} />
          </View>
        </View>
      </View>
    </View>
  );
}

/** An archived account keeps its balance: the sample shows one left over. */
const ARCHIVED_BALANCE = 12.4;

/** The account editor's Archive account switch, turned on, and the account
 *  waiting under Archived on the Accounts page with its balance kept. */
export function ArchiveAccountsShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  return (
    <View className="gap-2.5" style={{ width }}>
      <View className="gap-3 rounded-[18px] border border-border/30 bg-card px-4 py-3">
        <View className="flex-row items-center gap-2.5">
          <AccountLogo logoId="malaysia/cimb" type="debit" size={28} />
          <Text variant="bodyStrong" numberOfLines={1} className="flex-1">
            CIMB Savings
          </Text>
        </View>
        <View className="h-px bg-border/40" />
        <View className="flex-row items-center justify-between">
          <Text variant="label" tone="muted" numberOfLines={1} className="shrink">
            {I18n.t('accounts.include_in_totals')}
          </Text>
          <DrawnSwitch on />
        </View>
        <View className="flex-row items-center justify-between">
          <View className="shrink flex-row items-center">
            <Text variant="label" tone="muted" numberOfLines={1} className="shrink">
              {I18n.t('accounts.archive_action')}
            </Text>
            <View className="ml-1.5">
              <Info size={14} color={colors.textMuted} />
            </View>
          </View>
          <DrawnSwitch on />
        </View>
      </View>
      <View className="rounded-[18px] border border-border/30 bg-card px-4 py-3">
        <View className="flex-row items-center gap-1.5">
          <Archive size={13} color={colors.textMuted} />
          <Text variant="label" tone="muted" numberOfLines={1}>
            {I18n.t('accounts.archived_section')}
          </Text>
        </View>
        <View className="mt-2 flex-row items-center gap-2.5 opacity-60">
          <AccountLogo logoId="malaysia/cimb" type="debit" size={24} />
          <Text variant="body" numberOfLines={1} className="flex-1 text-foreground">
            CIMB Savings
          </Text>
          <Text variant="body" numberOfLines={1} className="text-foreground">
            {money(ARCHIVED_BALANCE, settings)}
          </Text>
        </View>
      </View>
    </View>
  );
}
