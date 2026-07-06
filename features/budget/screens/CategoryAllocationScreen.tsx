import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CategoryEmoji, Input, SettingsHeader, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  AllocationFooter,
  parseAllocationAmount,
} from '~/features/budget/components/AllocationEditor';
import { computeChildAllocationGap } from '~/features/budget/lib/budgetMath';
import { money } from '~/features/budget/lib/format';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { currencySymbolForCode } from '~/utils/currency';
import { normalizeMoneyAmount } from '~/utils/formatters';

interface CategoryAllocationScreenProps {
  categoryId: string;
  /** Draft amounts for this category and its children, keyed by category id. */
  initialAmounts: Record<string, string>;
  /** Unallocated remainder across root categories, excluding this category. */
  remainingExcludingThis: number;
  /** Commits the edited draft slice back into the hosting editor. */
  onDone: (amounts: Record<string, string>) => void;
  onClose: () => void;
}

const SCROLL_CONTENT = { paddingBottom: 40 } as const;

/**
 * Full-page allocation editor for one root category: the amount plus every
 * subcategory. The children-vs-parent tally uses the same status bar as the
 * hosting editor, pinned above Save. Edits stay local until Save commits them
 * back into the hosting template/month editor.
 */
export function CategoryAllocationScreen({
  categoryId,
  initialAmounts,
  remainingExcludingThis,
  onDone,
  onClose,
}: CategoryAllocationScreenProps) {
  const { settings, categories } = useApp();
  const themeColors = useThemeColors();

  const category = categories.find((candidate) => candidate.id === categoryId) ?? null;
  const childCategories = categories.filter((candidate) => candidate.parentId === categoryId);

  const [amounts, setAmounts] = useState<Record<string, string>>(initialAmounts);

  const currencySymbol = currencySymbolForCode(settings.currencyCode);
  const parentAmount = parseAllocationAmount(amounts[categoryId] ?? '');
  const childAllocations = childCategories.map((child) => ({
    amount: parseAllocationAmount(amounts[child.id] ?? ''),
  }));
  const childAllocated = childAllocations.reduce((sum, entry) => sum + entry.amount, 0);
  const childGap = computeChildAllocationGap(parentAmount, childAllocations);
  const remainingLeft = normalizeMoneyAmount(remainingExcludingThis - parentAmount);

  const handleChange = useCallback((id: string, next: string) => {
    setAmounts((previous) => ({ ...previous, [id]: next }));
  }, []);

  const handleSave = useCallback(() => {
    if (childGap !== 0) return;
    void triggerHaptic('success');
    onDone(amounts);
    onClose();
  }, [amounts, childGap, onClose, onDone]);

  if (!category) return null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onClose}
          title={category.name}
          rightAccessory={<CategoryEmoji icon={category.icon} size={22} />}
        />
      </View>

      <ScrollView
        contentContainerStyle={SCROLL_CONTENT}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-4 px-5 pt-1">
          <View className="flex-row items-end gap-3">
            <View className="flex-1">
              <Input
                label={I18n.t('transactions.editor.amount')}
                variant="currency"
                currencySymbol={currencySymbol}
                value={amounts[categoryId] ?? ''}
                onChangeText={(next) => handleChange(categoryId, next)}
                placeholder="0"
                autoFocus
              />
            </View>
            {remainingLeft > 0 ? (
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  handleChange(categoryId, String(normalizeMoneyAmount(remainingExcludingThis)));
                }}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('budget.fill_remainder')}
                className="h-[54px] items-center justify-center rounded-[22px] border border-primary/30 bg-primary/10 px-4 active:opacity-80"
              >
                <Text variant="caption" className="text-primary">
                  + {money(remainingLeft, settings)}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {childCategories.length > 0 ? (
            <View className="pt-2">
              <Text variant="label" tone="muted" className="mb-1 uppercase">
                {I18n.t('budget.subcategories')}
              </Text>
              <Text variant="caption" tone="muted">
                {I18n.t('budget.children_hint')}
              </Text>

              <View className="mt-3 gap-2">
                {childCategories.map((child) => (
                  <View key={child.id} className="flex-row items-center gap-2.5">
                    <CategoryEmoji icon={child.icon} parentIcon={category.icon} size={16} />
                    {/* Label truncates; the input keeps a fixed width so rows
                        never shift or squeeze as names vary. */}
                    <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
                      {child.name}
                    </Text>
                    <View className="w-[148px] shrink-0">
                      <Input
                        variant="currency"
                        currencySymbol={currencySymbol}
                        value={amounts[child.id] ?? ''}
                        onChangeText={(next) => handleChange(child.id, next)}
                        placeholder="0"
                        accessibilityLabel={child.name}
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Same tally bar as the hosting editor, pinned above Save (and riding
          the keyboard): how much of the parent amount the subcategory
          breakdown has claimed. */}
      <AllocationFooter
        showBar={childCategories.length > 0 && parentAmount > 0}
        total={parentAmount}
        remaining={normalizeMoneyAmount(parentAmount - childAllocated)}
        settings={settings}
        themeColors={themeColors}
        onCancel={onClose}
        onSave={handleSave}
        saveDisabled={childGap !== 0}
      />
    </SafeAreaView>
  );
}
