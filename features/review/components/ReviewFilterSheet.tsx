import { ChevronRight } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AccountPickerSheet, CategoryPickerSheet, Text, ThemeModal } from '~/components/ui';
import { LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { buildInsightsCategoryPickerData } from '~/features/insights/categoryPickerData';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

import { periodPillLabel } from '../lib/reviewFormat';
import { EMPTY_REVIEW_FILTERS, type ReviewFilters } from '../lib/reviewFilters';
import { REVIEW_ZOOMS, type ReviewPeriod, type ReviewZoom } from '../lib/reviewPeriods';

type PickerKind = 'accounts' | 'expenseCategories' | 'incomeCategories';

/**
 * Everything that shapes the review report, behind the header's filter button:
 * which stretch of time it covers, and what to leave out of it.
 *
 * The period used to be a rail of pills pinned above the cards. It reads as a
 * filter rather than content — the cards below are the page — and the rail cost
 * a permanent strip of vertical space plus its own scroll-centring machinery to
 * show one selected value. Here the same pills sit next to the exclusions they
 * belong with, and the header capsule steps between periods without opening
 * anything.
 */
export function ReviewFilterSheet({
  visible,
  onClose,
  zoom,
  onZoomChange,
  periods,
  selectedPeriodKey,
  onSelectPeriod,
  filters,
  onFiltersChange,
}: {
  visible: boolean;
  onClose: () => void;
  zoom: ReviewZoom;
  onZoomChange: (zoom: ReviewZoom) => void;
  periods: ReviewPeriod[];
  selectedPeriodKey: string | null;
  onSelectPeriod: (period: ReviewPeriod) => void;
  filters: ReviewFilters;
  onFiltersChange: (filters: ReviewFilters) => void;
}) {
  const { settings, accounts, accountGroups, categories } = useApp();
  const themeColors = useThemeColors();
  const [activePicker, setActivePicker] = useState<PickerKind | null>(null);
  const closePicker = useCallback(() => setActivePicker(null), []);

  const expenseCategoryPicker = useMemo(
    () => buildInsightsCategoryPickerData(categories, 'expense'),
    [categories],
  );
  const incomeCategoryPicker = useMemo(
    () => buildInsightsCategoryPickerData(categories, 'income'),
    [categories],
  );

  // Newest first: the review always opens on the most recent completed period,
  // so the selected pill is the one already in view without any scrolling.
  const orderedPeriods = useMemo(() => [...periods].reverse(), [periods]);

  const toggleId = useCallback(
    (key: keyof ReviewFilters, id: string) => {
      const current = filters[key];
      onFiltersChange({
        ...filters,
        [key]: current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
      });
    },
    [filters, onFiltersChange],
  );

  const clearIds = useCallback(
    (key: keyof ReviewFilters) => onFiltersChange({ ...filters, [key]: [] }),
    [filters, onFiltersChange],
  );

  return (
    <ThemeModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => {
        if (activePicker) {
          closePicker();
          return;
        }
        onClose();
      }}
    >
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View style={styles.header}>
          <Text variant="subheading">{I18n.t('insights.filters.title')}</Text>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onFiltersChange(EMPTY_REVIEW_FILTERS);
              }}
              className="bg-secondary/70"
              style={styles.headerAction}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.reset')}
            >
              <Text variant="caption" tone="muted">
                {I18n.t('common.reset')}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onClose();
              }}
              className="bg-secondary"
              style={styles.headerAction}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.done')}
            >
              <Text variant="caption" tone="muted">
                {I18n.t('common.done')}
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={styles.content}>
          <View className="gap-2.5">
            <Text variant="caption" tone="muted">
              {I18n.t('insights.filters.period')}
            </Text>
            {/* Zoom and period are one control, not two sections: the zoom picks
                the unit and the row below picks which one of them. */}
            <View className="flex-row gap-2">
              {REVIEW_ZOOMS.map((value) => (
                <ReviewFilterPill
                  key={value}
                  label={I18n.t(`review.zoom.${value}`)}
                  active={value === zoom}
                  grow
                  onPress={() => {
                    if (value !== zoom) onZoomChange(value);
                  }}
                />
              ))}
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              // A horizontal ScrollView inside a vertical one stretches to the
              // parent's full content height unless it is pinned, which leaves
              // the pills at the top with the rest of the sheet drawn over them.
              style={styles.pillRow}
              contentContainerStyle={styles.pills}
            >
              {orderedPeriods.map((period) => (
                <ReviewFilterPill
                  key={period.key}
                  label={periodPillLabel(period, settings.locale)}
                  active={period.key === selectedPeriodKey}
                  onPress={() => onSelectPeriod(period)}
                />
              ))}
            </ScrollView>
          </View>

          <ExclusionRow
            label={I18n.t('insights.filters.exclude_accounts')}
            count={filters.excludedAccountIds.length}
            tint={themeColors.textMuted}
            onPress={() => setActivePicker('accounts')}
          />
          <ExclusionRow
            label={I18n.t('insights.filters.exclude_expense_categories')}
            count={filters.excludedExpenseCategoryIds.length}
            tint={themeColors.textMuted}
            onPress={() => setActivePicker('expenseCategories')}
          />
          <ExclusionRow
            label={I18n.t('insights.filters.exclude_income_categories')}
            count={filters.excludedIncomeCategoryIds.length}
            tint={themeColors.textMuted}
            onPress={() => setActivePicker('incomeCategories')}
          />
        </ScrollView>

        {/* Rendered as overlays rather than nested modals: a second native modal
            on top of this page sheet does not present on iOS. */}
        <AccountPickerSheet
          overlay
          visible={activePicker === 'accounts'}
          onClose={closePicker}
          accounts={accounts}
          accountGroups={accountGroups}
          selectedIds={filters.excludedAccountIds}
          onToggleSelect={(accountId) => toggleId('excludedAccountIds', accountId)}
          onClear={() => clearIds('excludedAccountIds')}
        />
        <CategoryPickerSheet
          overlay
          allowParentSelection
          visible={activePicker === 'expenseCategories'}
          onClose={closePicker}
          parents={expenseCategoryPicker.parents}
          childByParent={expenseCategoryPicker.childByParent}
          selectedCategoryIds={filters.excludedExpenseCategoryIds}
          onToggleSelect={(categoryId) => toggleId('excludedExpenseCategoryIds', categoryId)}
          onClear={() => clearIds('excludedExpenseCategoryIds')}
        />
        <CategoryPickerSheet
          overlay
          allowParentSelection
          visible={activePicker === 'incomeCategories'}
          onClose={closePicker}
          parents={incomeCategoryPicker.parents}
          childByParent={incomeCategoryPicker.childByParent}
          selectedCategoryIds={filters.excludedIncomeCategoryIds}
          onToggleSelect={(categoryId) => toggleId('excludedIncomeCategoryIds', categoryId)}
          onClear={() => clearIds('excludedIncomeCategoryIds')}
        />
      </SafeAreaView>
    </ThemeModal>
  );
}

