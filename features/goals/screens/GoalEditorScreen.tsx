import { ChevronRight, Trash2 } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DatePickerModal } from '~/components/datePicker';
import {
  AccountPickerSheet,
  CategoryEmoji,
  CurrencyPickerSheet,
  FormScrollView,
  Input,
  SettingsActionBar,
  SettingsHeader,
  Text,
} from '~/components/ui';
import { CATEGORY_ICON_PICKER_VALUES } from '~/constants/categoryIcons';
import { useApp, useTransactions } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { suggestCategoryEmoji } from '~/utils/categoryEmojiMatcher';
import { convert, currencySymbolForCode } from '~/utils/currency';
import { dayKeyFromDateLocal, formatRelativeDate } from '~/utils/formatters';

interface GoalEditorScreenProps {
  accountId?: string;
  onClose: () => void;
}

const SCROLL_CONTENT = { padding: 20, paddingBottom: 40 } as const;

type AutoSaveCadence = 'monthly' | 'weekly';

function nextRunDateFor(cadence: AutoSaveCadence): string {
  const now = new Date();
  if (cadence === 'weekly') {
    return dayKeyFromDateLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  }
  // Clamp to the next month's last day (the recurring engine's addMonths does
  // the same); an unclamped Jan 31 would roll to Mar 3 and skip February.
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(now.getDate(), lastDay));
  return dayKeyFromDateLocal(next);
}

