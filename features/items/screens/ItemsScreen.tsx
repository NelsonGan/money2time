import { CalendarClock, Package, Plus, Wallet } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
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
import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { ItemWithStats, UserSettings } from '~/types';
import { cn } from '~/utils';
import { convert } from '~/utils/currency';
import { formatAmount, formatHours } from '~/utils/formatters';

interface ItemsScreenProps {
  /** When provided, renders a standalone header with this back action (settings push). */
  onBack?: () => void;
  /** Opens the add/edit editor. In embedded mode the host gates + provides the add button. */
  onOpenItem: (itemId?: string) => void;
  /** Embedded inside the assets tab host (no own header / add button). */
  embedded?: boolean;
  safeAreaEdges?: Edge[];
}

/** Money in the item's own currency, ignoring the time display mode. */
function formatMoney(value: number, currency: string, settings: UserSettings): string {
  return formatAmount(value, { ...settings, displayMode: 'money' }, { currencyCode: currency });
}

/**
 * The daily-cost value as it should read under the active display mode: hours of
 * work when the global toggle is on Time (and a wage is set), money otherwise.
 */
function DailyValue({
  item,
  settings,
  variant = 'heading',
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

function ItemCard({
  item,
  settings,
  onPress,
}: {
  item: ItemWithStats;
  settings: UserSettings;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      className={cn(
        'flex-row items-center gap-3 rounded-2xl border border-border/45 bg-card px-3.5 py-3',
        !item.isActive && 'opacity-60',
      )}
    >
      <ItemIcon iconId={item.iconId} size={40} />
      <View className="flex-1">
        <Text variant="bodyStrong" numberOfLines={1}>
          {item.name}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
          {item.isActive
            ? I18n.t('items.owned_for', { count: item.daysOwned })
            : `${I18n.t('items.status_inactive')} · ${I18n.t('items.owned_for', { count: item.daysOwned })}`}
        </Text>
      </View>
      <View className="items-end">
        <DailyValue item={item} settings={settings} />
        <Text variant="caption" tone="muted">
          {I18n.t('items.per_day')}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Overview card matching the accounts summary: a hero figure (total cost per day)
 * over a two-stat footer (total spent + item count). The hero respects the
 * global money/time toggle.
 */
function ItemsSummaryBlock({
  totalDailyCostNode,
  totalSpent,
  activeCount,
  inactiveCount,
  themeColors,
}: {
  totalDailyCostNode: React.ReactNode;
  totalSpent: string;
  activeCount: number;
  inactiveCount: number;
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
          <CalendarClock size={12} color={themeColors.primary} strokeWidth={2.4} />
          <Text variant="label" className="text-[10px] text-primary">
            {I18n.t('items.summary_daily_cost')}
          </Text>
        </View>
        <View className="mt-1.5">{totalDailyCostNode}</View>
      </View>

      <View className="h-px bg-border/40" />

      <View className="flex-row">
        <View className="flex-1 px-4 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <Wallet size={12} color={themeColors.textMuted} strokeWidth={2.4} />
            <Text variant="label" className="text-[10px]" tone="muted">
              {I18n.t('items.summary_total_spent')}
            </Text>
          </View>
          <Text variant="mono" className="mt-1">
            {totalSpent}
          </Text>
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
            {I18n.t('items.counts_value', { active: activeCount, inactive: inactiveCount })}
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
    const totalSpent = items.reduce((sum, i) => sum + toReporting(i.netCost, i.currency), 0);
    const dailyCost = active.reduce((sum, i) => sum + toReporting(i.dailyCost, i.currency), 0);
    const dailyWork = active.reduce((sum, i) => sum + (i.dailyWorkHours ?? 0), 0);
    const hasWage = active.some((i) => i.dailyWorkHours != null);
    return {
      totalSpent,
      dailyCost,
      dailyWork,
      hasWage,
      activeCount: active.length,
      inactiveCount: items.length - active.length,
    };
  }, [items, rateTable, settings.currencyCode]);

  const showTime = settings.displayMode === 'time' && summary.hasWage;
  const totalDailyCostNode = showTime ? (
    <TimeValueInline
      value={formatHours(summary.dailyWork)}
      variant="monoLg"
      iconColor={themeColors.primary}
    />
  ) : (
    <Text variant="monoLg">{formatMoney(summary.dailyCost, settings.currencyCode, settings)}</Text>
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
        <ScrollView
          className="flex-1"
          contentContainerStyle={[{ paddingHorizontal: 20, paddingTop: 12 }, listNavInset]}
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-3">
            <ItemsSummaryBlock
              totalDailyCostNode={totalDailyCostNode}
              totalSpent={formatMoney(summary.totalSpent, settings.currencyCode, settings)}
              activeCount={summary.activeCount}
              inactiveCount={summary.inactiveCount}
              themeColors={themeColors}
            />
          </View>

          <View className="gap-2">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                settings={settings}
                onPress={() => onOpenItem(item.id)}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </SettingsPageLayout>
  );
}
