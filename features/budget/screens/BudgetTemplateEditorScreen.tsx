import { SmilePlus } from 'lucide-react-native';
import React, { type ElementRef, useCallback, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryEmoji, Input, SettingsHeader } from '~/components/ui';
import { useApp, useTransactions } from '~/context/AppContext';
import {
  AllocationCategoryList,
  AllocationFooter,
  AllocationOptionRow,
} from '~/features/budget/components/AllocationEditor';
import { EmojiPickerSheet } from '~/features/budget/components/EmojiPickerSheet';
import {
  type OpenCategoryAllocationParams,
  useAllocationDraft,
} from '~/features/budget/hooks/useAllocationDraft';
import { computeBackPopulateRange } from '~/features/budget/lib/budgetMath';
import { monthKeyLabel } from '~/features/budget/lib/format';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';

interface BudgetTemplateEditorScreenProps {
  templateId?: string;
  duplicateFromId?: string;
  /** Pushes the full-page per-category allocation editor. */
  onOpenCategoryAllocation: (params: OpenCategoryAllocationParams) => void;
  onClose: () => void;
}

const SCROLL_CONTENT = { paddingBottom: 40 } as const;

export function BudgetTemplateEditorScreen({
  templateId,
  duplicateFromId,
  onOpenCategoryAllocation,
  onClose,
}: BudgetTemplateEditorScreenProps) {
  const {
    settings,
    categories,
    budgetTemplates,
    getBudgetMonthsEverExisted,
    createBudgetTemplate,
    updateBudgetTemplate,
  } = useApp();
  const { transactions } = useTransactions();
  const themeColors = useThemeColors();
  const scrollRef = useAnimatedRef<ElementRef<typeof Animated.ScrollView>>();

  const existing = useMemo(
    () => budgetTemplates.find((template) => template.id === templateId) ?? null,
    [budgetTemplates, templateId],
  );
  const duplicateSource = useMemo(
    () => budgetTemplates.find((template) => template.id === duplicateFromId) ?? null,
    [budgetTemplates, duplicateFromId],
  );
  const isEditing = existing != null;
  const seed = existing ?? duplicateSource;

  const [name, setName] = useState(
    existing?.name ??
      (duplicateSource ? `${duplicateSource.name} ${I18n.t('budget.duplicate_suffix')}` : ''),
  );
  const [emoji, setEmoji] = useState<string | null>(seed?.emoji ?? null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [countUnbudgeted, setCountUnbudgeted] = useState(seed?.countUnbudgeted ?? true);
  const [backPopulate, setBackPopulate] = useState(false);

  const draft = useAllocationDraft({
    categories,
    initialTotal: seed ? String(seed.totalAmount) : '',
    initialAmounts: () => {
      const initial: Record<string, string> = {};
      for (const allocation of seed?.allocations ?? []) {
        if (allocation.amount > 0) initial[allocation.categoryId] = String(allocation.amount);
      }
      return initial;
    },
    initialOrder: () => {
      // The seed's allocations arrive in saved sortOrder; keep the root order so
      // an edited/duplicated template opens in the arrangement it was saved in.
      const parentById = new Map(categories.map((category) => [category.id, category.parentId]));
      return (seed?.allocations ?? [])
        .filter((allocation) => !parentById.get(allocation.categoryId))
        .map((allocation) => allocation.categoryId);
    },
    onOpenCategoryAllocation,
  });

  const currencySymbol = currencySymbolForCode(settings.currencyCode);
  const canSave = name.trim().length > 0 && draft.allocationsValid;

  // Back-populate is only offered on create, and only when there are missing
  // past months to fill (range copy names the exact span). Tombstoned months
  // count as existing so the preview matches what the fill will actually skip.
  const backPopulateRange = useMemo(() => {
    if (isEditing) return null;
    return computeBackPopulateRange({
      transactions,
      existingMonths: getBudgetMonthsEverExisted(),
    });
  }, [getBudgetMonthsEverExisted, isEditing, transactions]);

  const handleSave = useCallback(() => {
    if (!canSave) return;
    void triggerHaptic('success');
    const input = {
      name: name.trim(),
      emoji,
      totalAmount: draft.parsedTotal,
      countUnbudgeted,
      allocations: draft.buildAllocations(),
    };
    if (isEditing && existing) {
      updateBudgetTemplate(existing.id, input);
    } else {
      createBudgetTemplate({ ...input, backPopulate: backPopulate && backPopulateRange != null });
    }
    onClose();
  }, [
    backPopulate,
    backPopulateRange,
    canSave,
    countUnbudgeted,
    createBudgetTemplate,
    draft,
    emoji,
    existing,
    isEditing,
    name,
    onClose,
    updateBudgetTemplate,
  ]);

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onClose}
          title={isEditing ? I18n.t('budget.edit_title') : I18n.t('budget.add_title')}
        />
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        contentContainerStyle={SCROLL_CONTENT}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-4 px-5 pt-1">
          <View className="flex-row items-end gap-3">
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setShowEmojiPicker(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('budget.choose_emoji')}
              className="h-[54px] w-[54px] items-center justify-center rounded-[18px] border border-border/40 bg-secondary/30"
            >
              {emoji ? (
                <CategoryEmoji icon={emoji} size={26} />
              ) : (
                <SmilePlus size={22} color={themeColors.textMuted} />
              )}
            </Pressable>
            <View className="flex-1">
              <Input
                label={I18n.t('budget.name_label')}
                value={name}
                onChangeText={setName}
                placeholder={I18n.t('budget.name_placeholder')}
              />
            </View>
          </View>

          <Input
            label={I18n.t('budget.total_label')}
            variant="currency"
            currencySymbol={currencySymbol}
            value={draft.total}
            onChangeText={draft.setTotal}
            placeholder="0.00"
          />

          <AllocationCategoryList
            rootCategories={draft.rootExpenseCategories}
            amounts={draft.amounts}
            childGaps={draft.childGaps}
            onPressCategory={draft.openCategoryAllocation}
            onReorder={draft.reorderRootCategories}
            scrollableRef={scrollRef}
            settings={settings}
            themeColors={themeColors}
          />

          <AllocationOptionRow
            title={I18n.t('budget.count_unbudgeted_title')}
            caption={I18n.t('budget.count_unbudgeted_caption')}
            value={countUnbudgeted}
            onChange={setCountUnbudgeted}
            themeColors={themeColors}
          />

          {backPopulateRange ? (
            <AllocationOptionRow
              title={I18n.t('budget.back_populate_title')}
              caption={I18n.t('budget.back_populate_caption', {
                first: monthKeyLabel(backPopulateRange.firstMonthKey, settings.locale),
                last: monthKeyLabel(backPopulateRange.lastMonthKey, settings.locale),
                count: backPopulateRange.months.length,
              })}
              value={backPopulate}
              onChange={setBackPopulate}
              themeColors={themeColors}
            />
          ) : null}
        </View>
      </Animated.ScrollView>

      {/* The remaining-to-allocate bar sits right above Cancel/Save (and rides
          the keyboard) so the running tally is visible while amounts are
          entered. */}
      <AllocationFooter
        showBar={draft.parsedTotal > 0}
        total={draft.parsedTotal}
        remaining={draft.remaining}
        settings={settings}
        themeColors={themeColors}
        onCancel={onClose}
        onSave={handleSave}
        saveDisabled={!canSave}
      />

      <EmojiPickerSheet
        visible={showEmojiPicker}
        onClose={() => setShowEmojiPicker(false)}
        selected={emoji}
        onSelect={setEmoji}
      />
    </SafeAreaView>
  );
}
