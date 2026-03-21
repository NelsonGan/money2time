import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { EdgeSwipeBackContainer } from '~/components/navigation/EdgeSwipeBackContainer';
import {
  Button,
  Card,
  CardContent,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
} from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { RecurringTransactionRule } from '~/types';
import { dayKeyFromIsoLocal, formatAmount } from '~/utils/formatters';
import { filterRecurringRulesByWallet } from '~/utils/recurringRules';

interface RecurringScreenProps {
  onBack: () => void;
  onOpenEditor: (ruleId?: string) => void;
  useNativeBackGesture?: boolean;
}

interface RecurringRuleCardProps {
  rule: RecurringTransactionRule;
  onEdit: (rule: RecurringTransactionRule) => void;
  onDelete: (id: string) => void;
  textMutedColor: string;
  dangerColor: string;
  currencySymbol: string;
  displayMode: 'money' | 'time';
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
      () => ({ currencySymbol, displayMode }),
      [currencySymbol, displayMode],
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
                style={styles.cardActionIcon}
                className="bg-secondary/55"
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.edit')}
              >
                <Pencil size={14} color={textMutedColor} />
              </Pressable>
              <Pressable
                onPress={handleDelete}
                style={styles.cardActionIcon}
                className="bg-destructive/12"
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.delete')}
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
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete,
);

export function RecurringScreen({
  onBack,
  onOpenEditor,
  useNativeBackGesture = false,
}: RecurringScreenProps) {
  const themeColors = useThemeColors();
  const { settings, recurringRules, deleteRecurringRule, isSimpleMode, simpleWalletId } = useApp();
  const { checkLimit } = useProGate();
  const allRules = useMemo(() => {
    if (!isSimpleMode) return recurringRules;
    return filterRecurringRulesByWallet(recurringRules, simpleWalletId);
  }, [isSimpleMode, simpleWalletId, recurringRules]);

  const openCreate = useCallback(() => {
    if (!checkLimit('recurring', recurringRules.length)) return;
    onOpenEditor();
  }, [checkLimit, onOpenEditor, recurringRules.length]);

  const openEdit = useCallback(
    (rule: RecurringTransactionRule) => {
      onOpenEditor(rule.id);
    },
    [onOpenEditor],
  );
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
      />
    ),
    [
      handleDeleteRule,
      openEdit,
      settings.currencySymbol,
      settings.displayMode,
      themeColors.coral,
      themeColors.textMuted,
    ],
  );
  const content = (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
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
        contentContainerStyle={styles.listContent}
        renderItem={renderRule}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
      />
    </SettingsPageLayout>
  );

  if (useNativeBackGesture) return content;
  return <EdgeSwipeBackContainer onBack={onBack}>{content}</EdgeSwipeBackContainer>;
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  listContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
  },
  cardActionIcon: {
    height: 44,
    width: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
