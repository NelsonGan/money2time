import { Pencil, Undo2 } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { Text } from '~/components/ui';
import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { ClayIcon } from '~/components/ui/ClayIcon';
import { PRO_LIMITS } from '~/constants/proLimits';
import { useApp } from '~/context/AppContext';
import { formatPlanDay } from '~/features/instalments/lib/format';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';
import { formatAmount, formatShortMonthYearLabel } from '~/utils/formatters';

interface ShowcaseProps {
  width: number;
}

// The showcases draw the real screens in miniature, with the app's own copy.
// Merchant and product names are sample data, the same in every language.

function useMoney() {
  const { settings } = useApp();
  return (amount: number) => formatAmount(amount, settings, { showSign: false });
}

/** A toggle drawn, not wired: the showcase is a picture of the setting. */
function SwitchOn({ color }: { color: string }) {
  return (
    <View
      className="h-6 w-10 justify-center rounded-full px-0.5"
      style={{ backgroundColor: color }}
    >
      <View className="h-5 w-5 self-end rounded-full bg-white" />
    </View>
  );
}

/** The Auto-review card, and what it sorted: one logged, one ignored. */
export function AutoReviewShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const money = useMoney();
  const left = PRO_LIMITS.FREE_MAX_NOTIFICATION_AI_REVIEWS - 1;
  return (
    <View className="gap-2.5" style={{ width }}>
      <View className="flex-row items-center gap-3 rounded-[18px] border border-border/30 bg-card px-3 py-3">
        <ClayIcon name="status/auto-review" size={40} flatSize={22} />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text variant="bodyStrong" numberOfLines={1}>
            {I18n.t('payment_alerts.ai_title')}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {I18n.t('payment_alerts.ai_quota_left', { count: left })}
          </Text>
          <View className="mt-1 h-6 flex-row items-center gap-1 self-start rounded-full bg-primary/10 px-2">
            <Text variant="caption" numberOfLines={1} className="shrink font-semibold text-primary">
              {I18n.t('payment_alerts.ai_scope_expense')}
            </Text>
            <Pencil size={11} color={colors.primary} />
          </View>
        </View>
        <SwitchOn color={colors.primary} />
      </View>
      <View className="gap-2 rounded-[18px] border border-border/30 bg-card px-3 py-3">
        {/* Counts on their own line: in German the header alone fills the row. */}
        <View className="flex-row items-center gap-2">
          <ClayIcon name="status/sorted" size={30} flatSize={16} />
          <View className="min-w-0 flex-1">
            <Text variant="bodyStrong" numberOfLines={1}>
              {I18n.t('payment_alerts.ai_done_title')}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {`${I18n.t('payment_alerts.ai_logged_count', { count: 1 })} · ${I18n.t(
                'payment_alerts.ai_ignored_count',
                { count: 1 },
              )}`}
            </Text>
          </View>
        </View>
        <View className="h-px bg-border/40" />
        <SortedRow
          icon={<CategoryEmoji icon="burger" size={20} />}
          title="GRAB FOOD"
          detail={I18n.t('nav.expense')}
          amount={money(23.4)}
        />
        <SortedRow
          icon={<ClayIcon name="status/ignored" size={22} flatSize={14} />}
          title="Maybank"
          detail={`${I18n.t('payment_alerts.history_none')} · ${I18n.t(
            'payment_alerts.ai_reason_otp',
          )}`}
        />
      </View>
    </View>
  );
}

