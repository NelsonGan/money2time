import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DatePickerModal } from '~/components/datePicker';
import {
  CategoryEmoji,
  type CategoryPickerOption,
  CategoryPickerSheet,
  Input,
  Text,
  ThemeModal,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, CategoryType, TransactionType } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { formatDateInput } from '~/utils/formatters';

const SCROLL_CONTENT_STYLE = {
  padding: spacing.screenHorizontal,
  paddingBottom: spacing.listBottom + spacing.xs,
  gap: spacing.sm,
} as const;

export interface BulkTransactionChanges {
  date?: string;
  note?: string | null;
  /** Applied only to selected income transactions. */
  incomeCategoryId?: string;
  /** Applied only to selected expense transactions. */
  expenseCategoryId?: string;
}

interface CategoryPickerData {
  parents: CategoryPickerOption[];
  childByParent: Map<string, CategoryPickerOption[]>;
  previewById: Map<string, { icon: string; label: string }>;
}

function buildCategoryPickerData(categories: Category[], type: CategoryType): CategoryPickerData {
  const parents: CategoryPickerOption[] = [];
  const childByParent = new Map<string, CategoryPickerOption[]>();
  const previewById = new Map<string, { icon: string; label: string }>();
  const parentIconById = new Map<string, string | null>();

  categories.forEach((category) => {
    if (category.type !== type || category.parentId !== null) return;
    const icon = resolveCategoryIcon(category.icon);
    parents.push({ id: category.id, name: category.name, icon });
    parentIconById.set(category.id, category.icon);
    previewById.set(category.id, { icon, label: category.name });
  });

  categories.forEach((category) => {
    if (category.type !== type || category.parentId === null) return;
    const icon = resolveCategoryIcon(category.icon, parentIconById.get(category.parentId) ?? null);
    const child: CategoryPickerOption = { id: category.id, name: category.name, icon };
    const list = childByParent.get(category.parentId);
    if (list) {
      list.push(child);
    } else {
      childByParent.set(category.parentId, [child]);
    }
    const parentName = parents.find((parent) => parent.id === category.parentId)?.name ?? '';
    previewById.set(category.id, {
      icon,
      label: parentName ? `${parentName} / ${category.name}` : category.name,
    });
  });

  return { parents, childByParent, previewById };
}

/**
 * Translates the sheet's draft changes into per-transaction update inputs.
 * Each category is only applied to transactions whose type matches (income
 * category → income transactions, expense category → expense transactions).
 */
export function buildBulkUpdateInputs(
  selectedIds: string[],
  changes: BulkTransactionChanges,
  getTransactionType: (id: string) => TransactionType | undefined,
): { id: string; input: { date?: string; note?: string | null; categoryId?: string } }[] {
  const updates: {
    id: string;
    input: { date?: string; note?: string | null; categoryId?: string };
  }[] = [];
  selectedIds.forEach((id) => {
    const input: { date?: string; note?: string | null; categoryId?: string } = {};
    if (changes.date !== undefined) input.date = changes.date;
    if (changes.note !== undefined) input.note = changes.note;
    const type = getTransactionType(id);
    if (type === 'income' && changes.incomeCategoryId) {
      input.categoryId = changes.incomeCategoryId;
    } else if (type === 'expense' && changes.expenseCategoryId) {
      input.categoryId = changes.expenseCategoryId;
    }
    if (Object.keys(input).length > 0) updates.push({ id, input });
  });
  return updates;
}

interface BulkEditTransactionsSheetProps {
  visible: boolean;
  selectedCount: number;
  /**
   * Which category pickers to offer, derived from the types in the selection:
   * 'income' when any income transaction is selected, 'expense' when any expense
   * is selected. Empty (e.g. transfers only) hides the category section.
   */
  categoryTypes: CategoryType[];
  onClose: () => void;
  onApply: (changes: BulkTransactionChanges) => void;
}

/**
 * Shared date + note + category bulk-editing sheet. Owns its own draft state so
 * the host screen only supplies the selection count, the category types present
 * in the selection, and an apply callback.
 */