export function GoalEditorScreen({ accountId, onClose }: GoalEditorScreenProps) {
  const {
    accounts,
    settings,
    fxCurrencies,
    rateTable,
    accountGroups,
    createAccount,
    updateAccount,
    changeAccountCurrency,
    deleteAccount,
    createRecurringRule,
  } = useApp();
  const { accountBalances } = useTransactions();
  const themeColors = useThemeColors();

  const existing = useMemo(
    () => accounts.find((a) => a.id === accountId && a.type === 'goal') ?? null,
    [accountId, accounts],
  );
  const isEditing = existing != null;

  const [name, setName] = useState(existing?.name ?? '');
  const [emoji, setEmoji] = useState<string>(existing?.goalEmoji ?? '');
  const [emojiManuallyPicked, setEmojiManuallyPicked] = useState(isEditing);
  const [target, setTarget] = useState(
    existing?.goalTargetAmount != null ? String(existing.goalTargetAmount) : '',
  );
  const [currency, setCurrency] = useState(existing?.currency ?? settings.currencyCode);
  const [hasTargetDate, setHasTargetDate] = useState(existing?.goalTargetDate != null);
  const [targetDate, setTargetDate] = useState(
    existing?.goalTargetDate ?? dayKeyFromDateLocal(new Date()),
  );
  const [startingAmount, setStartingAmount] = useState('');
  const [includeInTotals, setIncludeInTotals] = useState(existing?.includeInTotals ?? true);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [autoSaveAmount, setAutoSaveAmount] = useState('');
  const [autoSaveCadence, setAutoSaveCadence] = useState<AutoSaveCadence>('monthly');
  const [autoSaveSourceId, setAutoSaveSourceId] = useState<string | null>(null);

  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!emojiManuallyPicked) {
        const suggested = suggestCategoryEmoji(value);
        if (suggested) setEmoji(suggested);
      }
    },
    [emojiManuallyPicked],
  );

  const currencySymbol = currencySymbolForCode(currency);
  const parsedTarget = Number.parseFloat(target);
  const parsedStarting = Number.parseFloat(startingAmount);
  const parsedAutoSave = Number.parseFloat(autoSaveAmount);
  const todayKey = dayKeyFromDateLocal(new Date());
  const targetDateValid = !hasTargetDate || targetDate > todayKey;
  const autoSaveValid =
    !autoSaveEnabled ||
    (Number.isFinite(parsedAutoSave) && parsedAutoSave > 0 && autoSaveSourceId != null);
  const canSave =
    name.trim().length > 0 &&
    Number.isFinite(parsedTarget) &&
    parsedTarget > 0 &&
    targetDateValid &&
    autoSaveValid;

  const currencyCodes = useMemo(
    () => Array.from(new Set([settings.currencyCode, ...fxCurrencies, currency])),
    [settings.currencyCode, fxCurrencies, currency],
  );

  // Inline auto-save keeps v1 simple: only accounts already denominated in the
  // goal's currency can feed it. Cross-currency rules stay possible through
  // the full recurring editor.
  const autoSaveSourceAccounts = useMemo(
    () => accounts.filter((a) => a.type !== 'goal' && a.currency === currency),
    [accounts, currency],
  );
  const autoSaveSource = autoSaveSourceAccounts.find((a) => a.id === autoSaveSourceId) ?? null;

  const handleSave = useCallback(() => {
    if (!canSave) return;
    void triggerHaptic('success');
    const trimmedName = name.trim();
    const goalFields = {
      goalTargetAmount: parsedTarget,
      goalTargetDate: hasTargetDate ? targetDate : null,
      goalEmoji: emoji.trim() || null,
    };

    if (isEditing && existing) {
      // The target input always shows (and parses) the currently selected
      // currency: picking a new currency converts the field in place, so the
      // typed value is saved verbatim. On a currency change the balance is
      // still native to the old currency here, so compare in the new units.
      const balance =
        accountBalances.find((b) => b.accountId === existing.id)?.balance ??
        existing.startingBalance;
      const currencyChanged = currency !== existing.currency;
      const balanceInSelected = currencyChanged
        ? convert(balance, existing.currency, currency, rateTable).value
        : balance;
      // Raising the target back above the saved balance revives the goal:
      // clear the achievement stamp so the celebration can fire again.
      const clearsAchievement = existing.goalAchievedAt != null && parsedTarget > balanceInSelected;
      const updates = {
        name: trimmedName,
        includeInTotals,
        ...goalFields,
        ...(clearsAchievement ? { goalAchievedAt: null } : {}),
      };
      if (currencyChanged) {
        changeAccountCurrency(existing.id, currency, updates);
      } else {
        updateAccount(existing.id, updates);
      }
      void trackEvent(AnalyticsEvents.GOAL_UPDATED);
    } else {
      const id = createAccount({
        name: trimmedName,
        type: 'goal',
        accountGroup: null,
        logoId: null,
        creditStatementDay: null,
        creditDueDay: null,
        currency,
        startingBalance: Number.isFinite(parsedStarting) ? parsedStarting : 0,
        includeInTotals,
        ...goalFields,
      });
      if (autoSaveEnabled && autoSaveSourceId && Number.isFinite(parsedAutoSave)) {
        createRecurringRule({
          name: I18n.t('goals.auto_save_rule_name', { name: trimmedName }),
          type: 'transfer',
          amount: parsedAutoSave,
          currency,
          fromAccountId: autoSaveSourceId,
          toAccountId: id,
          recurrencePattern: autoSaveCadence,
          recurrenceInterval: 1,
          nextRunDate: nextRunDateFor(autoSaveCadence),
        });
      }
      void trackEvent(AnalyticsEvents.GOAL_CREATED, {
        hasTargetDate,
        hasAutoSave: autoSaveEnabled,
      });
    }
    onClose();
  }, [
    accountBalances,
    autoSaveCadence,
    autoSaveEnabled,
    autoSaveSourceId,
    canSave,
    changeAccountCurrency,
    createAccount,
    createRecurringRule,
    currency,
    emoji,
    existing,
    hasTargetDate,
    isEditing,
    name,
    onClose,
    parsedAutoSave,
    includeInTotals,
    parsedStarting,
    parsedTarget,
    rateTable,
    targetDate,
    updateAccount,
  ]);

  const handleDelete = useCallback(() => {
    if (!existing) return;
    void triggerHaptic('warning');
    Alert.alert(I18n.t('goals.delete_title'), I18n.t('goals.delete_message'), [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: I18n.t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteAccount(existing.id);
          onClose();
        },
      },
    ]);
  }, [deleteAccount, existing, onClose]);

  const emojiChoices =
    emoji && !CATEGORY_ICON_PICKER_VALUES.includes(emoji)
      ? [emoji, ...CATEGORY_ICON_PICKER_VALUES]
      : CATEGORY_ICON_PICKER_VALUES;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5">
        <SettingsHeader
          className="px-0 pt-5 pb-3"
          onBack={onClose}
          title={isEditing ? I18n.t('goals.edit_title') : I18n.t('goals.new_goal')}
          rightAccessory={
            isEditing ? (
              <Pressable
                onPress={handleDelete}
                hitSlop={8}
                className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.delete')}
              >
                <Trash2 size={18} color={themeColors.coral} />
              </Pressable>
            ) : undefined
          }
        />
      </View>

      <FormScrollView contentContainerStyle={SCROLL_CONTENT}>
        <View className="gap-4">
          <Input
            label={I18n.t('goals.name_label')}
            value={name}
            onChangeText={handleNameChange}
            placeholder={I18n.t('goals.name_placeholder')}
          />

          {/* Emoji: the same chip picker the category editor uses. */}
          <View>
            <Text variant="label" tone="muted" className="mb-2">
              {I18n.t('categories.emoji')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {emojiChoices.map((choice) => (
                <Pressable
                  key={choice}
                  onPress={() => {
                    void triggerHaptic('selection');
                    setEmojiManuallyPicked(true);
                    setEmoji(choice);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${I18n.t('categories.emoji')} ${choice}`}
                  accessibilityState={{ selected: emoji === choice }}
                  className={cn(
                    'h-11 w-11 items-center justify-center rounded-full border',
                    emoji === choice
                      ? 'bg-primary/15 border-primary/50'
                      : 'bg-card border-border/40',
                  )}
                >
                  <CategoryEmoji
                    icon={choice}
                    className={cn(emoji === choice ? '' : 'opacity-80')}
                  />
                </Pressable>
              ))}
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input
                label={I18n.t('goals.target_label')}
                variant="currency"
                currencySymbol={currencySymbol}
                value={target}
                onChangeText={setTarget}
                placeholder="0.00"
              />
            </View>
            <View className="w-[110px]">
              <Text variant="label" tone="muted" className="mb-2.5 px-1">
                {I18n.t('items.currency_label')}
              </Text>
              <Pressable
                onPress={() => setShowCurrencyPicker(true)}
                className="h-[54px] flex-row items-center justify-between rounded-[22px] border border-border/30 bg-secondary/30 px-3"
              >
                <Text variant="body">{currency}</Text>
                <ChevronRight size={16} color={themeColors.textMuted} />
              </Pressable>
            </View>
          </View>

          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text variant="body">{I18n.t('goals.target_date_toggle')}</Text>
              <Text variant="caption" tone="muted" className="mt-0.5">
                {I18n.t('goals.target_date_hint')}
              </Text>
            </View>
            <Switch
              value={hasTargetDate}
              onValueChange={(v) => {
                void triggerHaptic('selection');
                setHasTargetDate(v);
              }}
              trackColor={{ true: themeColors.primary }}
            />
          </View>

          {hasTargetDate ? (
            <View className="gap-1.5">
              <Pressable
                onPress={() => setShowDatePicker(true)}
                className="flex-row items-center justify-between rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3"
              >
                <Text variant="body">{formatRelativeDate(targetDate, settings.locale)}</Text>
                <ChevronRight size={16} color={themeColors.textMuted} />
              </Pressable>
              {!targetDateValid ? (
                <Text variant="caption" tone="error">
                  {I18n.t('goals.target_date_past_error')}
                </Text>
              ) : null}
            </View>
          ) : null}

          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1">
              <Text variant="body">{I18n.t('accounts.include_in_totals')}</Text>
              <Text variant="caption" tone="muted" className="mt-0.5">
                {I18n.t('accounts.include_in_totals_hint')}
              </Text>
            </View>
            <Switch
              value={includeInTotals}
              onValueChange={(v) => {
                void triggerHaptic('selection');
                setIncludeInTotals(v);
              }}
              trackColor={{ true: themeColors.primary }}
            />
          </View>

          {!isEditing ? (
            <>
              <Input
                label={I18n.t('goals.starting_amount_label')}
                variant="currency"
                currencySymbol={currencySymbol}
                value={startingAmount}
                onChangeText={setStartingAmount}
                placeholder="0.00"
              />

              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text variant="body">{I18n.t('goals.auto_save_toggle')}</Text>
                  <Text variant="caption" tone="muted" className="mt-0.5">
                    {I18n.t('goals.auto_save_hint')}
                  </Text>
                </View>
                <Switch
                  value={autoSaveEnabled}
                  onValueChange={(v) => {
                    void triggerHaptic('selection');
                    setAutoSaveEnabled(v);
                  }}
                  trackColor={{ true: themeColors.primary }}
                />
              </View>

              {autoSaveEnabled ? (
                <View className="gap-4">
                  <View className="flex-row gap-3">
                    <View className="flex-1">
                      <Input
                        label={I18n.t('goals.auto_save_amount_label')}
                        variant="currency"
                        currencySymbol={currencySymbol}
                        value={autoSaveAmount}
                        onChangeText={setAutoSaveAmount}
                        placeholder="0.00"
                      />
                    </View>
                    <View className="w-[150px]">
                      <Text variant="label" tone="muted" className="mb-2.5 px-1">
                        {I18n.t('goals.auto_save_cadence_label')}
                      </Text>
                      <View className="h-[54px] flex-row overflow-hidden rounded-[22px] border border-border/30">
                        {(['monthly', 'weekly'] as const).map((cadence) => (
                          <Pressable
                            key={cadence}
                            onPress={() => {
                              void triggerHaptic('selection');
                              setAutoSaveCadence(cadence);
                            }}
                            accessibilityRole="button"
                            accessibilityState={{ selected: autoSaveCadence === cadence }}
                            className={cn(
                              'flex-1 items-center justify-center',
                              autoSaveCadence === cadence ? 'bg-primary/15' : 'bg-secondary/30',
                            )}
                          >
                            <Text
                              variant="caption"
                              className={
                                autoSaveCadence === cadence
                                  ? 'text-primary'
                                  : 'text-muted-foreground'
                              }
                            >
                              {I18n.t(`goals.cadence_${cadence}`)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </View>

                  <View className="gap-1.5">
                    <Text variant="label" tone="muted">
                      {I18n.t('goals.auto_save_source_label')}
                    </Text>
                    <Pressable
                      onPress={() => setShowSourcePicker(true)}
                      className="flex-row items-center justify-between rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3"
                    >
                      <Text variant="body" tone={autoSaveSource ? 'default' : 'muted'}>
                        {autoSaveSource?.name ?? I18n.t('goals.auto_save_source_placeholder')}
                      </Text>
                      <ChevronRight size={16} color={themeColors.textMuted} />
                    </Pressable>
                    {autoSaveSourceAccounts.length === 0 ? (
                      <Text variant="caption" tone="muted">
                        {I18n.t('goals.auto_save_no_source', { currency })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      </FormScrollView>

      <SettingsActionBar onCancel={onClose} onSave={handleSave} saveDisabled={!canSave} />

      <CurrencyPickerSheet
        visible={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        selectedCode={currency}
        restrictToCodes={currencyCodes}
        onSelect={(code) => {
          if (code !== currency) {
            // Convert the visible inputs in place (the account editor's
            // balance pattern) so what the user sees next to the new symbol
            // is what gets saved, with no hidden save-time conversion.
            const convertField = (raw: string, set: (v: string) => void) => {
              const parsed = Number.parseFloat(raw);
              if (Number.isFinite(parsed) && parsed > 0) {
                set(String(convert(parsed, currency, code, rateTable).value));
              }
            };
            convertField(target, setTarget);
            if (!isEditing) {
              convertField(startingAmount, setStartingAmount);
              convertField(autoSaveAmount, setAutoSaveAmount);
            }
          }
          setCurrency(code);
          setAutoSaveSourceId(null);
          setShowCurrencyPicker(false);
        }}
      />
      <DatePickerModal
        visible={showDatePicker}
        value={targetDate}
        title={I18n.t('goals.target_date_toggle')}
        onSelect={(date) => {
          setTargetDate(date);
          setShowDatePicker(false);
        }}
        onClose={() => setShowDatePicker(false)}
      />
      <AccountPickerSheet
        visible={showSourcePicker}
        onClose={() => setShowSourcePicker(false)}
        accounts={autoSaveSourceAccounts}
        accountGroups={accountGroups}
        selectedAccountId={autoSaveSourceId}
        onSelect={(id) => {
          setAutoSaveSourceId(id);
          setShowSourcePicker(false);
        }}
      />
    </SafeAreaView>
  );
}
