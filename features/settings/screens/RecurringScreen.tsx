import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { EmptyState } from '~/components/feedback/EmptyState';
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
  useSettingsBottomNavInset,
} from '~/components/ui';
import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { RecurringTransactionRule } from '~/types';
import { formatAmount } from '~/utils/formatters';
import { filterRecurringRulesByWallet, recurringAmountPerMonth } from '~/utils/recurringRules';

const MS_PER_DAY = 86_400_000;
const DUE_SOON_DAYS = 3;

const EVERY_KEY_BY_PATTERN: Record<RecurringTransactionRule['recurrencePattern'], string> = {
  daily: 'recurring.every_days',
  weekly: 'recurring.every_weeks',
  monthly: 'recurring.every_months',
  yearly: 'recurring.every_years',
};

function formatCadence(
  pattern: RecurringTransactionRule['recurrencePattern'],
  interval: number,
): string {
  // interval 1 reads as a plain adjective ("Monthly"); >1 as "Every N months".
  if (interval <= 1) return I18n.t(`transactions.editor.${pattern}`);
  return I18n.t(EVERY_KEY_BY_PATTERN[pattern], { count: interval });
}

function formatNextRun(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOfDate - startOfToday) / MS_PER_DAY);
  if (days <= 0) return I18n.t('recurring.due_now');
  if (days === 1) return I18n.t('recurring.due_tomorrow');
  if (days <= 6) return I18n.t('recurring.due_in_days', { count: days });
  return new Intl.DateTimeFormat(I18n.locale, { month: 'short', day: 'numeric' }).format(date);
}

function daysUntil(iso: string): number {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((startOfDate - startOfToday) / MS_PER_DAY);
}

interface RecurringRowProps {
  ruleId: string;
  name: string;
  type: RecurringTransactionRule['type'];
  isActive: boolean;
  amountLabel: string;
  monthlyLabel: string;
  cadenceLabel: string;
  nextRunLabel: string;
  dueSoon: boolean;
  categoryIcon: string | null;
  categoryParentIcon: string | null;
  textMutedColor: string;
  dangerColor: string;
  foregroundColor: string;
  successColor: string;
  onEdit: (id: string) => void;
  onDelete: (id: string, name: string) => void;
}

