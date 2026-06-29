import { CalendarClock, CalendarDays, Package, Plus, Wallet } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import {
  Button,
  ItemIcon,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  TimeValueInline,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { ItemWithStats, UserSettings } from '~/types';
import { withColorAlpha } from '~/utils/color';
import { convert } from '~/utils/currency';
import { formatAmount, formatHours, formatMonthYearLabel } from '~/utils/formatters';

interface ItemsScreenProps {
  /** When provided, renders a standalone header with this back action (settings push). */
  onBack?: () => void;
  /** Opens the add/edit editor. In embedded mode the host gates + provides the add button. */
  onOpenItem: (itemId?: string) => void;
  /** Embedded inside the assets tab host (no own header / add button). */
  embedded?: boolean;
  safeAreaEdges?: Edge[];
}

const NOOP = () => {};

/** Money in the item's own currency, ignoring the time display mode. */
function formatMoney(value: number, currency: string, settings: UserSettings): string {
  return formatAmount(value, { ...settings, displayMode: 'money' }, { currencyCode: currency });
}

/** Local Date from a `YYYY-MM-DD` day key (no UTC drift across the month boundary). */
function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * The daily-cost value as it should read under the active display mode: hours of
 * work when the global toggle is on Time (and a wage is set), money otherwise.
 */
function DailyValue({
  item,
  settings,
  variant = 'subheading',
}: {
  item: ItemWithStats;
  settings: UserSettings;
  variant?: React.ComponentProps<typeof Text>['variant'];
}) {
  const showTime = settings.displayMode === 'time' && item.dailyWorkHours != null;
  if (showTime) {
    return (
      <TimeValueInline
        value={formatHours(item.dailyWorkHours as number)}
        variant={variant}
        textClassName="text-primary"
      />
    );
  }
  return (
    <Text variant={variant} className="text-primary">
      {formatMoney(item.dailyCost, item.currency, settings)}
    </Text>
  );
}

function StatusPill({
  active,
  themeColors,
}: {
  active: boolean;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  const color = active ? themeColors.success : themeColors.mutedForeground;
  return (
    <View
      className="rounded-full px-2 py-0.5"
      style={{ backgroundColor: withColorAlpha(color, 0.12) }}
    >
      <Text variant="label" className="text-[9px]" style={{ color }}>
        {active ? I18n.t('items.status_active') : I18n.t('items.status_inactive')}
      </Text>
    </View>
  );
}

function MetaRow({
  icon: Icon,
  text,
  themeColors,
}: {
  icon: typeof CalendarDays;
  text: string;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Icon size={12} color={themeColors.textMuted} strokeWidth={2.2} />
      <Text variant="caption" tone="muted" numberOfLines={1} className="flex-1">
        {text}
      </Text>
    </View>
  );
}

/** Square index card (two per row). */
function ItemCard({
  item,
  settings,
  themeColors,
  onPress,
}: {
  item: ItemWithStats;
  settings: UserSettings;
  themeColors: ReturnType<typeof useThemeColors>;
  onPress: () => void;
}) {
  const purchaseLabel = formatMonthYearLabel(dayKeyToDate(item.purchaseDate), settings.locale);

  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      style={{ width: '48%' }}
      className="mb-3 overflow-hidden rounded-2xl border border-border/45 bg-card p-2.5"
    >
      {/* Hero image — the product image is the focal point of the card. No tile
          background, and shown in full (never cropped). */}
      <View style={{ aspectRatio: 1 }} className="p-2">
        <ItemIcon iconId={item.iconId} fill />
      </View>

      <View className="mt-2.5 flex-row items-center gap-2 px-1">
        <Text variant="bodyStrong" numberOfLines={1} className="flex-1">
          {item.name}
        </Text>
        <StatusPill active={item.isActive} themeColors={themeColors} />
      </View>
      <View className="mt-0.5 flex-row items-baseline gap-1 px-1">
        <DailyValue item={item} settings={settings} />
        <Text variant="caption" tone="muted">
          {I18n.t('items.per_day')}
        </Text>
      </View>

      <View className="mt-3 gap-1.5 border-t border-border/30 pt-2.5">
        <MetaRow
          icon={CalendarDays}
          themeColors={themeColors}
          text={`${purchaseLabel} · ${I18n.t('items.days_count', { count: item.daysOwned })}`}
        />
        <MetaRow
          icon={Wallet}
          themeColors={themeColors}
          text={formatMoney(item.purchasePrice, item.currency, settings)}
        />
      </View>
    </Pressable>
  );
}

/**
 * Overview card matching the accounts summary: a hero figure (total value) over a
 * two-stat footer (cost per day + item count). The cost-per-day stat respects the
 * global money/time toggle.
 */
function ItemsSummaryBlock({
  totalValue,
  dailyCostNode,
  itemCount,
  themeColors,
}: {
  totalValue: string;
  dailyCostNode: React.ReactNode;
  itemCount: number;
  themeColors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View className="w-full overflow-hidden rounded-2xl border border-border/45 bg-card">
      <View
        pointerEvents="none"
        className="absolute -right-8 -top-8 h-28 w-28 rounded-full"
        style={{ backgroundColor: themeColors.primary, opacity: 0.1 }}
      />

      <View className="px-4 pb-3 pt-3.5">
        <View className="flex-row items-center gap-1.5">
          <Wallet size={12} color={themeColors.primary} strokeWidth={2.4} />
          <Text variant="label" className="text-[10px] text-primary">
            {I18n.t('items.summary_total_value')}
          </Text>
        </View>
        <Text variant="monoLg" className="mt-1.5">
          {totalValue}
        </Text>
      </View>

      <View className="h-px bg-border/40" />

      <View className="flex-row">
        <View className="flex-1 px-4 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <CalendarClock size={12} color={themeColors.textMuted} strokeWidth={2.4} />
            <Text variant="label" className="text-[10px]" tone="muted">
              {I18n.t('items.summary_daily_cost')}
            </Text>
          </View>
          <View className="mt-1">{dailyCostNode}</View>
        </View>
        <View className="w-px bg-border/40" />
        <View className="flex-1 px-4 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <Package size={12} color={themeColors.textMuted} strokeWidth={2.4} />
            <Text variant="label" className="text-[10px]" tone="muted">
              {I18n.t('items.summary_counts')}
            </Text>
          </View>
          <Text variant="mono" className="mt-1">
            {itemCount}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function ItemsScreen({
  onBack,
  onOpenItem,
  embedded = false,
  safeAreaEdges = ['top'],
}: ItemsScreenProps) {
  const { items, settings, rateTable } = useApp();
  const { checkLimit } = useProGate();
  const themeColors = useThemeColors();
  const listNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);

  const handleAdd = useCallback(() => {
    if (!checkLimit('items', items.length)) return;
    onOpenItem();
  }, [checkLimit, items.length, onOpenItem]);

  // Totals are summed in the reporting currency: each item's native-currency
  // amount is converted via the FX table so mixed-currency items aggregate
  // correctly (per-item cards still render in each item's own currency).
  const summary = useMemo(() => {
    const reporting = settings.currencyCode;
    const toReporting = (value: number, currency: string) =>
      convert(value, currency, reporting, rateTable).value;
    const active = items.filter((i) => i.isActive);
    const totalValue = items.reduce((sum, i) => sum + toReporting(i.purchasePrice, i.currency), 0);
    const dailyCost = active.reduce((sum, i) => sum + toReporting(i.dailyCost, i.currency), 0);
    const dailyWork = active.reduce((sum, i) => sum + (i.dailyWorkHours ?? 0), 0);
    const hasWage = active.some((i) => i.dailyWorkHours != null);
    return { totalValue, dailyCost, dailyWork, hasWage };
  }, [items, rateTable, settings.currencyCode]);

  const showTime = settings.displayMode === 'time' && summary.hasWage;
  const dailyCostNode = showTime ? (
    <TimeValueInline
      value={formatHours(summary.dailyWork)}
      variant="mono"
      iconColor={themeColors.primary}
    />
  ) : (
    <Text variant="mono">{formatMoney(summary.dailyCost, settings.currencyCode, settings)}</Text>
  );

  return (
    <SettingsPageLayout edges={safeAreaEdges}>
      {!embedded ? (
        <View className="px-5">
          <SettingsHeader
            className="px-0 pt-5 pb-1"
            onBack={onBack}
            title={I18n.t('items.title')}
            subtitle={I18n.t('items.subtitle')}
            rightAccessory={
              <Button size="icon" onPress={handleAdd} accessibilityLabel={I18n.t('items.add')}>
                <Plus size={18} color="#fff" />
              </Button>
            }
          />
        </View>
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title={I18n.t('items.empty_title')}
          message={I18n.t('items.empty_message')}
          mascotMood="curious"
          animateIn={false}
        />
      ) : (
        <>
          {/* Same pinned-overview structure as the accounts page so the cards
              line up pixel-for-pixel when switching tabs. */}
          <MonthControlsHeader
            title=""
            monthLabel=""
            onPrevMonth={NOOP}
            onNextMonth={NOOP}
            hideTitleRow
            hideNavigation
            showAccent={false}
          >
            <ItemsSummaryBlock
              totalValue={formatMoney(summary.totalValue, settings.currencyCode, settings)}
              dailyCostNode={dailyCostNode}
              itemCount={items.length}
              themeColors={themeColors}
            />
          </MonthControlsHeader>
          <ScrollView
            className="flex-1"
            contentContainerStyle={[
              { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
              listNavInset,
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View className="flex-row flex-wrap justify-between">
              {items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  settings={settings}
                  themeColors={themeColors}
                  onPress={() => onOpenItem(item.id)}
                />
              ))}
            </View>
          </ScrollView>
        </>
      )}
    </SettingsPageLayout>
  );
}
