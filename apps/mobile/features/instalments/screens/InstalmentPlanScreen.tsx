import { Check, ChevronRight, X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EdgeSwipeBackContainer } from '~/components/navigation/EdgeSwipeBackContainer';
import {
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { AccountLogo } from '~/components/ui/AccountLogo';
import { AccountPickerSheet } from '~/components/ui/AccountPickerSheet';
import { Button } from '~/components/ui/button';
import { CategoryEmoji } from '~/components/ui/CategoryEmoji';
import {
  buildCategoryPickerOptions,
  CategoryPickerSheet,
} from '~/components/ui/CategoryPickerSheet';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { ThemeModal } from '~/components/ui/theme-modal';
import { useApp } from '~/context/AppContext';
import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { formatAmount, formatShortDate } from '~/utils/formatters';

import { InstalmentProgressBar } from '../components/InstalmentPlanCard';
import { formatPlanDay } from '../lib/format';
import {
  instalmentAmounts,
  type InstalmentEntry,
  type InstalmentProgress,
  isRegularAmountValid,
} from '../lib/instalmentPlan';

interface InstalmentPlanScreenProps {
  planId: string;
  onBack: () => void;
  /** Opens a payment that was made, in the transaction editor. */
  onOpenPayment: (transactionId: string) => void;
  useNativeBackGesture?: boolean;
}

/**
 * One plan: what is left (the hero), the next payment and its shortcut, the
 * schedule, and paying off the rest.
 */
export function InstalmentPlanScreen({
  planId,
  onBack,
  onOpenPayment,
  useNativeBackGesture = false,
}: InstalmentPlanScreenProps) {
  const bottomNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
  const {
    settings,
    instalmentPlans,
    getCategoryById,
    getAccountById,
    payNextInstalment,
    payOffInstalmentPlan,
  } = useApp();
  const [editing, setEditing] = useState(false);
  const plan = useMemo(
    () => instalmentPlans.find((candidate) => candidate.rule.id === planId) ?? null,
    [instalmentPlans, planId],
  );

  // Deleted here or on another phone: there is nothing left to show.
  useEffect(() => {
    if (!plan) onBack();
  }, [onBack, plan]);
  if (!plan) return <View className="flex-1 bg-background" />;

  const { rule } = plan;
  const category = rule.categoryId ? getCategoryById(rule.categoryId) : undefined;
  const parent = category?.parentId ? getCategoryById(category.parentId) : undefined;
  const account = rule.accountId ? getAccountById(rule.accountId) : undefined;
  const money = (amount: number) => formatAmount(amount, settings, { currencyCode: rule.currency });

  const confirmPayEarly = () => {
    if (!plan.next) return;
    Alert.alert(
      I18n.t('instalments.pay_early_title', { amount: money(plan.next.amount) }),
      I18n.t('instalments.pay_early_message'),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('instalments.pay_now'),
          onPress: () => {
            void triggerHaptic('success');
            payNextInstalment(rule.id);
          },
        },
      ],
    );
  };

  const confirmPayOff = () => {
    Alert.alert(
      I18n.t('instalments.pay_off_title'),
      I18n.t('instalments.pay_off_message', { amount: money(plan.leftAmount) }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('instalments.pay_off'),
          onPress: () => {
            void triggerHaptic('success');
            payOffInstalmentPlan(rule.id);
          },
        },
      ],
    );
  };

  const upcomingCount = plan.entries.filter((entry) => entry.status === 'upcoming').length;

  const content = (
    <SettingsPageLayout>
      <View style={styles.headerWrap}>
        <SettingsHeader
          className="px-0 pb-1 pt-5"
          onBack={onBack}
          title=""
          rightAccessory={
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setEditing(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('instalments.edit_plan')}
              hitSlop={8}
              className="h-10 justify-center px-2 active:opacity-70"
            >
              <Text variant="bodyStrong" tone="primary">
                {I18n.t('common.edit')}
              </Text>
            </Pressable>
          }
        />
      </View>
      <ScrollView contentContainerStyle={[styles.content, bottomNavInset]}>
        <View className="gap-4">
          {/* What it is: icon, name, and where it is paid from in one line. */}
          <View className="items-center gap-1 pb-2">
            <CategoryEmoji icon={category?.icon} parentIcon={parent?.icon} size={56} />
            <Text variant="heading" className="mt-2 text-center" numberOfLines={2}>
              {rule.name}
            </Text>
            <Text variant="body" tone="muted" numberOfLines={1}>
              {[category?.name, account?.name].filter(Boolean).join(' · ')}
            </Text>
          </View>

          {/* Where it stands: what is left is the number that matters. */}
          <View className="items-center gap-4 rounded-[24px] border border-border/30 bg-card px-5 py-5">
            <View className="items-center">
              <Text variant="title" tone={plan.complete ? 'success' : 'default'}>
                {plan.complete ? money(plan.paidAmount) : money(plan.leftAmount)}
              </Text>
              {/* Fully paid needs no words: the green total and full bar say it.
                  A plan that ended with payments skipped says it finished. */}
              {plan.complete && plan.paidCount === plan.entries.length ? null : (
                <Text variant="body" tone="muted">
                  {plan.complete
                    ? I18n.t('instalments.section_finished')
                    : I18n.t('instalments.left_label')}
                </Text>
              )}
            </View>
            <View className="self-stretch">
              <InstalmentProgressBar plan={plan} />
            </View>
            <Text variant="caption" tone="muted">
              {I18n.t('instalments.progress_meta', {
                paid: plan.paidCount,
                count: plan.entries.length,
                amount: money(plan.paidAmount),
              })}
            </Text>
          </View>

          {/* The next payment, with the one action it invites. */}
          {plan.next ? (
            <View className="flex-row items-center gap-3 rounded-[24px] border border-border/30 bg-card px-5 py-4">
              <View className="flex-1 gap-0.5">
                <Text variant="caption" tone="muted">
                  {I18n.t('instalments.next_payment')}
                </Text>
                <Text variant="subheading">
                  {`${money(plan.next.amount)} · ${formatPlanDay(plan.next.dateIso)}`}
                </Text>
              </View>
              <Button
                variant="outline"
                size="sm"
                onPress={confirmPayEarly}
                accessibilityRole="button"
              >
                <Text>{I18n.t('instalments.pay_now')}</Text>
              </Button>
            </View>
          ) : null}

          {/* Every payment: a mark for paid, a dot for the next one. */}
          <View className="gap-2 pt-2">
            <Text variant="subheading">{I18n.t('instalments.schedule')}</Text>
            <View className="overflow-hidden rounded-[24px] border border-border/30 bg-card">
              {plan.entries.map((entry, index) => (
                <ScheduleRow
                  key={entry.number}
                  entry={entry}
                  isNext={plan.next?.number === entry.number}
                  amountLabel={money(entry.amount)}
                  isLast={index === plan.entries.length - 1}
                  onPress={
                    entry.transactionId ? () => onOpenPayment(entry.transactionId!) : undefined
                  }
                />
              ))}
            </View>
          </View>

          {/* With one payment left, Pay now already settles it. */}
          {upcomingCount > 1 ? (
            <Button variant="outline" onPress={confirmPayOff} accessibilityRole="button">
              <Text>
                {I18n.t('instalments.pay_off_amount', { amount: money(plan.leftAmount) })}
              </Text>
            </Button>
          ) : null}
        </View>
      </ScrollView>
      <InstalmentPlanEditSheet visible={editing} plan={plan} onClose={() => setEditing(false)} />
    </SettingsPageLayout>
  );

  if (useNativeBackGesture) return content;
  return <EdgeSwipeBackContainer onBack={onBack}>{content}</EdgeSwipeBackContainer>;
}

