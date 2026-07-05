import { Copy, Pencil, Plus, Trash2 } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import {
  Button,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import type { ColorPalette } from '~/constants/designSystem';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { BudgetTemplate, UserSettings } from '~/types';
import { formatAmount } from '~/utils/formatters';

interface BudgetTemplatesScreenProps {
  onBack?: () => void;
  onOpenEditor: (params?: { templateId?: string; duplicateFromId?: string }) => void;
  safeAreaEdges?: Edge[];
}

function money(value: number, settings: UserSettings): string {
  return formatAmount(value, { ...settings, displayMode: 'money' });
}

function DefaultRadio({ selected, themeColors }: { selected: boolean; themeColors: ColorPalette }) {
  return (
    <View
      className="h-5 w-5 items-center justify-center rounded-full border-2"
      style={{ borderColor: selected ? themeColors.primary : themeColors.border }}
    >
      {selected ? (
        <View
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: themeColors.primary }}
        />
      ) : null}
    </View>
  );
}

function TemplateCard({
  template,
  settings,
  themeColors,
  onSetDefault,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: BudgetTemplate;
  settings: UserSettings;
  themeColors: ColorPalette;
  onSetDefault: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <View className="rounded-2xl border border-border/45 bg-card">
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={template.name}
        className="flex-row items-center gap-3 px-4 pt-3.5 pb-2.5"
      >
        <Pressable
          onPress={(e) => {
            e.stopPropagation();
            if (template.isDefault) return;
            void triggerHaptic('selection');
            onSetDefault();
          }}
          hitSlop={10}
          accessibilityRole="radio"
          accessibilityState={{ selected: template.isDefault }}
          accessibilityLabel={I18n.t('budget.make_default')}
        >
          <DefaultRadio selected={template.isDefault} themeColors={themeColors} />
        </Pressable>

        <View className="flex-1">
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
            {money(template.totalAmount, settings)} ·{' '}
            {I18n.t('budget.categories_count', { count: template.allocations.length })}
          </Text>
        </View>
      </Pressable>

      <View className="h-px bg-border/30" />

      <View className="flex-row items-center justify-end gap-1 px-2 py-1">
        <Pressable
          onPress={onEdit}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.edit')}
          className="h-9 flex-row items-center gap-1.5 rounded-full px-3 active:opacity-70"
        >
          <Pencil size={14} color={themeColors.textMuted} />
          <Text variant="caption" tone="muted">
            {I18n.t('common.edit')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onDuplicate}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('budget.duplicate')}
          className="h-9 flex-row items-center gap-1.5 rounded-full px-3 active:opacity-70"
        >
          <Copy size={14} color={themeColors.textMuted} />
          <Text variant="caption" tone="muted">
            {I18n.t('budget.duplicate')}
          </Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.delete')}
          className="h-9 flex-row items-center gap-1.5 rounded-full px-3 active:opacity-70"
        >
          <Trash2 size={14} color={themeColors.coral} />
          <Text variant="caption" style={{ color: themeColors.coral }}>
            {I18n.t('common.delete')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function BudgetTemplatesScreen({
  onBack,
  onOpenEditor,
  safeAreaEdges = ['top'],
}: BudgetTemplatesScreenProps) {
  const { settings, budgetTemplates, setDefaultBudgetTemplate, deleteBudgetTemplate } = useApp();
  const { checkLimit } = useProGate();
  const themeColors = useThemeColors();
  const listNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);

  const handleAdd = useCallback(
    (duplicateFromId?: string) => {
      if (!checkLimit('budget_templates', budgetTemplates.length)) return;
      onOpenEditor(duplicateFromId ? { duplicateFromId } : undefined);
    },
    [budgetTemplates.length, checkLimit, onOpenEditor],
  );

  const handleDelete = useCallback(
    (template: BudgetTemplate) => {
      void triggerHaptic('warning');
      Alert.alert(
        I18n.t('budget.delete_template_title'),
        I18n.t('budget.delete_template_message'),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('common.delete'),
            style: 'destructive',
            onPress: () => deleteBudgetTemplate(template.id),
          },
        ],
      );
    },
    [deleteBudgetTemplate],
  );

  return (
    <SettingsPageLayout edges={safeAreaEdges}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-1"
          onBack={onBack}
          title={I18n.t('budget.templates_title')}
          subtitle={I18n.t('budget.templates_subtitle')}
          rightAccessory={
            <Button
              size="icon"
              onPress={() => handleAdd()}
              accessibilityLabel={I18n.t('budget.new_template')}
            >
              <Plus size={18} color="#fff" />
            </Button>
          }
        />
      </View>

      {budgetTemplates.length === 0 ? (
        <EmptyState
          title={I18n.t('budget.no_templates_title')}
          message={I18n.t('budget.no_templates_message')}
          mascotMood="curious"
          animateIn={false}
          action={{ label: I18n.t('budget.create_template'), onPress: () => handleAdd() }}
        />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={[
            { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
            listNavInset,
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-2.5">
            {budgetTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                settings={settings}
                themeColors={themeColors}
                onSetDefault={() => setDefaultBudgetTemplate(template.id)}
                onEdit={() => onOpenEditor({ templateId: template.id })}
                onDuplicate={() => handleAdd(template.id)}
                onDelete={() => handleDelete(template)}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </SettingsPageLayout>
  );
}