function ReviewFilterPill({
  label,
  active,
  grow,
  onPress,
}: {
  label: string;
  active: boolean;
  grow?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      className={cn(
        'items-center rounded-full border px-3.5 py-2 active:opacity-85',
        grow ? 'flex-1' : undefined,
        active ? 'border-primary/50 bg-primary/15' : 'border-border/40 bg-card',
      )}
    >
      <Text variant="label" className={cn(active ? 'text-primary' : 'text-muted-foreground')}>
        {label}
      </Text>
    </Pressable>
  );
}

function ExclusionRow({
  label,
  count,
  tint,
  onPress,
}: {
  label: string;
  count: number;
  tint: string;
  onPress: () => void;
}) {
  return (
    <View className="gap-2">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="flex-row items-center justify-between rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3"
      >
        <Text variant="body" tone={count > 0 ? undefined : 'muted'}>
          {count > 0
            ? `${count} ${I18n.t('insights.filters.excluded')}`
            : I18n.t('insights.filters.none')}
        </Text>
        <ChevronRight size={16} color={tint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.screenHorizontal,
    paddingTop: spacing.xl + spacing.xs,
    paddingBottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerAction: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
  },
  content: {
    padding: spacing.screenHorizontal,
    paddingBottom: LIST_BOTTOM_PADDING + spacing.xs,
    gap: spacing.md,
  },
  pillRow: {
    flexGrow: 0,
    flexShrink: 0,
  },
  pills: {
    gap: spacing.xs,
  },
});