function SortedRow({
  icon,
  title,
  detail,
  amount,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  amount?: string;
}) {
  const colors = useThemeColors();
  return (
    <View className="flex-row items-center gap-2.5">
      <View className="h-8 w-8 items-center justify-center rounded-xl bg-secondary/60">{icon}</View>
      <View className="min-w-0 flex-1">
        <Text variant="caption" numberOfLines={1} className="font-semibold text-foreground">
          {title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {amount ? (
        <Text variant="caption" tone="error" numberOfLines={1} className="font-semibold">
          {amount}
        </Text>
      ) : null}
      <View className="h-7 w-7 items-center justify-center rounded-full bg-secondary">
        <Undo2 size={13} color={colors.textMuted} />
      </View>
    </View>
  );
}

/** "Jan", "Feb"... in the app's language, for the chart's axis. */
function monthInitial(index: number): string {
  return new Intl.DateTimeFormat(I18n.locale, { month: 'narrow' }).format(
    new Date(TREND_YEAR, index, 1),
  );
}

/** Monthly spending for the sample Trends chart; the scrubbed month is the last. */
const TREND_VALUES = [2980, 3220, 3410, 3190, 3200, 3560, 3480, 3500, 3146] as const;
const TREND_YEAR = 2026;
const CHART_HEIGHT = 124;
/** Room above the line for the scrub tooltip, so it never covers the line. */
const TOOLTIP_SPACE = 40;

/** The Trends page in miniature: total, vs average, line, average and scrub. */
export function InsightsRedesignShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const line = colors.error;
  const average = TREND_VALUES.reduce((sum, value) => sum + value, 0) / TREND_VALUES.length;
  const scrubbed = TREND_VALUES[TREND_VALUES.length - 1];
  const percent = Math.round(((average - scrubbed) / average) * 100);
  const month = formatShortMonthYearLabel(
    new Date(TREND_YEAR, TREND_VALUES.length - 1, 1),
    I18n.locale,
  );

  const chartWidth = width - 24;
  const min = 2600;
  const max = 3800;
  const x = (index: number) => 8 + (index / (TREND_VALUES.length - 1)) * (chartWidth - 16);
  const y = (value: number) =>
    TOOLTIP_SPACE + (1 - (value - min) / (max - min)) * (CHART_HEIGHT - TOOLTIP_SPACE - 8);
  const points = TREND_VALUES.map((value, index) => ({ x: x(index), y: y(value) }));
  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(' ');
  const last = points[points.length - 1];
  const area = `${path} L${last.x.toFixed(1)},${CHART_HEIGHT} L${points[0].x.toFixed(1)},${CHART_HEIGHT} Z`;
  const avgY = y(average);

  return (
    <View className="gap-2.5" style={{ width }}>
      <View className="flex-row self-center rounded-full bg-secondary p-1">
        {(['breakdown', 'trends'] as const).map((tab) => (
          <View
            key={tab}
            className="rounded-full px-4 py-1.5"
            style={tab === 'trends' ? { backgroundColor: colors.card } : undefined}
          >
            <Text
              variant="caption"
              numberOfLines={1}
              className={
                tab === 'trends' ? 'font-semibold text-foreground' : 'text-muted-foreground'
              }
            >
              {I18n.t(`insights.${tab}`)}
            </Text>
          </View>
        ))}
      </View>
      <View className="rounded-[18px] border border-border/30 bg-card px-3 pb-2 pt-3">
        <View className="items-center gap-1">
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {`${I18n.t('insights.tabs.expense_trend')} · ${month}`}
          </Text>
          <Text variant="heading" numberOfLines={1} style={{ color: line }}>
            {formatAmount(scrubbed, settings, { showSign: false })}
          </Text>
          <View
            className="rounded-full px-2 py-0.5"
            style={{ backgroundColor: withColorAlpha(colors.success, 0.14) }}
          >
            <Text variant="caption" tone="success" numberOfLines={1}>
              {`↓ ${I18n.t('insights.trend_stats.vs_average', { percent })}`}
            </Text>
          </View>
        </View>
        <View style={{ marginTop: 6 }}>
          <Svg width={chartWidth} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={line} stopOpacity={0.22} />
                <Stop offset="1" stopColor={line} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={area} fill="url(#trendFill)" />
            <Line
              x1={0}
              x2={chartWidth}
              y1={avgY}
              y2={avgY}
              stroke={line}
              strokeOpacity={0.55}
              strokeWidth={1.2}
              strokeDasharray="5 4"
            />
            <Line
              x1={last.x}
              x2={last.x}
              y1={TOOLTIP_SPACE - 4}
              y2={CHART_HEIGHT}
              stroke={colors.textMuted}
              strokeOpacity={0.6}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <Path d={path} stroke={line} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
            {points.slice(0, -1).map((point, index) => (
              <Circle key={index} cx={point.x} cy={point.y} r={3.4} fill={line} />
            ))}
            <Circle
              cx={last.x}
              cy={last.y}
              r={5.5}
              fill={line}
              stroke={colors.card}
              strokeWidth={2}
            />
          </Svg>
          {/* The scrub tooltip, anchored above the scrubbed point. */}
          <View
            className="absolute items-end rounded-xl border border-border/30 bg-card px-2 py-1"
            style={{ right: chartWidth - last.x - 6, top: 0 }}
          >
            <Text variant="caption" tone="muted" numberOfLines={1} className="text-[11px]">
              {month}
            </Text>
            <Text variant="caption" numberOfLines={1} className="font-semibold text-foreground">
              {formatAmount(scrubbed, settings, { showSign: false })}
            </Text>
          </View>
        </View>
        <View className="mt-1 flex-row justify-between px-1">
          {TREND_VALUES.map((_, index) => (
            <Text
              key={index}
              variant="caption"
              numberOfLines={1}
              className={`text-[10px] ${index === TREND_VALUES.length - 1 ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
            >
              {monthInitial(index)}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

const PLAN_COUNT = 12;
const PLAN_PAID = 2;
const PLAN_PAYMENT = 200;

/** A plan page in miniature: what is left, the paid segments and Pay now. */
export function InstalmentPlanShowcase({ width }: ShowcaseProps) {
  const colors = useThemeColors();
  const money = useMoney();
  const now = new Date();
  // The next payment falls next month, so the sample never reads as overdue.
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 2).toISOString();
  return (
    <View className="gap-2.5" style={{ width }}>
      <View className="items-center gap-2 rounded-[18px] border border-border/30 bg-card px-4 py-3">
        <View className="flex-row items-center gap-2 self-center">
          <CategoryEmoji icon="shopping-bag" size={30} />
          <Text variant="bodyStrong" numberOfLines={1}>
            MacBook Air
          </Text>
        </View>
        <View className="items-center">
          <Text variant="heading" numberOfLines={1}>
            {money((PLAN_COUNT - PLAN_PAID) * PLAN_PAYMENT)}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {I18n.t('instalments.left_label')}
          </Text>
        </View>
        <View className="w-full flex-row gap-1">
          {Array.from({ length: PLAN_COUNT }, (_, index) => (
            <View
              key={index}
              className="h-1.5 flex-1 rounded-full"
              style={{
                backgroundColor:
                  index < PLAN_PAID ? colors.primary : withColorAlpha(colors.text, 0.08),
              }}
            />
          ))}
        </View>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {I18n.t('instalments.progress_meta', {
            paid: PLAN_PAID,
            count: PLAN_COUNT,
            amount: money(PLAN_PAID * PLAN_PAYMENT),
          })}
        </Text>
      </View>
      <View className="flex-row items-center gap-3 rounded-[18px] border border-border/30 bg-card px-4 py-3">
        <View className="min-w-0 flex-1">
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {I18n.t('instalments.next_payment')}
          </Text>
          {/* Two lines allowed: a long date ("2. Dez.") wraps rather than cut off. */}
          <Text variant="bodyStrong" numberOfLines={2}>
            {`${money(PLAN_PAYMENT)} · ${formatPlanDay(next, now)}`}
          </Text>
        </View>
        <View className="rounded-full bg-primary/10 px-3 py-2">
          <Text variant="caption" tone="primary" numberOfLines={1} className="font-semibold">
            {I18n.t('instalments.pay_now')}
          </Text>
        </View>
      </View>
    </View>
  );
}
