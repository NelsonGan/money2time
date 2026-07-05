import { X } from 'lucide-react-native';
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, CategoryEmoji, Input, Text, ThemeModal } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { Category, UserSettings } from '~/types';
import { withColorAlpha } from '~/utils/color';
import { formatAmount, normalizeMoneyAmount } from '~/utils/formatters';

import { computeChildAllocationGap } from '../lib/budgetMath';

interface CategoryAllocationSheetProps {
  visible: boolean;
  onClose: () => void;
  category: Category | null;
  childCategories: Category[];
  /** Shared draft amounts keyed by category id (parent and children). */
  amounts: Record<string, string>;
  onChangeAmount: (categoryId: string, next: string) => void;
  /** Unallocated remainder across root categories (excluding nothing). */
  rootRemaining: number;
  currencySymbol: string;
  settings: UserSettings;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
});

function money(value: number, settings: UserSettings): string {
  return formatAmount(value, { ...settings, displayMode: 'money' });
}

function parseAmount(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Per-category allocation editor: the parent amount plus every subcategory,
 * visible immediately, with a live children-vs-parent bar. All edits write
 * straight into the shared draft, so the list behind updates live.
 */
export function CategoryAllocationSheet({
  visible,
  onClose,
  category,
  childCategories,
  amounts,
  onChangeAmount,
  rootRemaining,
  currencySymbol,
  settings,
}: CategoryAllocationSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  if (!category) return null;

  const parentAmount = parseAmount(amounts[category.id] ?? '');
  const childAllocations = childCategories.map((child) => ({
    amount: parseAmount(amounts[child.id] ?? ''),
  }));
  const childAllocated = childAllocations.reduce((sum, entry) => sum + entry.amount, 0);
  const childGap = computeChildAllocationGap(parentAmount, childAllocations);
  const anyChildAllocated = childAllocated > 0;

  const childRatio = parentAmount > 0 ? childAllocated / parentAmount : 0;
  const childBarColor =
    childGap === 0 && anyChildAllocated
      ? themeColors.success
      : childGap < 0
        ? themeColors.error
        : themeColors.primary;

  return (
    <ThemeModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              className="rounded-t-[28px] bg-card"
              style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            >
              <View className="flex-row items-center gap-2.5 px-5 pb-3 pt-5">
                <CategoryEmoji icon={category.icon} size={20} />
                <Text variant="subheading" numberOfLines={1} className="min-w-0 shrink">
                  {category.name}
                </Text>
                <View className="flex-1" />
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.close')}
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center rounded-full bg-secondary/50 active:opacity-70"
                >
                  <X size={18} color={themeColors.textMuted} />
                </Pressable>
              </View>

              <ScrollView
                className="px-5"
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 420 }}
              >
                <View className="flex-row items-end gap-3">
                  <View className="flex-1">
                    <Input
                      label={I18n.t('budget.total_label')}
                      variant="currency"
                      currencySymbol={currencySymbol}
                      value={amounts[category.id] ?? ''}
                      onChangeText={(next) => onChangeAmount(category.id, next)}
                      placeholder="0"
                      autoFocus
                    />
                  </View>
                  {rootRemaining > 0 ? (
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('selection');
                        onChangeAmount(
                          category.id,
                          String(normalizeMoneyAmount(parentAmount + rootRemaining)),
                        );
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('budget.fill_remainder')}
                      className="h-[54px] items-center justify-center rounded-[22px] border border-primary/30 bg-primary/10 px-4 active:opacity-80"
                    >
                      <Text variant="caption" className="text-primary">
                        + {money(rootRemaining, settings)}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                {childCategories.length > 0 ? (
                  <View className="mt-5">
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
                          <Text variant="body" numberOfLines={1} className="min-w-0 flex-1">
                            {child.name}
                          </Text>
                          <View className="w-[112px]">
                            <Input
                              variant="currency"
                              currencySymbol={currencySymbol}
                              value={amounts[child.id] ?? ''}
                              onChangeText={(next) => onChangeAmount(child.id, next)}
                              placeholder="0"
                              accessibilityLabel={child.name}
                            />
                          </View>
                        </View>
                      ))}
                    </View>

                    {anyChildAllocated || childGap !== 0 ? (
                      <View className="mt-3">
                        <View
                          className="h-1.5 w-full overflow-hidden rounded-full"
                          style={{ backgroundColor: withColorAlpha(childBarColor, 0.15) }}
                        >
                          <View
                            className="h-1.5 rounded-full"
                            style={{
                              width: `${Math.max(0, Math.min(childRatio, 1)) * 100}%`,
                              backgroundColor: childBarColor,
                            }}
                          />
                        </View>
                        <Text
                          variant="caption"
                          className="mt-1.5"
                          style={{
                            color: childGap === 0 ? themeColors.textMuted : themeColors.error,
                          }}
                        >
                          {childGap === 0
                            ? I18n.t('budget.children_matched')
                            : I18n.t('budget.children_mismatch', {
                                total: money(parentAmount, settings),
                                delta: money(Math.abs(childGap), settings),
                              })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </ScrollView>

              <View className="px-5 pt-4">
                <Button onPress={onClose} className="w-full">
                  <Text>{I18n.t('common.done')}</Text>
                </Button>
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </ThemeModal>
  );
}