export function BulkEditTransactionsSheet({
  visible,
  selectedCount,
  categoryTypes,
  onClose,
  onApply,
}: BulkEditTransactionsSheetProps) {
  const { categories } = useApp();

  const [bulkDate, setBulkDate] = useState(() => formatDateInput(new Date()));
  const [bulkDateTouched, setBulkDateTouched] = useState(false);
  const [bulkDateModalVisible, setBulkDateModalVisible] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkNoteTouched, setBulkNoteTouched] = useState(false);
  const [incomeCategoryId, setIncomeCategoryId] = useState<string | null>(null);
  const [expenseCategoryId, setExpenseCategoryId] = useState<string | null>(null);
  const [activeCategoryPicker, setActiveCategoryPicker] = useState<CategoryType | null>(null);

  const categoryData = useMemo(
    () => ({
      income: buildCategoryPickerData(categories, 'income'),
      expense: buildCategoryPickerData(categories, 'expense'),
    }),
    [categories],
  );

  // Reset the draft each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setBulkDate(formatDateInput(new Date()));
    setBulkDateTouched(false);
    setBulkDateModalVisible(false);
    setBulkNote('');
    setBulkNoteTouched(false);
    setIncomeCategoryId(null);
    setExpenseCategoryId(null);
    setActiveCategoryPicker(null);
  }, [visible]);

  const hasBulkChanges =
    bulkDateTouched || bulkNoteTouched || incomeCategoryId !== null || expenseCategoryId !== null;

  const handleApply = () => {
    if (!hasBulkChanges) return;
    const changes: BulkTransactionChanges = {};
    if (bulkDateTouched) changes.date = bulkDate;
    if (bulkNoteTouched) {
      const normalizedNote = bulkNote.trim();
      changes.note = normalizedNote.length > 0 ? normalizedNote : null;
    }
    if (incomeCategoryId && categoryTypes.includes('income')) {
      changes.incomeCategoryId = incomeCategoryId;
    }
    if (expenseCategoryId && categoryTypes.includes('expense')) {
      changes.expenseCategoryId = expenseCategoryId;
    }
    if (Object.keys(changes).length === 0) return;
    onApply(changes);
  };

  const renderCategoryField = (type: CategoryType) => {
    const selectedId = type === 'income' ? incomeCategoryId : expenseCategoryId;
    const preview = selectedId ? categoryData[type].previewById.get(selectedId) : null;
    const label = I18n.t(
      type === 'income'
        ? 'transactions.filters.income_category'
        : 'transactions.filters.expense_category',
    );
    return (
      <View key={type} className="gap-2.5">
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            setActiveCategoryPicker(type);
          }}
          accessibilityRole="button"
          accessibilityLabel={label}
          className="rounded-2xl border border-border/30 bg-card px-3.5 py-3.5 flex-row items-center gap-2"
        >
          {preview ? (
            <>
              <CategoryEmoji icon={preview.icon} size={18} />
              <Text variant="caption" className="flex-1">
                {preview.label}
              </Text>
            </>
          ) : (
            <Text variant="caption" tone="muted">
              {I18n.t('transactions.editor.choose_category')}
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <ThemeModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-background" edges={['top']}>
        <View className="px-5 pt-8 pb-4 flex-row items-center justify-between">
          <View className="flex-1 pr-3">
            <Text variant="subheading">
              {I18n.t('transactions.selection.update_title', { count: selectedCount })}
            </Text>
            <Text variant="friendly" tone="muted">
              {I18n.t('transactions.selection.update_subtitle')}
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={onClose}
              className="px-3 py-2 rounded-full bg-secondary/70"
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.cancel')}
            >
              <Text variant="caption" tone="muted">
                {I18n.t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleApply}
              disabled={!hasBulkChanges}
              className={cn(
                'px-3 py-2 rounded-full',
                hasBulkChanges ? 'bg-primary' : 'bg-secondary/70',
              )}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.save')}
              accessibilityState={{ disabled: !hasBulkChanges }}
            >
              <Text
                variant="caption"
                className={cn(hasBulkChanges ? 'text-white' : 'text-muted-foreground')}
              >
                {I18n.t('common.save')}
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView className="flex-1" contentContainerStyle={SCROLL_CONTENT_STYLE}>
          <View className="gap-2.5">
            <Text variant="caption" tone="muted">
              {I18n.t('transactions.editor.date')}
            </Text>
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setBulkDateModalVisible(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('transactions.editor.date')}
              className="rounded-2xl border border-border/30 bg-card px-3.5 py-3.5"
            >
              <Text variant="caption">{bulkDate}</Text>
            </Pressable>
          </View>

          <View className="gap-2.5">
            <Input
              label={I18n.t('transaction_detail.note')}
              placeholder={I18n.t('transactions.editor.optional')}
              value={bulkNote}
              onChangeText={(value) => {
                setBulkNote(value);
                setBulkNoteTouched(true);
              }}
            />
          </View>

          {categoryTypes.includes('income') ? renderCategoryField('income') : null}
          {categoryTypes.includes('expense') ? renderCategoryField('expense') : null}
        </ScrollView>
        <DatePickerModal
          visible={bulkDateModalVisible}
          value={bulkDate}
          overlay
          onSelect={(value) => {
            setBulkDate(value);
            setBulkDateTouched(true);
            setBulkDateModalVisible(false);
          }}
          onClose={() => setBulkDateModalVisible(false)}
        />
        <CategoryPickerSheet
          overlay
          visible={activeCategoryPicker === 'income'}
          onClose={() => setActiveCategoryPicker(null)}
          parents={categoryData.income.parents}
          childByParent={categoryData.income.childByParent}
          allowParentSelection
          selectedCategoryId={incomeCategoryId}
          onSelect={(categoryId) => {
            setIncomeCategoryId(categoryId);
            setActiveCategoryPicker(null);
          }}
        />
        <CategoryPickerSheet
          overlay
          visible={activeCategoryPicker === 'expense'}
          onClose={() => setActiveCategoryPicker(null)}
          parents={categoryData.expense.parents}
          childByParent={categoryData.expense.childByParent}
          allowParentSelection
          selectedCategoryId={expenseCategoryId}
          onSelect={(categoryId) => {
            setExpenseCategoryId(categoryId);
            setActiveCategoryPicker(null);
          }}
        />
      </SafeAreaView>
    </ThemeModal>
  );
}
