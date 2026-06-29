import {
  CalendarClock,
  CalendarDays,
  Clock,
  GripVertical,
  Package,
  Plus,
  Wallet,
} from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import type { Edge } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

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
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { ItemWithStats, UserSettings } from '~/types';
import { cn } from '~/utils';
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

// Lets the drag handle fill the card's full height (it's a flex child of the
// row), giving a tall, easy-to-grab target.
const HANDLE_STRETCH_STYLE = { alignSelf: 'stretch' } as const;

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
        numberOfLines={1}
      />
    );
  }
  return (
    <Text variant={variant} numberOfLines={1} className="text-primary">
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

function IconStat({
  icon: Icon,
  value,
  themeColors,
  className,
}: {
  icon: typeof Clock;
  value: string;
  themeColors: ReturnType<typeof useThemeColors>;
  className?: string;
}) {
  return (
    <View className={cn('flex-row items-center gap-1', className)}>
      <Icon size={11} color={themeColors.textMuted} strokeWidth={2.2} />
      <Text numberOfLines={1} className="shrink text-[10px] text-foreground">
        {value}
      </Text>
    </View>
  );
}

/** Full-width row card: image centered on the left, attributes on the right. */
function ItemCard({
  item,
  settings,
  themeColors,
  width,
  onPress,
}: {
  item: ItemWithStats;
  settings: UserSettings;
  themeColors: ReturnType<typeof useThemeColors>;
  width: number;
  onPress: () => void;
}) {
  const purchaseLabel = formatMonthYearLabel(dayKeyToDate(item.purchaseDate), settings.locale);

  // Sortable.Flex forces `alignSelf: flex-start` on every child and switches to
  // absolute layout while dragging, so rows never stretch — give the card an
  // explicit width to span the list (matching the accounts management list).
  return (
    <View
      style={{ width }}
      className="flex-row items-center rounded-2xl border border-border/45 bg-card"
    >
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          onPress();
        }}
        className="flex-1 flex-row items-center gap-3.5 py-3.5 pl-3.5"
        accessibilityRole="button"
        accessibilityLabel={item.name}
      >
        {/* Image centered on the left (shown in full, never cropped). */}
        <View className="items-center justify-center" style={{ width: 72, height: 72 }}>
          <ItemIcon iconId={item.iconId} size={68} />
        </View>

        {/* Attributes on the right. */}
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text variant="bodyStrong" numberOfLines={1} className="flex-1">
              {item.name}
            </Text>
            <StatusPill active={item.isActive} themeColors={themeColors} />
          </View>

          <View className="mt-1 flex-row items-baseline gap-1">
            <DailyValue item={item} settings={settings} variant="heading" />
            <Text variant="caption" tone="muted">
              {I18n.t('items.per_day')}
            </Text>
          </View>

          {/* Days owned · total paid · purchase month — equal columns split by
            vertical dividers so the figures line up across every card. */}
          <View className="mt-2.5 flex-row items-center gap-2">
            <IconStat
              className="flex-1"
              icon={Clock}
              themeColors={themeColors}
              value={I18n.t('items.days_count', { count: item.daysOwned })}
            />
            <View className="h-3.5 w-px bg-border/50" />
            <IconStat
              className="flex-1"
              icon={Wallet}
              themeColors={themeColors}
              value={formatMoney(item.purchasePrice, item.currency, settings)}
            />
            <View className="h-3.5 w-px bg-border/50" />
            <IconStat
              className="flex-1"
              icon={CalendarDays}
              themeColors={themeColors}
              value={purchaseLabel}
            />
          </View>
        </View>
      </Pressable>

      {/* Triple-line drag handle — only this area starts a reorder drag, so the
          rest of the card stays tappable. Stretched full-height for an easy grab. */}
      <Sortable.Handle style={HANDLE_STRETCH_STYLE}>
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${I18n.t('common.reorder')} ${item.name}`}
          className="flex-1 items-center justify-center pl-1 pr-3"
        >
          <GripVertical size={18} color={withColorAlpha(themeColors.textMuted, 0.55)} />
        </View>
      </Sortable.Handle>
    </View>
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
  const { items, settings, rateTable, reorderItems } = useApp();
  const { checkLimit } = useProGate();
  const themeColors = useThemeColors();
  const listNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
  const listScrollRef = useAnimatedRef<React.ElementRef<typeof Animated.ScrollView>>();
  const { contentWidth } = useDeviceLayout();
  // The list pads `spacing.lg` on each side; cards span the remaining width.
  const cardWidth = Math.max(contentWidth - spacing.lg * 2, 0);

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
    const totalValue = active.reduce((sum, i) => sum + toReporting(i.purchasePrice, i.currency), 0);
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
          <Animated.ScrollView
            ref={listScrollRef}
            className="flex-1"
            contentContainerStyle={[
              { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
              listNavInset,
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Sortable.Flex
              activeItemScale={1.02}
              activeItemShadowOpacity={0.08}
              customHandle
              dragActivationDelay={0}
              flexDirection="column"
              flexWrap="nowrap"
              gap={10}
              inactiveItemOpacity={1}
              onDragEnd={({ fromIndex, order, toIndex }) => {
                if (fromIndex === toIndex) return;
                const ordered = order(items);
                reorderItems(ordered.map((item) => item.id));
                void triggerHaptic('selection');
              }}
              scrollableRef={listScrollRef}
              width="fill"
            >
              {items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  settings={settings}
                  themeColors={themeColors}
                  width={cardWidth}
                  onPress={() => onOpenItem(item.id)}
                />
              ))}
            </Sortable.Flex>
          </Animated.ScrollView>
        </>
      )}
    </SettingsPageLayout>
  );
}