function ScheduleRow({
  entry,
  isNext,
  amountLabel,
  isLast,
  onPress,
}: {
  entry: InstalmentEntry;
  isNext: boolean;
  amountLabel: string;
  isLast: boolean;
  onPress?: () => void;
}) {
  const themeColors = useThemeColors();
  const paid = entry.status === 'paid' || entry.status === 'paid_off';
  const done = paid || entry.status === 'skipped';
  // Read aloud in place of the marks, which carry no text of their own.
  const statusLabel = paid
    ? I18n.t('instalments.status_paid')
    : entry.status === 'skipped'
      ? I18n.t('instalments.status_skipped')
      : I18n.t('instalments.status_upcoming');
  // Always with the year: a schedule often runs into the next one.
  const dateLabel = formatShortDate(entry.dateIso);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${dateLabel}, ${amountLabel}, ${statusLabel}`}
      className={cn(
        'min-h-[52px] flex-row items-center gap-3 px-4 active:opacity-70',
        isLast ? '' : 'border-b border-border/20',
      )}
    >
      <View className="w-5 items-center">
        {paid ? (
          <View className="h-5 w-5 items-center justify-center rounded-full bg-success">
            <Check size={12} color="#fff" strokeWidth={3} />
          </View>
        ) : entry.status === 'skipped' ? (
          <X size={16} color={themeColors.textMuted} />
        ) : isNext ? (
          <View className="h-2.5 w-2.5 rounded-full bg-primary" />
        ) : null}
      </View>
      <Text
        variant="body"
        numberOfLines={1}
        className={cn('min-w-0 flex-1', done ? 'text-muted-foreground' : '')}
      >
        {dateLabel}
      </Text>
      <Text
        variant="body"
        numberOfLines={1}
        className={cn('shrink-0', done ? 'text-muted-foreground' : '')}
      >
        {amountLabel}
      </Text>
    </Pressable>
  );
}

/**
 * Rename the plan, or move its upcoming payments to another account or
 * category. The total, count and dates are fixed once made. Delete lives here.
 */
function InstalmentPlanEditSheet({
  visible,
  plan,
  onClose,
}: {
  visible: boolean;
  plan: InstalmentProgress;
  onClose: () => void;
}) {
  const { rule } = plan;
  const {
    settings,
    accounts,
    accountGroups,
    categories,
    getCategoryById,
    getAccountById,
    updateInstalmentPlan,
    deleteInstalmentPlan,
  } = useApp();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const sheetColumnStyle = useSheetColumnStyle();
  // The sheet grows by the keyboard's height (as padding, so its own
  // background runs on behind the see-through keyboard) instead of sliding
  // up and leaving the page showing through it.
  const bottomPadding = Math.max(insets.bottom, 16) + 8;
  const keyboard = useReanimatedKeyboardAnimation();
  const keyboardPad = useAnimatedStyle(() => ({
    paddingBottom: Math.max(bottomPadding, -keyboard.height.value + 12),
  }));
  const [name, setName] = useState(rule.name);
  const [accountId, setAccountId] = useState(rule.accountId);
  const [categoryId, setCategoryId] = useState(rule.categoryId);
  const [picker, setPicker] = useState<'account' | 'category' | null>(null);
  // The payment amount, for the payments still to come. With one left it is
  // whatever balances the plan, so there is nothing to set.
  const upcomingCount = plan.entries.filter((entry) => entry.status === 'upcoming').length;
  const canEditAmount = upcomingCount >= 2;
  const [amountText, setAmountText] = useState(rule.amount.toFixed(2));

  useEffect(() => {
    if (!visible) return;
    setAmountText(rule.amount.toFixed(2));
    setName(rule.name);
    setAccountId(rule.accountId);
    setCategoryId(rule.categoryId);
    setPicker(null);
  }, [rule.accountId, rule.amount, rule.categoryId, rule.name, visible]);

  const categoryOptions = useMemo(
    () => buildCategoryPickerOptions(categories.filter((category) => category.type === 'expense')),
    [categories],
  );
  const category = categoryId ? getCategoryById(categoryId) : undefined;
  const parent = category?.parentId ? getCategoryById(category.parentId) : undefined;
  const account = accountId ? getAccountById(accountId) : undefined;
  const trimmed = name.trim();
  const money = (value: number) => formatAmount(value, settings, { currencyCode: rule.currency });
  const parsedAmount = Math.round(Number(amountText.replace(',', '.')) * 100) / 100;
  const amountChanged = canEditAmount && parsedAmount !== rule.amount;
  // What is left to pay, as the upcoming payments at the new amount with the
  // last one taking the rest.
  const amountValid =
    !amountChanged || isRegularAmountValid(plan.leftAmount, upcomingCount, parsedAmount);
  const newLast = amountChanged
    ? instalmentAmounts(plan.leftAmount, upcomingCount, parsedAmount)[upcomingCount - 1]
    : null;
  const canSave = !!trimmed && amountValid;

  const save = () => {
    if (!canSave) return;
    void triggerHaptic('success');
    updateInstalmentPlan(rule.id, {
      name: trimmed,
      ...(trimmed !== rule.name ? { note: trimmed } : {}),
      ...(accountId && accountId !== rule.accountId ? { accountId } : {}),
      ...(categoryId && categoryId !== rule.categoryId ? { categoryId } : {}),
      ...(amountChanged ? { amount: parsedAmount } : {}),
    });
    onClose();
  };

  const confirmDelete = () => {
    Alert.alert(I18n.t('instalments.delete_title'), I18n.t('instalments.delete_message'), [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: I18n.t('instalments.delete_keep_payments'),
        onPress: () => {
          onClose();
          deleteInstalmentPlan(rule.id, false);
        },
      },
      {
        text: I18n.t('instalments.delete_with_payments'),
        style: 'destructive',
        onPress: () => {
          onClose();
          deleteInstalmentPlan(rule.id, true);
        },
      },
    ]);
  };

  return (
    <ThemeModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <Animated.View
          style={[
            sheetColumnStyle,
            styles.sheetShell,
            { backgroundColor: themeColors.card },
            keyboardPad,
          ]}
        >
          <View className="gap-5 px-5 pt-5">
            <View className="flex-row items-center">
              <Text variant="subheading" className="flex-1">
                {I18n.t('instalments.edit_plan')}
              </Text>
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

            {/* One grouped list: name, category, account. */}
            <View className="gap-2">
              <View className="overflow-hidden rounded-[20px] border border-border/40 bg-background">
                <View className="min-h-[52px] flex-row items-center gap-3 border-b border-border/30 px-4">
                  <Text variant="body" tone="muted">
                    {I18n.t('instalments.name')}
                  </Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder={I18n.t('instalments.name_placeholder')}
                    placeholderTextColor={themeColors.textMuted}
                    style={[SINGLE_LINE_TEXT_INPUT_STYLE, { color: themeColors.text }]}
                    className="h-12 flex-1 text-right text-[16px]"
                    returnKeyType="done"
                    maxLength={80}
                    accessibilityLabel={I18n.t('instalments.name')}
                  />
                </View>
                <EditRow
                  label={I18n.t('transactions.editor.category')}
                  value={category?.name ?? ''}
                  icon={<CategoryEmoji icon={category?.icon} parentIcon={parent?.icon} size={18} />}
                  onPress={() => setPicker('category')}
                  bordered
                />
                <EditRow
                  label={I18n.t('transactions.editor.account')}
                  value={account?.name ?? ''}
                  icon={
                    account ? (
                      <AccountLogo
                        logoId={account.logoId}
                        type={account.type}
                        goalEmoji={account.goalEmoji}
                        size={18}
                      />
                    ) : null
                  }
                  onPress={() => setPicker('account')}
                  bordered={canEditAmount}
                />
                {canEditAmount ? (
                  <View className="min-h-[52px] flex-row items-center gap-3 px-4">
                    <Text variant="body" tone="muted">
                      {I18n.t('instalments.payment_amount')}
                    </Text>
                    {/* The amount, with what the last payment becomes under it. */}
                    <View className="flex-1 items-end py-1.5">
                      <TextInput
                        value={amountText}
                        onChangeText={setAmountText}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        style={[SINGLE_LINE_TEXT_INPUT_STYLE, { color: themeColors.text }]}
                        className="h-9 self-stretch text-right text-[16px]"
                        accessibilityLabel={I18n.t('instalments.payment_amount')}
                      />
                      {amountValid && newLast != null ? (
                        <Text variant="caption" tone="primary" numberOfLines={1}>
                          {I18n.t('instalments.last_amount', { amount: money(newLast) })}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>
              <Text variant="caption" tone={amountValid ? 'muted' : 'error'} className="px-1">
                {amountValid
                  ? I18n.t('instalments.edit_hint')
                  : I18n.t('instalments.amount_too_large')}
              </Text>
            </View>

            <View className="gap-1">
              <Button onPress={save} disabled={!canSave} style={{ opacity: canSave ? 1 : 0.5 }}>
                <Text>{I18n.t('common.save')}</Text>
              </Button>
              <Button variant="ghost" size="sm" onPress={confirmDelete}>
                <Text className="text-destructive">{I18n.t('instalments.delete_plan')}</Text>
              </Button>
            </View>
          </View>
        </Animated.View>
        <CategoryPickerSheet
          overlay
          allowParentSelection
          visible={picker === 'category'}
          onClose={() => setPicker(null)}
          parents={categoryOptions.parents}
          childByParent={categoryOptions.childByParent}
          selectedCategoryId={categoryId}
          onSelect={(next) => {
            setCategoryId(next);
            setPicker(null);
          }}
        />
        <AccountPickerSheet
          overlay
          visible={picker === 'account'}
          onClose={() => setPicker(null)}
          accounts={accounts}
          accountGroups={accountGroups}
          selectedAccountId={accountId}
          onSelect={(next) => {
            setAccountId(next);
            setPicker(null);
          }}
        />
      </View>
    </ThemeModal>
  );
}

function EditRow({
  label,
  value,
  icon,
  onPress,
  bordered = false,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  onPress: () => void;
  bordered?: boolean;
}) {
  const themeColors = useThemeColors();
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      className={cn(
        'min-h-[52px] flex-row items-center gap-2 px-4 active:opacity-70',
        bordered ? 'border-b border-border/30' : '',
      )}
    >
      <Text variant="body" tone="muted" className="flex-1">
        {label}
      </Text>
      {icon}
      <Text variant="body" numberOfLines={1} className="max-w-[60%]">
        {value}
      </Text>
      <ChevronRight size={16} color={themeColors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheetShell: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  headerWrap: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  content: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
});
