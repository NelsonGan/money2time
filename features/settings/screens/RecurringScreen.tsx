import React, { memo, useCallback, useMemo } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';

import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import {
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
} from '~/components/ui/settings';
import { Text } from '~/components/ui/text';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { dayKeyFromIsoLocal, formatAmount } from '~/utils/formatters';
import { triggerHaptic } from '~/services/haptics';
import type { RecurringTransactionRule } from '~/types';
import { I18n } from '~/lib/i18n';

interface RecurringScreenProps {
  onBack: () => void;
  onOpenEditor: (ruleId?: string) => void;
}

interface RecurringRuleCardProps {
  rule: RecurringTransactionRule;
  onEdit: (rule: RecurringTransactionRule) => void;
  onDelete: (id: string) => void;
  textMutedColor: string;
  dangerColor: string;
  currencySymbol: string;
  displayMode: 'money' | 'time';
  hourRounding: number;
}

const RecurringRuleCard = memo(
  function RecurringRuleCard({
    rule,
    onEdit,
    onDelete,
    textMutedColor,
    dangerColor,
    currencySymbol,
    displayMode,
    hourRounding,
  }: RecurringRuleCardProps) {
    const cadenceLabel = useMemo(
      () =>
        I18n.t('recurring.every_pattern', {
          interval: rule.recurrenceInterval,
          pattern: rule.recurrencePattern,
        }),
      [rule.recurrenceInterval, rule.recurrencePattern],
    );
    const nextRunLabel = dayKeyFromIsoLocal(rule.nextRunDate);
    const formatSettings = useMemo(
      () => ({ currencySymbol, displayMode, hourRounding }),
      [currencySymbol, displayMode, hourRounding],
    );
    const handleEdit = useCallback(() => {
      void triggerHaptic('selection');
      onEdit(rule);
    }, [onEdit, rule]);
    const handleDelete = useCallback(() => {
      void triggerHaptic('warning');
      onDelete(rule.id);
    }, [onDelete, rule.id]);

    return (
      <Card className="mb-3 rounded-2xl border-border/45">
        <CardContent className="py-3.5 gap-3">
          <View className="flex-row items-start justify-between gap-3">
            <View className="flex-1 gap-1">
              <View
                className={`self-start rounded-full px-2 py-1 ${rule.isActive ? 'bg-success/12' : 'bg-muted/65'}`}
              >
                <Text
                  variant="label"
                  className={rule.isActive ? 'text-success' : 'text-muted-foreground'}
                >
                  {rule.isActive ? I18n.t('recurring.active') : I18n.t('recurring.paused')}
                </Text>
              </View>
              <Text variant="caption" numberOfLines={1} className="text-foreground">
                {rule.name}
              </Text>
              <Text
                variant="subheading"
                className={
                  !rule.isActive
                    ? 'text-muted-foreground'
                    : rule.type === 'income'
                      ? 'text-success'
                      : rule.type === 'transfer'
                        ? 'text-primary'
                        : 'text-destructive'
                }
              >
                {formatAmount(rule.amount, formatSettings, { showSign: false })}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={handleEdit}
                className="h-9 w-9 items-center justify-center rounded-full bg-secondary/55"
              >
                <Pencil size={14} color={textMutedColor} />
              </Pressable>
              <Pressable
                onPress={handleDelete}
                className="h-9 w-9 items-center justify-center rounded-full bg-destructive/12"
              >
                <Trash2 size={14} color={dangerColor} />
              </Pressable>
            </View>
          </View>
          <View className="rounded-xl border border-border/25 bg-secondary/35 px-3 py-2.5 gap-1.5">
            <View className="flex-row items-center justify-between">
              <Text variant="label" tone="muted">
                {I18n.t('recurring.next_run')}
              </Text>
              <Text variant="label" className="text-foreground">
                {nextRunLabel}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text variant="label" tone="muted">
                {I18n.t('recurring.cadence')}
              </Text>
              <Text variant="label" className="text-foreground">
                {cadenceLabel}
              </Text>
            </View>
          </View>
        </CardContent>
      </Card>
    );
  },
  (prev, next) =>
    prev.rule.id === next.rule.id &&
    prev.rule.updatedAt === next.rule.updatedAt &&
    prev.textMutedColor === next.textMutedColor &&
    prev.dangerColor === next.dangerColor &&
    prev.currencySymbol === next.currencySymbol &&
    prev.displayMode === next.displayMode &&
    prev.hourRounding === next.hourRounding &&
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete,
);

export function RecurringScreen({ onBack, onOpenEditor }: RecurringScreenProps) {
  const themeColors = useThemeColors();
  const { settings, recurringRules, deleteRecurringRule } = useApp();
  const allRules = recurringRules;

  const openCreate = useCallback(() => {
    onOpenEditor();
  }, [onOpenEditor]);

  const openEdit = useCallback((rule: RecurringTransactionRule) => {
    onOpenEditor(rule.id);
  }, [onOpenEditor]);
  const handleDeleteRule = useCallback(
    (id: string) => {
      deleteRecurringRule(id);
    },
    [deleteRecurringRule],
  );
  const keyExtractor = useCallback((item: RecurringTransactionRule) => item.id, []);
  const renderRule = useCallback(
    ({ item }: { item: RecurringTransactionRule }) => (
      <RecurringRuleCard
        rule={item}
        onEdit={openEdit}
        onDelete={handleDeleteRule}
        textMutedColor={themeColors.textMuted}
        dangerColor={themeColors.coral}
        currencySymbol={settings.currencySymbol}
        displayMode={settings.displayMode}
        hourRounding={settings.hourRounding}
      />
    ),
    [
      handleDeleteRule,
      openEdit,
      settings.currencySymbol,
      settings.displayMode,
      settings.hourRounding,
      themeColors.coral,
      themeColors.textMuted,
    ],
  );
  const listEmpty = useMemo(
    () => (
      <Card>
        <CardContent className="py-6 items-center">
          <Text variant="caption">{I18n.t('recurring.empty_title')}</Text>
          <Button className="mt-3" onPress={openCreate}>
            <Text>{I18n.t('recurring.create_commitment')}</Text>
          </Button>
        </CardContent>
      </Card>
    ),
    [openCreate],
  );

  return (
    <SettingsPageLayout>
      <View style={{ paddingHorizontal: SETTINGS_HORIZONTAL_PADDING }}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('recurring.title')}
          subtitle={I18n.t('recurring.subtitle')}
          rightAccessory={
            <Button size="icon" onPress={openCreate}>
              <Plus size={18} color="#fff" />
            </Button>
          }
        />
      </View>
      <FlatList
        data={allRules}
        keyExtractor={keyExtractor}
        contentContainerStyle={{
          paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
          paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
        }}
        ListEmptyComponent={listEmpty}
        renderItem={renderRule}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
      />
    </SettingsPageLayout>
  );
}
