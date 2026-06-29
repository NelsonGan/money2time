import { Plus } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef } from 'react';
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
import { formatAmount, formatHours, formatRelativeDate } from '~/utils/formatters';

interface ItemsScreenProps {
  /** When provided, renders a standalone header with this back action (settings push). */
  onBack?: () => void;
  /** Opens the add/edit editor. In embedded mode the host gates + provides the add button. */
  onOpenItem: (itemId?: string) => void;
  /** Embedded inside the assets tab host (no own header / add button). */
  embedded?: boolean;
  safeAreaEdges?: Edge[];
}

/** Always render money (ignoring time display mode) in the item's own currency. */
function formatMoney(value: number, currency: string, settings: UserSettings): string {
  return formatAmount(value, { ...settings, displayMode: 'money' }, { currencyCode: currency });
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
  const themeColors = useThemeColors();
  const dailyMoney = formatMoney(item.dailyCost, item.currency, settings);
  const purchaseLabel = formatRelativeDate(item.purchaseDate, settings.locale);

  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      className="rounded-[20px] border border-border/30 bg-card px-3.5 py-3.5 shadow-soft active:opacity-90"
    >
      <View className="flex-row items-center gap-3">
        <ItemIcon iconId={item.iconId} size={48} />
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text variant="bodyStrong" numberOfLines={1} className="flex-1">
              {item.name}
            </Text>
            <View
              className="rounded-full px-2 py-[3px]"
              style={{
                backgroundColor: item.isActive
                  ? `${themeColors.success}1A`
                  : `${themeColors.mutedForeground}1A`,
              }}
            >
              <Text
                variant="label"
                className="text-[10px]"
                style={{ color: item.isActive ? themeColors.success : themeColors.mutedForeground }}
              >
                {item.isActive ? I18n.t('items.status_active') : I18n.t('items.status_inactive')}
              </Text>
            </View>
          </View>
          <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
            {I18n.t('items.owned_for', { count: item.daysOwned })} · {purchaseLabel}
          </Text>
        </View>
      </View>

      <View className="mt-3 flex-row items-end justify-between">
        <View>
          <Text variant="caption" tone="muted">
            {item.isActive ? I18n.t('items.daily_cost') : I18n.t('items.final_daily_cost')}
          </Text>
          <View className="flex-row items-baseline gap-1">
            <Text variant="heading" className="text-primary">
              {dailyMoney}
            </Text>
            <Text variant="caption" tone="muted">
              {I18n.t('items.per_day')}
            </Text>
          </View>
        </View>
        <View className="items-end gap-1">
          {item.dailyWorkHours != null ? (
            <TimeValueInline
              value={I18n.t('items.work_per_day', { time: formatHours(item.dailyWorkHours) })}
              variant="caption"
              tone="muted"
            />
          ) : null}
          <Text variant="caption" tone="muted">
            {I18n.t('items.paid_label', {
              amount: formatMoney(item.purchasePrice, item.currency, settings),
            })}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 rounded-[18px] border border-border/25 bg-card px-3 py-2.5">
      <Text variant="label" className="text-[10px]" tone="muted">
        {label}
      </Text>
      <Text variant="bodyStrong" numberOfLines={1} className="mt-1">
        {value}
      </Text>
    </View>
  );
}

export function ItemsScreen({
  onBack,
  onOpenItem,
  embedded = false,
  safeAreaEdges = ['top'],
}: ItemsScreenProps) {
  const { items, settings } = useApp();
  const { checkLimit } = useProGate();
  const listNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
  const scrollRef = useRef<ScrollView | null>(null);

  const handleAdd = useCallback(() => {
    if (!checkLimit('items', items.length)) return;
    onOpenItem();
  }, [checkLimit, items.length, onOpenItem]);

  // Totals reflect what currently-owned items cost; sums assume the reporting
  // currency for a quick at-a-glance figure (per-item cards keep native currency).
  const summary = useMemo(() => {
    const active = items.filter((i) => i.isActive);
    const totalSpent = items.reduce((sum, i) => sum + i.netCost, 0);
    const dailyCost = active.reduce((sum, i) => sum + i.dailyCost, 0);
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
  }, [items]);

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
          action={{ label: I18n.t('items.add_first'), onPress: handleAdd }}
        />
      ) : (
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={[{ paddingHorizontal: 20, paddingTop: 12 }, listNavInset]}
          showsVerticalScrollIndicator={false}
        >
          <View className="mb-3 gap-2">
            <View className="flex-row gap-2">
              <SummaryTile
                label={I18n.t('items.summary_total_spent')}
                value={formatMoney(summary.totalSpent, settings.currencyCode, settings)}
              />
              <SummaryTile
                label={I18n.t('items.summary_daily_cost')}
                value={formatMoney(summary.dailyCost, settings.currencyCode, settings)}
              />
            </View>
            <View className="flex-row gap-2">
              <SummaryTile
                label={I18n.t('items.summary_work_per_day')}
                value={summary.hasWage ? formatHours(summary.dailyWork) : '—'}
              />
              <SummaryTile
                label={I18n.t('items.summary_counts')}
                value={I18n.t('items.counts_value', {
                  active: summary.activeCount,
                  inactive: summary.inactiveCount,
                })}
              />
            </View>
          </View>

          <View className="gap-2.5">
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
