import { ChevronRight } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AccountPickerSheet,
  CategoryPickerSheet,
  SegmentedToggle,
  Text,
  ThemeModal,
} from '~/components/ui';
import { LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { buildInsightsCategoryPickerData } from '~/features/insights/categoryPickerData';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { EMPTY_REVIEW_FILTERS, type ReviewFilters } from '../lib/reviewFilters';
import { REVIEW_ZOOMS, type ReviewZoom } from '../lib/reviewPeriods';

type PickerKind = 'accounts' | 'expenseCategories' | 'incomeCategories';

/**
 * Everything that shapes the review report, behind the header's filter button:
 * how long a stretch it covers, and what to leave out of it.
 *
 * The period used to be a rail of pills pinned above the cards, with a separate
 * zoom dropdown in the header. Both read as filters rather than content, so
 * they belong here. Which period is showing is deliberately *not* repeated in
 * this sheet: the header capsule already names it and steps between periods
 * without opening anything, so all this has to answer is how long a period is.
 */
export function ReviewFilterSheet({
  visible,
  onClose,
  zoom,
  onZoomChange,
  filters,
  onFiltersChange,
}: {
  visible: boolean;
  onClose: () => void;
  zoom: ReviewZoom;
  onZoomChange: (zoom: ReviewZoom) => void;
  filters: ReviewFilters;
  onFiltersChange: (filters: ReviewFilters) => void;
}) {
  const { accounts, accountGroups, categories } = useApp();
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

  const zoomOptions = useMemo(
    () => REVIEW_ZOOMS.map((value) => ({ value, label: I18n.t(`review.zoom.${value}`) })),
    [],
  );

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
          <View className="gap-2">
            <Text variant="caption" tone="muted">
              {I18n.t('insights.filters.period')}
            </Text>
            {/* The app's own three-way control rather than a bespoke row of
                pills, so this reads like every other segmented choice in it. */}
            <SegmentedToggle
              value={zoom}
              variant="home"
              options={zoomOptions}
              onChange={onZoomChange}
            />
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
});