const RecurringRow = memo(
  function RecurringRow({
    ruleId,
    name,
    type,
    isActive,
    amountLabel,
    monthlyLabel,
    cadenceLabel,
    nextRunLabel,
    dueSoon,
    categoryIcon,
    categoryParentIcon,
    textMutedColor,
    dangerColor,
    foregroundColor,
    successColor,
    onEdit,
    onDelete,
  }: RecurringRowProps) {
    const handleEdit = useCallback(() => {
      void triggerHaptic('selection');
      onEdit(ruleId);
    }, [onEdit, ruleId]);
    const handleDelete = useCallback(() => {
      void triggerHaptic('warning');
      onDelete(ruleId, name);
    }, [onDelete, ruleId, name]);

    const amountTone = !isActive
      ? 'text-muted-foreground'
      : type === 'income'
        ? 'text-success'
        : type === 'transfer'
          ? 'text-foreground'
          : 'text-destructive';

    const fallbackIconColor =
      type === 'income' ? successColor : type === 'transfer' ? foregroundColor : dangerColor;
    const hasCategoryIcon = Boolean(categoryIcon || categoryParentIcon);

    return (
      <View className="flex-row items-center">
        <Pressable
          onPress={handleEdit}
          accessibilityRole="button"
          accessibilityLabel={name}
          className="flex-1 flex-row items-center gap-3 py-3 active:opacity-60"
        >
          <View className={`w-8 items-center justify-center ${isActive ? '' : 'opacity-40'}`}>
            {hasCategoryIcon ? (
              <CategoryEmoji
                icon={categoryIcon}
                parentIcon={categoryParentIcon}
                size={26}
                className="text-[24px]"
                hidePlaceholder
              />
            ) : type === 'income' ? (
              <ArrowDownLeft size={20} color={isActive ? fallbackIconColor : textMutedColor} />
            ) : type === 'transfer' ? (
              <ArrowLeftRight size={20} color={isActive ? fallbackIconColor : textMutedColor} />
            ) : (
              <ArrowUpRight size={20} color={isActive ? fallbackIconColor : textMutedColor} />
            )}
          </View>

          <View className="flex-1 gap-0.5">
            <View className="flex-row items-center gap-2">
              <Text
                variant="caption"
                numberOfLines={1}
                className={`flex-shrink ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}
              >
                {name}
              </Text>
              {!isActive ? (
                <View className="rounded-full bg-muted/70 px-1.5 py-0.5">
                  <Text variant="label" className="text-[9px] text-muted-foreground">
                    {I18n.t('recurring.paused')}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="label" className="text-[10px] normal-case tracking-normal" tone="muted">
              {cadenceLabel}
              {'  ·  '}
              <Text
                variant="label"
                className={`text-[10px] normal-case tracking-normal ${dueSoon && isActive ? 'text-primary' : 'text-muted-foreground'}`}
              >
                {nextRunLabel}
              </Text>
            </Text>
          </View>

          <View className="items-end gap-0.5 pl-2">
            <Text variant="bodyStrong" className={`text-[15px] ${amountTone}`}>
              {amountLabel}
            </Text>
            {monthlyLabel ? (
              <Text
                variant="label"
                className="text-[10px] normal-case tracking-normal"
                tone="muted"
              >
                {monthlyLabel}
              </Text>
            ) : null}
          </View>
        </Pressable>

        <Pressable
          onPress={handleDelete}
          style={styles.deleteButton}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.delete')}
        >
          <Trash2 size={15} color={dangerColor} />
        </Pressable>
      </View>
    );
  },
  (prev, next) =>
    prev.ruleId === next.ruleId &&
    prev.name === next.name &&
    prev.isActive === next.isActive &&
    prev.amountLabel === next.amountLabel &&
    prev.monthlyLabel === next.monthlyLabel &&
    prev.cadenceLabel === next.cadenceLabel &&
    prev.nextRunLabel === next.nextRunLabel &&
    prev.dueSoon === next.dueSoon &&
    prev.categoryIcon === next.categoryIcon &&
    prev.categoryParentIcon === next.categoryParentIcon &&
    prev.textMutedColor === next.textMutedColor &&
    prev.dangerColor === next.dangerColor &&
    prev.foregroundColor === next.foregroundColor &&
    prev.successColor === next.successColor &&
    prev.onEdit === next.onEdit &&
    prev.onDelete === next.onDelete,
);

interface RecurringScreenProps {
  onBack: () => void;
  onOpenEditor: (ruleId?: string) => void;
  useNativeBackGesture?: boolean;
}

export function RecurringScreen({
  onBack,
  onOpenEditor,
  useNativeBackGesture = false,
}: RecurringScreenProps) {
  const themeColors = useThemeColors();
  const bottomNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
  const {
    settings,
    recurringRules,
    deleteRecurringRule,
    isSimpleMode,
    simpleWalletId,
    getCategoryById,
    getTrueHourlyRateForDate,
  } = useApp();
  const { checkLimit } = useProGate();

  const allRules = useMemo(() => {
    const scoped = isSimpleMode
      ? filterRecurringRulesByWallet(recurringRules, simpleWalletId)
      : recurringRules;
    // Active rules first (ordered by next run from the repo), paused at the bottom.
    return [...scoped].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.nextRunDate.localeCompare(b.nextRunDate);
    });
  }, [isSimpleMode, simpleWalletId, recurringRules]);

  const hourlyRate = useMemo(
    () => getTrueHourlyRateForDate(new Date().toISOString()),
    [getTrueHourlyRateForDate],
  );

  const formatValue = useCallback(
    (amount: number) =>
      formatAmount(
        amount,
        { currencySymbol: settings.currencySymbol, displayMode: settings.displayMode },
        { showSign: false, trueHourlyRate: hourlyRate },
      ),
    [settings.currencySymbol, settings.displayMode, hourlyRate],
  );

  const monthlyExpense = useMemo(
    () =>
      allRules.reduce((total, rule) => {
        if (!rule.isActive || rule.type !== 'expense') return total;
        return (
          total +
          recurringAmountPerMonth(rule.amount, rule.recurrencePattern, rule.recurrenceInterval)
        );
      }, 0),
    [allRules],
  );

  const openCreate = useCallback(() => {
    if (!checkLimit('recurring', recurringRules.length)) return;
    onOpenEditor();
  }, [checkLimit, onOpenEditor, recurringRules.length]);

  const openEdit = useCallback((id: string) => onOpenEditor(id), [onOpenEditor]);

  const handleDeleteRule = useCallback(
    (id: string, name: string) => {
      Alert.alert(I18n.t('recurring.delete_rule'), I18n.t('recurring.delete_confirm', { name }), [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => deleteRecurringRule(id),
        },
      ]);
    },
    [deleteRecurringRule],
  );

  const keyExtractor = useCallback((item: RecurringTransactionRule) => item.id, []);

  const renderRule = useCallback(
    ({ item }: { item: RecurringTransactionRule }) => {
      const category = item.categoryId ? getCategoryById(item.categoryId) : undefined;
      const parent = category?.parentId ? getCategoryById(category.parentId) : undefined;
      const perMonth = recurringAmountPerMonth(
        item.amount,
        item.recurrencePattern,
        item.recurrenceInterval,
      );
      // Monthly/interval-1 rules already equal their monthly total — skip the redundant line.
      const isMonthlyEquivRedundant =
        item.recurrencePattern === 'monthly' && item.recurrenceInterval === 1;
      return (
        <RecurringRow
          ruleId={item.id}
          name={item.name}
          type={item.type}
          isActive={item.isActive}
          amountLabel={formatValue(item.amount)}
          monthlyLabel={
            isMonthlyEquivRedundant
              ? ''
              : I18n.t('recurring.approx_per_month', { amount: formatValue(perMonth) })
          }
          cadenceLabel={formatCadence(item.recurrencePattern, item.recurrenceInterval)}
          nextRunLabel={formatNextRun(item.nextRunDate)}
          dueSoon={daysUntil(item.nextRunDate) <= DUE_SOON_DAYS}
          categoryIcon={category?.icon ?? null}
          categoryParentIcon={parent?.icon ?? null}
          textMutedColor={themeColors.textMuted}
          dangerColor={themeColors.coral}
          foregroundColor={themeColors.text}
          successColor={themeColors.success}
          onEdit={openEdit}
          onDelete={handleDeleteRule}
        />
      );
    },
    [
      formatValue,
      getCategoryById,
      handleDeleteRule,
      openEdit,
      themeColors.coral,
      themeColors.text,
      themeColors.success,
      themeColors.textMuted,
    ],
  );

  const listHeader = useMemo(() => {
    if (allRules.length === 0) return null;

    return (
      <Card className="mb-4 overflow-hidden rounded-3xl border-primary/15 bg-primary/[0.05]">
        <CardContent className="gap-2 px-4 pb-3.5 pt-3.5">
          <View className="flex-row items-center gap-2">
            <View className="h-7 w-7 items-center justify-center rounded-full bg-primary/15">
              <Repeat size={14} color={themeColors.primary} />
            </View>
            <Text variant="label" tone="muted">
              {I18n.t('recurring.summary_label')}
            </Text>
          </View>

          <View className="flex-row items-baseline gap-1.5">
            <Text variant="display" numberOfLines={1} className="flex-shrink text-destructive">
              {formatValue(monthlyExpense)}
            </Text>
            <Text variant="label" tone="muted" className="tracking-normal">
              {I18n.t('recurring.per_month_suffix')}
            </Text>
          </View>
        </CardContent>
      </Card>
    );
  }, [allRules.length, formatValue, monthlyExpense, themeColors.primary]);

  const listEmpty = useMemo(
    () => (
      <EmptyState
        title={I18n.t('recurring.empty_title')}
        message={I18n.t('recurring.empty_message')}
        mascotMood="curious"
        action={{ label: I18n.t('recurring.create_commitment'), onPress: openCreate }}
      />
    ),
    [openCreate],
  );

  const content = (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onBack}
          title={I18n.t('recurring.title')}
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
        contentContainerStyle={[styles.listContent, bottomNavInset]}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        renderItem={renderRule}
        ItemSeparatorComponent={ItemSeparator}
        initialNumToRender={14}
        maxToRenderPerBatch={14}
        windowSize={9}
        removeClippedSubviews
      />
    </SettingsPageLayout>
  );

  if (useNativeBackGesture) return content;
  return <EdgeSwipeBackContainer onBack={onBack}>{content}</EdgeSwipeBackContainer>;
}

function ItemSeparator() {
  return <View style={styles.separator} className="bg-border/40" />;
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  listContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
  },
  deleteButton: {
    height: 34,
    width: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 44,
  },
});
