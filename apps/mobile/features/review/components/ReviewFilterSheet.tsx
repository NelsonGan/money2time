import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  AccountPickerSheet,
  CategoryPickerSheet,
  SegmentedToggle,
  SelectionFilterField,
  Text,
  ThemeModal,
} from '~/components/ui';
import { LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { buildInsightsCategoryPickerData } from '~/features/insights/categoryPickerData';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { EMPTY_REVIEW_FILTERS, type ReviewFilters } from '../lib/reviewFilters';
import { REVIEW_ZOOMS, type ReviewZoom } from '../lib/reviewPeriods';

type PickerKind = 'accounts' | 'expenseCategories' | 'incomeCategories';
type IdListKey = 'excludedAccountIds' | 'excludedExpenseCategoryIds' | 'excludedIncomeCategoryIds';

/**
 * Everything that shapes the review report, behind the header's filter button:
 * how long a stretch it covers, and what to leave out of it (or keep only).
 *
 * The zoom lives here rather than in its own header dropdown because it reads
 * as a filter rather than content. *Which* period is showing deliberately does
 * not: that is the rail of pills pinned above the cards, which names every
 * period the ledger reaches back to and moves between them without opening
 * anything, so all this has to answer is how long a period is.
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
    (key: IdListKey, id: string) => {
      const current = filters[key];
      onFiltersChange({
        ...filters,
        [key]: current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
      });
    },
    [filters, onFiltersChange],
  );

  const clearIds = useCallback(
    (key: IdListKey) => onFiltersChange({ ...filters, [key]: [] }),
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

          <SelectionFilterField
            label={I18n.t('insights.filters.accounts')}
            mode={filters.accountMode}
            count={filters.excludedAccountIds.length}
            emptyLabel={I18n.t('insights.filters.none')}
            onModeChange={(accountMode) => onFiltersChange({ ...filters, accountMode })}
            onPress={() => setActivePicker('accounts')}
          />
          <SelectionFilterField
            label={I18n.t('insights.filters.expense_categories')}
            mode={filters.expenseCategoryMode}
            count={filters.excludedExpenseCategoryIds.length}
            emptyLabel={I18n.t('insights.filters.none')}
            onModeChange={(expenseCategoryMode) =>
              onFiltersChange({ ...filters, expenseCategoryMode })
            }
            onPress={() => setActivePicker('expenseCategories')}
          />
          <SelectionFilterField
            label={I18n.t('insights.filters.income_categories')}
            mode={filters.incomeCategoryMode}
            count={filters.excludedIncomeCategoryIds.length}
            emptyLabel={I18n.t('insights.filters.none')}
            onModeChange={(incomeCategoryMode) =>
              onFiltersChange({ ...filters, incomeCategoryMode })
            }
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
