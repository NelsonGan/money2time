import { Check, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryEmoji, Text, ThemeModal } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { BudgetTemplate, UserSettings } from '~/types';
import { formatAmount } from '~/utils/formatters';

interface BudgetTemplatePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  templates: BudgetTemplate[];
  settings: UserSettings;
  onSelect: (templateId: string) => void;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '70%',
  },
});

/** Bottom sheet for choosing which template a month's budget is created from. */
export function BudgetTemplatePickerSheet({
  visible,
  onClose,
  templates,
  settings,
  onSelect,
}: BudgetTemplatePickerSheetProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

  return (
    <ThemeModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheet}>
          <View
            className="rounded-t-[28px] bg-card"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
          >
            <View className="flex-row items-center gap-2 px-5 pb-4 pt-5">
              <Text variant="subheading" numberOfLines={1} className="shrink">
                {I18n.t('budget.choose_template')}
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
            <ScrollView className="px-4" showsVerticalScrollIndicator={false}>
              <View className="gap-2 pb-2">
                {templates.map((template) => (
                  <Pressable
                    key={template.id}
                    onPress={() => {
                      void triggerHaptic('selection');
                      onSelect(template.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={template.name}
                    className="flex-row items-center gap-3 rounded-2xl border border-border/40 bg-secondary/20 px-4 py-3.5 active:opacity-80"
                  >
                    {template.emoji ? <CategoryEmoji icon={template.emoji} size={20} /> : null}
                    <View className="min-w-0 flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text variant="bodyStrong" numberOfLines={1} className="shrink">
                          {template.name}
                        </Text>
                        {template.isDefault ? (
                          <View className="rounded-full bg-primary/12 px-2 py-0.5">
                            <Text variant="label" className="text-[9px] text-primary">
                              {I18n.t('budget.template_default_badge')}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text variant="caption" tone="muted" className="mt-0.5">
                        {formatAmount(template.totalAmount, {
                          ...settings,
                          displayMode: 'money',
                        })}{' '}
                        ·{' '}
                        {I18n.t('budget.categories_count', { count: template.allocations.length })}
                      </Text>
                    </View>
                    {template.isDefault ? <Check size={18} color={themeColors.primary} /> : null}
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </ThemeModal>
  );
}
