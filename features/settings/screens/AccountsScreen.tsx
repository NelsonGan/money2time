import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  GripVertical,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Wallet,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import type { AnimatedRef } from 'react-native-reanimated';
import Animated, { useAnimatedRef } from 'react-native-reanimated';
import { type Edge, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

import { DatePickerModal } from '~/components/datePicker';
import { EmptyState } from '~/components/feedback/EmptyState';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { EdgeSwipeBackContainer } from '~/components/navigation/EdgeSwipeBackContainer';
import { MonthControlsHeader } from '~/components/navigation/MonthControlsHeader';
import {
  AccountLogo,
  AccountLogoPickerSheet,
  AccountPickerSheet,
  Button,
  CategoryEmoji,
  CurrencyPickerSheet,
  Input,
  SelectField,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsActionBar,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  ThemeModal,
  TimeValueInline,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { getAccountLogoMeta } from '~/constants/accountLogos';
import { ACCOUNT_TYPE_OPTIONS, DEFAULT_CURRENCY } from '~/constants/appDefaults';
import { convert, currencyNameForCode, currencySymbolForCode } from '~/utils/currency';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { AccountCardStack } from '~/features/settings/components/AccountCardStack';
import { ActivityTransactionList } from '~/features/transactions/components';
import {
  MONTH_PAGER_CENTER_INDEX,
  MONTH_PAGER_TOTAL_SLOTS,
} from '~/features/transactions/constants/monthPager';
import { MONTH_PAGER_LIST_CONFIG } from '~/features/transactions/constants/monthPagerList';
import { AddTransactionScreen, EditTransactionScreen } from '~/features/transactions/screens';
import { useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useIndexedScrollToTopRefs } from '~/hooks/useIndexedScrollToTopRefs';
import { useMonthPager } from '~/hooks/useMonthPager';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import {
  type Account,
  type AccountGroup,
  type AccountType,
  type TransactionWithRelations,
} from '~/types';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';
import {
  addMonthsAtMonthStart,
  formatAmount,
  formatDateInput,
  formatMonthYearLabel,
  monthKeyFromDateLocal,
  normalizeMoneyAmount,
  startOfMonthDate,
} from '~/utils/formatters';
import {
  bucketTransactionsByAccountPeriod,
  DAY_IN_MS,
  formatStatementRangeSublabel,
  getCurrentStatementCycleStart,
  statementPeriodFromAnchor,
} from '~/utils/statementPeriods';

interface AccountGroupSection {
  id: string;
  label: string;
  accounts: Account[];
}

interface AccountEditorInput {
  name: string;
  type: AccountType;
  accountGroup: string | null;
  logoId: string | null;
  creditStatementDay: number | null;
  creditDueDay: number | null;
  includeInTotals: boolean;
  startingBalance: number;
  currency: string;
}

interface CreditSummary {
  payable: number;
  outstanding: number;
}

const ACCOUNT_EDITOR_SCROLL_CONTENT_STYLE = {
  paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
} as const;
const ACCOUNT_MANAGEMENT_LIST_CONTENT_STYLE = {
  paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
} as const;
const ACCOUNT_BULK_SCROLL_CONTENT_STYLE = {
  padding: SETTINGS_HORIZONTAL_PADDING,
  paddingBottom: SETTINGS_LIST_BOTTOM_PADDING + spacing.xs,
  gap: spacing.sm,
} as const;
const FLOATING_ACTION_SIZE = 56;
const FLOATING_ACTION_GAP = 12;
const MASKED_BALANCE_VALUE = '••••';
const EMPTY_PERIOD_TRANSACTIONS: TransactionWithRelations[] = [];
const DEFAULT_CREDIT_STATEMENT_DAY = 25;

type AccountsSummaryRenderValue = (
  amount: number,
  options?: {
    variant?: React.ComponentProps<typeof Text>['variant'];
    tone?: React.ComponentProps<typeof Text>['tone'];
    textClassName?: string;
    iconColor?: string;
  },
) => React.ReactNode;

type AccountsSummaryThemeColors = {
  success: string;
  error: string;
  primary: string;
  text: string;
};

function AccountsSummaryBlock({
  assets,
  debt,
  net,
  themeColors,
  renderValue,
  onPressNetAssets,
}: {
  assets: number;
  debt: number;
  net: number;
  themeColors: AccountsSummaryThemeColors;
  renderValue: AccountsSummaryRenderValue;
  onPressNetAssets?: () => void;
}) {
  const netIsNegative = net < 0;
  // Positive/zero net uses the neutral foreground tone instead of the user's
  // theme accent — the net-assets readout is a factual number, not a brand
  // moment, and the foreground reads consistently across all theme colors.
  // Negative net keeps destructive red as a clear bad signal.
  const netAccent = netIsNegative ? themeColors.error : themeColors.text;
  const netLabelClass = netIsNegative ? 'text-destructive' : 'text-foreground';
  const netValueClass = netIsNegative ? 'text-destructive' : 'text-foreground';

  return (
    <View className="w-full overflow-hidden rounded-2xl border border-border/45 bg-card">
      {/* Decorative accent blob */}
      <View
        pointerEvents="none"
        className="absolute -top-8 -right-8 h-28 w-28 rounded-full"
        style={{ backgroundColor: netAccent, opacity: 0.1 }}
      />

      {/* Hero: Net Assets */}
      <Pressable
        onPress={
          onPressNetAssets
            ? () => {
                void triggerHaptic('selection');
                onPressNetAssets();
              }
            : undefined
        }
        disabled={!onPressNetAssets}
        className="px-4 pt-3.5 pb-3 active:opacity-85"
        accessibilityRole={onPressNetAssets ? 'button' : undefined}
        accessibilityLabel={I18n.t('accounts.net_assets')}
      >
        <View className="flex-row items-center gap-1.5">
          <Wallet size={12} color={netAccent} strokeWidth={2.4} />
          <Text variant="label" className={cn('text-[10px]', netLabelClass)}>
            {I18n.t('accounts.net_assets')}
          </Text>
          {onPressNetAssets ? <ChevronRight size={12} color={netAccent} strokeWidth={2.4} /> : null}
        </View>
        <View className="mt-1.5">
          {renderValue(net, {
            variant: 'monoLg',
            textClassName: netValueClass,
            iconColor: netAccent,
          })}
        </View>
      </Pressable>

      {/* Divider */}
      <View className="h-px bg-border/40" />

      {/* Footer: Assets / Debt side-by-side */}
      <View className="flex-row">
        <View className="flex-1 px-4 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <ArrowUpRight size={12} color={themeColors.success} strokeWidth={2.4} />
            <Text variant="label" className="text-[10px] text-success">
              {I18n.t('accounts.assets')}
            </Text>
          </View>
          <View className="mt-1">
            {renderValue(assets, {
              variant: 'mono',
              textClassName: 'text-success',
              iconColor: themeColors.success,
            })}
          </View>
        </View>
        <View className="w-px bg-border/40" />
        <View className="flex-1 px-4 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <ArrowDownRight size={12} color={themeColors.error} strokeWidth={2.4} />
            <Text variant="label" className="text-[10px] text-destructive">
              {I18n.t('accounts.debt')}
            </Text>
          </View>
          <View className="mt-1">
            {renderValue(debt, {
              variant: 'mono',
              textClassName: 'text-destructive',
              iconColor: themeColors.error,
            })}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowTypePill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowTypeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  groupCard: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 3,
    },
    elevation: 2,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingLeft: spacing.xs,
    paddingRight: spacing.sm,
    gap: spacing.xs,
  },
  groupChevron: {
    width: 28,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupNamePressable: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
    paddingLeft: 2,
  },
  groupName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  groupCircleButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupHandle: {
    width: 30,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  groupEditStack: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  groupEditActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  accountsPanel: {
    marginTop: 2,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  accountChildRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: spacing.xs,
    paddingLeft: 2,
    paddingRight: spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    gap: spacing.xs,
  },
  accountChildHandle: {
    width: 26,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  accountChildBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 40,
  },
  accountChildTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  accountChildName: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  accountChildSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  accountsEmptyText: {
    fontSize: 12,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  staticCardsStack: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  headerContainer: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  headerSpacer: {
    height: spacing.xs,
  },
  flexContainer: {
    flex: 1,
  },
  floatingAddButtonContainer: {
    position: 'absolute',
    right: SETTINGS_HORIZONTAL_PADDING,
    zIndex: 25,
  },
  floatingButtonStack: {
    alignItems: 'center',
    gap: FLOATING_ACTION_GAP,
  },
  floatingAddButton: {
    width: FLOATING_ACTION_SIZE,
    height: FLOATING_ACTION_SIZE,
    borderRadius: FLOATING_ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 5,
    },
    elevation: 6,
  },
});

function toBalanceInputValue(value: number) {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 100) / 100;
  if (Object.is(rounded, -0)) return '0';
  return String(rounded);
}

function AccountEditorSheet({
  visible,
  account,
  presetGroupName = null,
  currentBalance,
  defaultCurrencyCode: propDefaultCurrencyCode,
  accountGroups,
  onClose,
  onSave,
  onDelete,
  onOpenMultiCurrency,
}: {
  visible: boolean;
  account: Account | null;
  presetGroupName?: string | null;
  currentBalance: number;
  defaultCurrencyCode: string;
  accountGroups: AccountGroup[];
  onClose: () => void;
  onSave: (input: AccountEditorInput) => void;
  onDelete?: () => void;
  onOpenMultiCurrency?: () => void;
}) {
  const themeColors = useThemeColors();
  const isEdit = account !== null;
  const defaultCurrencyCode = propDefaultCurrencyCode || DEFAULT_CURRENCY;

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('debit');
  const [accountGroupId, setAccountGroupId] = useState<string>('none');
  const [logoId, setLogoId] = useState<string | null>(null);
  const [showLogoPicker, setShowLogoPicker] = useState(false);
  const [includeInTotals, setIncludeInTotals] = useState(true);
  const [balanceInput, setBalanceInput] = useState('0');
  const [creditStatementDay, setCreditStatementDay] = useState('25');
  const [creditDueDay, setCreditDueDay] = useState('1');
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const { settings: appSettings, accounts: appAccounts, fxCurrencies, rateTable } = useApp();
  // Account currency choices = the main currency + the user's subcurrencies
  // (added ones plus any already used by an account).
  const accountCurrencyCodes = useMemo(() => {
    const set = new Set<string>([appSettings.currencyCode, ...fxCurrencies, currency]);
    for (const a of appAccounts) {
      if (a.currency) set.add(a.currency);
    }
    return Array.from(set);
  }, [appSettings.currencyCode, appAccounts, fxCurrencies, currency]);

  // Switching the currency previews the converted balance so the user sees the
  // result before saving (the same rate is applied for real on save).
  const handleCurrencyChange = useCallback(
    (nextCurrency: string) => {
      if (nextCurrency === currency) return;
      const parsed = Number(balanceInput);
      if (Number.isFinite(parsed) && parsed !== 0) {
        const { value } = convert(parsed, currency, nextCurrency, rateTable);
        setBalanceInput(toBalanceInputValue(value));
      }
      setCurrency(nextCurrency);
    },
    [balanceInput, currency, rateTable],
  );

  const accountGroupNameById = useMemo(
    () => new Map(accountGroups.map((group) => [group.id, group.name])),
    [accountGroups],
  );
  const accountGroupIdByName = useMemo(
    () => new Map(accountGroups.map((group) => [group.name, group.id])),
    [accountGroups],
  );
  const accountGroupOptions = useMemo(
    () => [
      { value: 'none', label: I18n.t('common.ungrouped') },
      ...accountGroups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [accountGroups],
  );

  useEffect(() => {
    if (account) {
      setName(account.name);
      setType(account.type);
      setLogoId(account.logoId ?? null);
      const matchedGroupId = account.accountGroup
        ? (accountGroupIdByName.get(account.accountGroup) ?? 'none')
        : 'none';
      setAccountGroupId(matchedGroupId);
      setIncludeInTotals(account.includeInTotals);
      setBalanceInput(toBalanceInputValue(currentBalance));
      setCreditStatementDay(String(account.creditStatementDay ?? '25'));
      setCreditDueDay(String(account.creditDueDay ?? '1'));
      setCurrency(account.currency || DEFAULT_CURRENCY);
    } else {
      setName('');
      setType('debit');
      setLogoId(null);
      setAccountGroupId(
        presetGroupName ? (accountGroupIdByName.get(presetGroupName) ?? 'none') : 'none',
      );
      setIncludeInTotals(true);
      setBalanceInput('0');
      setCreditStatementDay('25');
      setCreditDueDay('1');
      setCurrency(defaultCurrencyCode);
    }
  }, [
    account,
    accountGroupIdByName,
    currentBalance,
    defaultCurrencyCode,
    presetGroupName,
    visible,
  ]);

  const logoMeta = getAccountLogoMeta(logoId);
  const normalizedName = name.trim();
  const parsedBalance = Number(balanceInput);
  const hasValidBalance = balanceInput.trim().length > 0 && Number.isFinite(parsedBalance);
  const canSave = normalizedName.length > 0 && hasValidBalance;

  const handleSave = () => {
    if (!canSave || !Number.isFinite(parsedBalance)) return;
    const parsedStatementDay = Number(creditStatementDay);
    const parsedDueDay = Number(creditDueDay);
    const resolvedType = isEdit ? account.type : type;
    const normalizedStatementDay =
      Number.isInteger(parsedStatementDay) && parsedStatementDay >= 1 && parsedStatementDay <= 31
        ? parsedStatementDay
        : null;
    const normalizedDueDay =
      Number.isInteger(parsedDueDay) && parsedDueDay >= 1 && parsedDueDay <= 31
        ? parsedDueDay
        : null;

    onSave({
      name: normalizedName,
      type: resolvedType,
      logoId,
      accountGroup:
        accountGroupId === 'none' ? null : (accountGroupNameById.get(accountGroupId) ?? null),
      creditStatementDay: resolvedType === 'credit' ? normalizedStatementDay : null,
      creditDueDay: resolvedType === 'credit' ? normalizedDueDay : null,
      includeInTotals,
      startingBalance: parsedBalance,
      currency,
    });
  };

  const handleDelete = () => {
    if (!onDelete) return;
    Alert.alert(I18n.t('accounts.delete_account'), I18n.t('accounts.delete_account_confirm'), [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: I18n.t('common.delete'),
        style: 'destructive',
        onPress: () => {
          void triggerHaptic('warning');
          onDelete();
        },
      },
    ]);
  };

  return (
    <ThemeModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-background">
        <SettingsHeader
          className="px-5 pt-5 pb-2"
          title={isEdit ? I18n.t('accounts.edit_account') : I18n.t('accounts.new_account')}
          onClose={onClose}
          closeRowAccessory={
            isEdit && onDelete ? (
              <Pressable
                onPress={handleDelete}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('accounts.delete_account')}
                className="h-10 w-10 items-center justify-center rounded-full bg-destructive/10"
              >
                <Trash2 size={18} color={themeColors.error} />
              </Pressable>
            ) : undefined
          }
        />

        <ScrollView
          contentContainerStyle={ACCOUNT_EDITOR_SCROLL_CONTENT_STYLE}
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4">
            <Input
              label={I18n.t('accounts.account_name')}
              value={name}
              onChangeText={setName}
              placeholder={I18n.t('accounts.account_name_placeholder')}
            />
            <View>
              <Text variant="label" tone="muted" className="mb-2">
                {I18n.t('accounts.logo.label')}
              </Text>
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  setShowLogoPicker(true);
                }}
                className="flex-row items-center gap-3 rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3"
                accessibilityRole="button"
                accessibilityLabel={I18n.t('accounts.logo.label')}
              >
                <AccountLogo logoId={logoId} type={isEdit ? account.type : type} size={36} />
                <Text
                  variant="body"
                  tone={logoMeta ? undefined : 'muted'}
                  numberOfLines={1}
                  className="flex-1"
                >
                  {logoMeta ? logoMeta.name : I18n.t('accounts.logo.add')}
                </Text>
                {logoId ? (
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      setLogoId(null);
                    }}
                    hitSlop={10}
                    className="h-7 w-7 items-center justify-center rounded-full bg-secondary/70"
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('accounts.logo.clear')}
                  >
                    <X size={14} color={themeColors.textMuted} />
                  </Pressable>
                ) : (
                  <ChevronRight size={16} color={themeColors.textMuted} />
                )}
              </Pressable>
            </View>
            <SelectField
              label={I18n.t('accounts.account_group')}
              value={accountGroupId}
              onChange={setAccountGroupId}
              options={accountGroupOptions}
            />
            <View>
              <Text variant="label" tone="muted" className="mb-2">
                {I18n.t('accounts.currency')}
              </Text>
              <Pressable
                onPress={() => setShowCurrencyPicker(true)}
                className="flex-row items-center justify-between rounded-2xl border border-border/40 bg-card px-4 py-3.5"
              >
                <Text variant="body">
                  {currency} · {currencyNameForCode(currency)}
                </Text>
                <ChevronRight size={16} color={themeColors.textMuted} />
              </Pressable>
            </View>
            <View>
              <Text variant="label" tone="muted" className="mb-2">
                {I18n.t('accounts.type')}
              </Text>
              {isEdit ? (
                <View className="flex-row flex-wrap gap-2">
                  {ACCOUNT_TYPE_OPTIONS.filter((item) => item.value === account.type).map(
                    (item) => (
                      <View
                        key={item.value}
                        className="flex-row items-center gap-1.5 px-4 py-2.5 rounded-full border bg-primary/15 border-primary/50"
                      >
                        <CategoryEmoji
                          icon={item.value === 'credit' ? 'credit-card' : 'bank'}
                          size={16}
                        />
                        <Text variant="caption" className="text-primary">
                          {item.label}
                        </Text>
                      </View>
                    ),
                  )}
                </View>
              ) : (
                <View className="flex-row flex-wrap gap-2">
                  {ACCOUNT_TYPE_OPTIONS.map((item) => (
                    <Pressable
                      key={item.value}
                      onPress={() => {
                        void triggerHaptic('selection');
                        setType(item.value);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                      accessibilityState={{ selected: type === item.value }}
                      className={cn(
                        'flex-row items-center gap-1.5 px-4 py-2.5 rounded-full border',
                        type === item.value
                          ? 'bg-primary/15 border-primary/50'
                          : 'bg-card border-border/40',
                      )}
                    >
                      <CategoryEmoji
                        icon={item.value === 'credit' ? 'credit-card' : 'bank'}
                        size={16}
                      />
                      <Text
                        variant="caption"
                        className={cn(
                          type === item.value ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            {(isEdit ? account.type : type) === 'credit' ? (
              <View className="flex-row gap-2">
                <View className="flex-1">
                  <Input
                    label={I18n.t('accounts.statement_day')}
                    variant="numeric"
                    value={creditStatementDay}
                    onChangeText={setCreditStatementDay}
                    placeholder="25"
                  />
                </View>
                <View className="flex-1">
                  <Input
                    label={I18n.t('accounts.due_day')}
                    variant="numeric"
                    value={creditDueDay}
                    onChangeText={setCreditDueDay}
                    placeholder="1"
                  />
                </View>
              </View>
            ) : null}

            <Input
              label={
                isEdit ? I18n.t('accounts.current_balance') : I18n.t('accounts.starting_balance')
              }
              variant="currency"
              currencySymbol={currencySymbolForCode(currency)}
              value={balanceInput}
              onChangeText={setBalanceInput}
              helperText={isEdit ? I18n.t('accounts.current_balance_hint') : undefined}
            />

            <View className="flex-row items-center justify-between">
              <Text variant="label" tone="muted">
                {I18n.t('accounts.include_in_totals')}
              </Text>
              <Switch
                value={includeInTotals}
                onValueChange={setIncludeInTotals}
                trackColor={{ false: `${themeColors.border}80`, true: themeColors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
          </View>
        </ScrollView>
        <SettingsActionBar onCancel={onClose} onSave={handleSave} saveDisabled={!canSave} />
      </SafeAreaView>
      <AccountLogoPickerSheet
        visible={showLogoPicker}
        onClose={() => setShowLogoPicker(false)}
        selectedLogoId={logoId}
        onSelect={setLogoId}
        onLimitReached={onClose}
      />
      <CurrencyPickerSheet
        visible={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        onSelect={handleCurrencyChange}
        selectedCode={currency}
        restrictToCodes={accountCurrencyCodes}
        title={I18n.t('accounts.currency')}
        footer={
          onOpenMultiCurrency ? (
            <Pressable
              onPress={() => {
                setShowCurrencyPicker(false);
                onClose();
                onOpenMultiCurrency();
              }}
              className="mt-1 flex-row items-center justify-center gap-1.5 rounded-2xl border border-primary/30 bg-primary/10 px-3 py-3 active:opacity-80"
            >
              <Plus size={16} color={themeColors.primary} />
              <Text variant="body" style={{ color: themeColors.primary }}>
                {I18n.t('exchange_rates.add_currency')}
              </Text>
            </Pressable>
          ) : null
        }
      />
    </ThemeModal>
  );
}

function creditDeltaForAccountTransaction(
  tx: {
    type: 'expense' | 'income' | 'transfer' | 'balance_adjustment';
    amount: number;
    accountId?: string | null;
    fromAccountId?: string | null;
    toAccountId?: string | null;
  },
  creditAccountId: string,
) {
  const isLegacyBalanceAdjustmentTransfer =
    tx.type === 'transfer' && !!tx.accountId && !tx.fromAccountId && !tx.toAccountId;
  if (tx.type === 'expense' && tx.accountId === creditAccountId) return tx.amount;
  if (tx.type === 'income' && tx.accountId === creditAccountId) return -tx.amount;
  if (tx.type === 'transfer' && tx.fromAccountId === creditAccountId) return tx.amount;
  if (tx.type === 'transfer' && tx.toAccountId === creditAccountId) return -tx.amount;
  if (
    (tx.type === 'balance_adjustment' || isLegacyBalanceAdjustmentTransfer) &&
    tx.accountId === creditAccountId
  ) {
    return tx.amount;
  }
  return 0;
}

function isCreditPaymentTransaction(
  tx: {
    type: 'expense' | 'income' | 'transfer' | 'balance_adjustment';
    toAccountId?: string | null;
  },
  creditAccountId: string,
) {
  return tx.type === 'transfer' && tx.toAccountId === creditAccountId;
}

function computeCreditCycleSummary(
  account: Account,
  txns: TransactionWithRelations[],
  balance: number,
  now: Date,
): CreditSummary {
  if (!account.creditStatementDay) {
    return { outstanding: Math.max(0, balance), payable: 0 };
  }
  const currentCycleStartIso = getCurrentStatementCycleStart(
    account.creditStatementDay,
    now,
  ).toISOString();
  let cycleDelta = 0;
  txns.forEach((tx) => {
    if (tx.date < currentCycleStartIso) return;
    // Credit-card payments should settle statement payable first.
    if (isCreditPaymentTransaction(tx, account.id)) return;
    cycleDelta += creditDeltaForAccountTransaction(tx, account.id);
  });
  const outstandingFromCycle = Math.max(0, cycleDelta);
  const cappedBalance = Math.max(0, balance);
  const outstanding = Math.min(outstandingFromCycle, cappedBalance);
  return { outstanding, payable: Math.max(0, cappedBalance - outstanding) };
}

function flowTypeForBalanceDelta(
  accountType: AccountType,
  delta: number,
): Extract<TransactionWithRelations['type'], 'income' | 'expense'> {
  if (accountType === 'credit') {
    return delta >= 0 ? 'expense' : 'income';
  }
  return delta >= 0 ? 'income' : 'expense';
}

function PayCreditCardSheet({
  visible,
  onClose,
  onSubmit,
  fromAccounts,
  accountGroups,
  currencySymbol,
  defaultAmount = 0,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: { fromAccountId: string; amount: number; note: string | null }) => void;
  fromAccounts: Account[];
  accountGroups: AccountGroup[];
  currencySymbol: string;
  defaultAmount?: number;
}) {
  const [fromAccountId, setFromAccountId] = useState<string | null>(fromAccounts[0]?.id ?? null);
  const [showFromAccountPicker, setShowFromAccountPicker] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState(I18n.t('accounts.credit_payment_note'));
  const themeColors = useThemeColors();
  const numericAmount = Number(amount);
  const canSave = !!fromAccountId && amount.trim().length > 0 && Number.isFinite(numericAmount);

  useEffect(() => {
    if (!visible) {
      setAmount('');
      return;
    }
    if (defaultAmount > 0) setAmount(defaultAmount.toFixed(2));
    if (fromAccounts.length === 0) {
      setFromAccountId(null);
      return;
    }
    if (!fromAccountId || !fromAccounts.some((account) => account.id === fromAccountId)) {
      setFromAccountId(fromAccounts[0].id);
    }
  }, [defaultAmount, fromAccountId, fromAccounts, visible]);

  const handleSave = () => {
    if (!canSave || !fromAccountId) return;
    onSubmit({ fromAccountId, amount: numericAmount, note: note.trim() || null });
    setAmount('');
  };

  return (
    <ThemeModal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-background">
        <SettingsHeader
          className="px-5 pt-5 pb-2"
          title={I18n.t('accounts.pay_credit_card')}
          onClose={onClose}
        />
        <ScrollView contentContainerStyle={ACCOUNT_EDITOR_SCROLL_CONTENT_STYLE}>
          <View className="gap-4">
            <View className="gap-2.5">
              <Text variant="caption" tone="muted">
                {I18n.t('accounts.pay_from')}
              </Text>
              <Pressable
                onPress={() => setShowFromAccountPicker(true)}
                className="rounded-2xl border border-border/30 bg-secondary/30 px-4 py-3 flex-row items-center justify-between"
              >
                <Text variant="body" tone={fromAccountId ? undefined : 'muted'}>
                  {fromAccountId
                    ? (fromAccounts.find((a) => a.id === fromAccountId)?.name ??
                      I18n.t('common.none'))
                    : I18n.t('common.none')}
                </Text>
                <ChevronRight size={16} color={themeColors.textMuted} />
              </Pressable>
            </View>
            <Input
              label={I18n.t('transactions.editor.amount')}
              variant="currency"
              currencySymbol={currencySymbol}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
            />
            <Input
              label={I18n.t('transaction_detail.note')}
              value={note}
              onChangeText={setNote}
              placeholder={I18n.t('accounts.payment_note_placeholder')}
            />
          </View>
        </ScrollView>
        <SettingsActionBar onCancel={onClose} onSave={handleSave} saveDisabled={!canSave} />
      </SafeAreaView>
      <AccountPickerSheet
        visible={showFromAccountPicker}
        onClose={() => setShowFromAccountPicker(false)}
        accounts={fromAccounts}
        accountGroups={accountGroups}
        selectedAccountId={fromAccountId}
        onSelect={(accountId) => {
          setFromAccountId(accountId);
          setShowFromAccountPicker(false);
        }}
      />
    </ThemeModal>
  );
}

// Module-level callbacks for Row — avoids hooks/closures inside renderItem
type AccountRowTheme = {
  accent: string;
  accentBorder: string;
  accentSoft: string;
  border: string;
  card: string;
  cardMuted: string;
  deleteBorder: string;
  deleteSurface: string;
  error: string;
  primary: string;
  primaryMuted: string;
  primarySoft: string;
  textMuted: string;
  textFaint: string;
  text: string;
};

// A parent row in the merged Accounts management list. Real groups are editable
// and draggable; `named` (a group name referenced by an account but with no
// matching group record) and `ungrouped` cards are static buckets.
type GroupCard =
  | { kind: 'group'; id: string; group: AccountGroup; label: string; accounts: Account[] }
  | { kind: 'named'; id: string; group: null; label: string; accounts: Account[] }
  | { kind: 'ungrouped'; id: string; group: null; label: string; accounts: Account[] };

function AccountChildRow({
  account,
  theme,
  width,
  creditLabel,
  onPress,
}: {
  account: Account;
  theme: AccountRowTheme;
  width: number;
  creditLabel: string;
  onPress: (account: Account) => void;
}) {
  const tc = theme;
  const isCredit = account.type === 'credit';
  const accountTypeLabel =
    ACCOUNT_TYPE_OPTIONS.find((option) => option.value === account.type)?.label ?? account.type;
  const accountVisibilityLabel = account.includeInTotals
    ? I18n.t('accounts.include_option_include')
    : I18n.t('accounts.include_option_hide');

  return (
    <View
      style={[styles.accountChildRow, { width, borderColor: tc.border, backgroundColor: tc.card }]}
    >
      <Sortable.Handle>
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={`${I18n.t('common.reorder')} ${account.name}`}
          style={styles.accountChildHandle}
        >
          <GripVertical size={15} color={tc.textFaint} />
        </View>
      </Sortable.Handle>
      <Pressable
        onPress={() => onPress(account)}
        style={styles.accountChildBody}
        accessibilityRole="button"
        accessibilityLabel={account.name}
      >
        <AccountLogo logoId={account.logoId} type={account.type} size={32} />
        <View style={styles.accountChildTextWrap}>
          <Text style={[styles.accountChildName, { color: tc.text }]} numberOfLines={1}>
            {account.name}
          </Text>
          <Text style={[styles.accountChildSubtitle, { color: tc.textMuted }]} numberOfLines={1}>
            {accountVisibilityLabel}
          </Text>
        </View>
        <View
          style={[
            styles.rowTypePill,
            {
              backgroundColor: isCredit ? tc.accentSoft : tc.primarySoft,
              borderColor: isCredit ? tc.accentBorder : tc.primaryMuted,
            },
          ]}
        >
          <Text style={[styles.rowTypeText, { color: isCredit ? tc.accent : tc.primary }]}>
            {isCredit ? creditLabel : accountTypeLabel}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

function GroupCollapsibleCard({
  card,
  theme,
  rowWidth,
  expanded,
  creditLabel,
  isEditing,
  editingName,
  scrollableRef,
  onToggle,
  onEditingNameChange,
  onSaveName,
  onCancelEdit,
  onStartEdit,
  onDelete,
  onAddAccount,
  onAccountPress,
  onReorderAccounts,
}: {
  card: GroupCard;
  theme: AccountRowTheme;
  rowWidth: number;
  expanded: boolean;
  creditLabel: string;
  isEditing: boolean;
  editingName: string;
  scrollableRef: AnimatedRef<Animated.ScrollView>;
  onToggle: (id: string) => void;
  onEditingNameChange: (value: string) => void;
  onSaveName: (groupId: string) => void;
  onCancelEdit: () => void;
  onStartEdit: (group: AccountGroup) => void;
  onDelete: (group: AccountGroup) => void;
  onAddAccount: (card: GroupCard) => void;
  onAccountPress: (account: Account) => void;
  onReorderAccounts: (sectionId: string, ordered: Account[]) => void;
}) {
  const tc = theme;
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;
  const editableGroup = card.kind === 'group' ? card.group : null;
  const accounts = card.accounts;
  // Child rows live inside a flex column that sizes items to content, so give
  // them an explicit width to span the card (minus the panel's side padding).
  const childWidth = Math.max(rowWidth - spacing.xs * 2, 0);

  return (
    <View
      style={[
        styles.groupCard,
        { width: rowWidth },
        {
          borderColor: expanded ? tc.primaryMuted : tc.border,
          backgroundColor: tc.card,
        },
      ]}
    >
      {isEditing && editableGroup ? (
        <View style={styles.groupEditStack}>
          <Input
            value={editingName}
            onChangeText={onEditingNameChange}
            placeholder={I18n.t('accounts.group_name')}
          />
          <View style={styles.groupEditActions}>
            <Button size="sm" className="flex-1" onPress={() => onSaveName(editableGroup.id)}>
              <Text>{I18n.t('common.save')}</Text>
            </Button>
            <Button size="sm" variant="secondary" className="flex-1" onPress={onCancelEdit}>
              <Text>{I18n.t('common.cancel')}</Text>
            </Button>
          </View>
        </View>
      ) : (
        <View style={styles.groupHeader}>
          <Pressable
            onPress={() => onToggle(card.id)}
            hitSlop={6}
            style={styles.groupChevron}
            accessibilityRole="button"
            accessibilityLabel={expanded ? I18n.t('accounts.collapse') : I18n.t('accounts.expand')}
            accessibilityState={{ expanded }}
          >
            <ChevronIcon size={18} color={expanded ? tc.primary : tc.textMuted} />
          </Pressable>
          {editableGroup ? (
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onStartEdit(editableGroup);
              }}
              style={styles.groupNamePressable}
              accessibilityRole="button"
              accessibilityLabel={card.label}
            >
              <Text style={[styles.groupName, { color: tc.text }]} numberOfLines={1}>
                {card.label}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.groupNamePressable}>
              <Text style={[styles.groupName, { color: tc.textMuted }]} numberOfLines={1}>
                {card.label}
              </Text>
            </View>
          )}
          <Pressable
            onPress={() => onAddAccount(card)}
            hitSlop={4}
            style={[styles.groupCircleButton, { backgroundColor: tc.primarySoft }]}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('accounts.add_account_to_group')}
          >
            <Plus size={16} color={tc.primary} />
          </Pressable>
          {editableGroup ? (
            <>
              <Pressable
                onPress={() => {
                  void triggerHaptic('warning');
                  onDelete(editableGroup);
                }}
                hitSlop={4}
                style={[styles.groupCircleButton, { backgroundColor: tc.deleteSurface }]}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.delete')}
              >
                <Trash2 size={15} color={tc.error} />
              </Pressable>
              <Sortable.Handle>
                <View
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={`${I18n.t('common.reorder')} ${card.label}`}
                  style={styles.groupHandle}
                >
                  <GripVertical size={16} color={tc.textFaint} />
                </View>
              </Sortable.Handle>
            </>
          ) : null}
        </View>
      )}

      {expanded && !isEditing ? (
        <View style={[styles.accountsPanel, { backgroundColor: tc.cardMuted }]}>
          {accounts.length > 0 ? (
            <Sortable.Flex
              activeItemScale={1.02}
              activeItemShadowOpacity={0.08}
              customHandle
              dragActivationDelay={0}
              flexDirection="column"
              flexWrap="nowrap"
              gap={spacing.xs}
              inactiveItemOpacity={1}
              onDragEnd={({ fromIndex, order, toIndex }) => {
                if (fromIndex === toIndex) return;
                const ordered = order(accounts);
                onReorderAccounts(card.id, ordered);
                void triggerHaptic('selection');
              }}
              scrollableRef={scrollableRef}
              width="fill"
            >
              {accounts.map((account) => (
                <AccountChildRow
                  key={account.id}
                  account={account}
                  theme={tc}
                  width={childWidth}
                  creditLabel={creditLabel}
                  onPress={onAccountPress}
                />
              ))}
            </Sortable.Flex>
          ) : (
            <Text style={[styles.accountsEmptyText, { color: tc.textMuted }]}>
              {I18n.t('accounts.empty_group_accounts')}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

interface AccountsScreenProps {
  onBack?: () => void;
  managementOnly?: boolean;
  resetToRootToken?: number;
  scrollToTopToken?: number;
  accountId?: string | null;
  onOpenAccount?: (accountId: string) => void;
  onOpenAddTransaction?: (accountId: string) => void;
  onOpenTransaction?: (transaction: TransactionWithRelations) => void;
  onOpenTransactionSplitBadge?: (transaction: TransactionWithRelations) => void;
  onOpenSettings?: () => void;
  onOpenNetAssetsInsight?: () => void;
  onOpenMultiCurrency?: () => void;
  useNativeBackGesture?: boolean;
  safeAreaEdges?: Edge[];
}

export function AccountsScreen({
  onBack,
  managementOnly = false,
  resetToRootToken = 0,
  scrollToTopToken = 0,
  accountId = null,
  onOpenAccount,
  onOpenAddTransaction,
  onOpenTransaction,
  onOpenTransactionSplitBadge,
  onOpenSettings,
  onOpenNetAssetsInsight,
  onOpenMultiCurrency,
  useNativeBackGesture = false,
  safeAreaEdges = ['top'],
}: AccountsScreenProps = {}) {
  const themeColors = useThemeColors();
  const listNavInset = useSettingsBottomNavInset(SETTINGS_LIST_BOTTOM_PADDING);
  const { contentWidth: windowWidth } = useDeviceLayout();
  const accountRowThemeColors = useMemo(
    () => ({
      accent: themeColors.accent,
      accentBorder: withColorAlpha(themeColors.accent, 0.32),
      accentSoft: themeColors.accentSoft,
      border: withColorAlpha(themeColors.primary, 0.18),
      card: themeColors.card,
      cardMuted: withColorAlpha(themeColors.primary, 0.06),
      deleteBorder: withColorAlpha(themeColors.error, 0.28),
      deleteSurface: themeColors.errorSoft,
      error: themeColors.error,
      primary: themeColors.primary,
      primaryMuted: themeColors.primaryMuted,
      primarySoft: themeColors.primarySoft,
      text: themeColors.text,
      textMuted: themeColors.textMuted,
      textFaint: withColorAlpha(themeColors.textMuted, 0.55),
    }),
    [
      themeColors.accent,
      themeColors.accentSoft,
      themeColors.card,
      themeColors.error,
      themeColors.errorSoft,
      themeColors.primary,
      themeColors.primaryMuted,
      themeColors.primarySoft,
      themeColors.text,
      themeColors.textMuted,
    ],
  );
  const safeAreaInsets = useSafeAreaInsets();
  const managementRowWidth = Math.max(windowWidth - SETTINGS_HORIZONTAL_PADDING * 2, 0);
  const {
    accountGroups,
    accounts,
    accountBalances,
    settings,
    currentMonthWage,
    createAccount,
    createAccountGroup,
    createTransaction,
    deleteAccount,
    deleteAccountGroup,
    deleteTransactionsBulk,
    getDisplayValueForTransaction,
    getTrueHourlyRateForDate,
    getTransactionsByAccount,
    reorderAccounts,
    reorderAccountGroups,
    renameAccountGroup,
    updateAccount,
    changeAccountCurrency,
    updateTransactionsBulk,
  } = useApp();
  const { checkLimit } = useProGate();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accountId);
  const [hideAccountBalances, setHideAccountBalances] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  // Group name pre-selected when adding an account via a group card's "+".
  const [createAccountGroupName, setCreateAccountGroupName] = useState<string | null>(null);
  const [showGroupComposer, setShowGroupComposer] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  // Track collapsed (not expanded) groups so cards stay expanded by default,
  // including newly created ones.
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [payCardAccountId, setPayCardAccountId] = useState<string | null>(null);
  const [showEditAccount, setShowEditAccount] = useState(false);
  const [addTransactionAccountId, setAddTransactionAccountId] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithRelations | null>(
    null,
  );
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkDate, setBulkDate] = useState(() => formatDateInput(new Date()));
  const [bulkDateTouched, setBulkDateTouched] = useState(false);
  const [bulkDateModalVisible, setBulkDateModalVisible] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkNoteTouched, setBulkNoteTouched] = useState(false);
  const accountsOverviewScrollRef = useRef<ScrollView | null>(null);
  const managementScrollRef = useAnimatedRef<React.ElementRef<typeof Animated.ScrollView>>();
  const transactionDisplaySettings = useMemo(
    () => ({
      currencySymbol: settings.currencySymbol,
      displayMode: settings.displayMode,
    }),
    [settings.currencySymbol, settings.displayMode],
  );
  const activeAccountId = accountId ?? selectedAccountId;
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const closeSelectedAccount = useCallback(() => {
    if (accountId && onBack) {
      onBack();
      return;
    }
    setSelectedAccountId(null);
  }, [accountId, onBack]);

  const selectedAccount = activeAccountId ? (accountById.get(activeAccountId) ?? null) : null;
  const editingAccount = editingAccountId ? (accountById.get(editingAccountId) ?? null) : null;
  const edgeSwipeBackHandler = useCallback(() => {
    if (addTransactionAccountId) {
      setAddTransactionAccountId(null);
      return;
    }
    if (selectedTransaction) {
      setSelectedTransaction(null);
      return;
    }
    if (!managementOnly && activeAccountId && selectedAccount) {
      closeSelectedAccount();
      return;
    }
    onBack?.();
  }, [
    activeAccountId,
    addTransactionAccountId,
    closeSelectedAccount,
    managementOnly,
    onBack,
    selectedAccount,
    selectedTransaction,
  ]);
  const withBackGesture = useCallback(
    (children: React.ReactNode) => {
      if (useNativeBackGesture) return <>{children}</>;
      return (
        <EdgeSwipeBackContainer onBack={edgeSwipeBackHandler}>{children}</EdgeSwipeBackContainer>
      );
    },
    [edgeSwipeBackHandler, useNativeBackGesture],
  );
  const selectedAccountTransactions = useMemo(
    () => (activeAccountId ? getTransactionsByAccount(activeAccountId) : []),
    [activeAccountId, getTransactionsByAccount],
  );
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';
  const pagerPageWidth = Math.max(1, windowWidth);
  const pagerPageStyle = useMemo(() => ({ width: pagerPageWidth }), [pagerPageWidth]);
  const pagerListRef = useRef<FlatList<number> | null>(null);
  const selectedAccountStatementDay =
    selectedAccount?.type === 'credit'
      ? (selectedAccount.creditStatementDay ?? DEFAULT_CREDIT_STATEMENT_DAY)
      : null;
  const usesStatementPeriods = selectedAccountStatementDay != null;
  const pagerAnchorDate = useMemo(() => {
    const now = new Date();
    if (usesStatementPeriods && selectedAccountStatementDay != null) {
      return getCurrentStatementCycleStart(selectedAccountStatementDay, now);
    }
    return startOfMonthDate(now);
  }, [selectedAccountStatementDay, usesStatementPeriods]);
  const {
    activeIndex: pagerActiveIndex,
    activeIndexRef: pagerActiveIndexRef,
    slots: pagerSlots,
    handleMomentumEnd: handlePagerMomentumEnd,
    handleScrollEndDrag: handlePagerScrollEndDrag,
    handleScrollToIndexFailed: handlePagerScrollToIndexFailed,
    getItemLayout: getPagerItemLayout,
    keyExtractor: pagerKeyExtractor,
    scrollToRelative: scrollToRelativePage,
    setActiveIndex: setPagerActiveIndex,
  } = useMonthPager({
    listRef: pagerListRef,
    pageWidth: pagerPageWidth,
    totalSlots: MONTH_PAGER_TOTAL_SLOTS,
    initialIndex: MONTH_PAGER_CENTER_INDEX,
  });
  const getPagerScrollToTopRef = useIndexedScrollToTopRefs();
  const accountPeriodTransactionsMap = useMemo(() => {
    if (!selectedAccount) return new Map<string, TransactionWithRelations[]>();
    return bucketTransactionsByAccountPeriod(
      selectedAccountTransactions,
      selectedAccountStatementDay,
    );
  }, [selectedAccount, selectedAccountStatementDay, selectedAccountTransactions]);
  const activePagerOffset = pagerActiveIndex - MONTH_PAGER_CENTER_INDEX;
  const activePagerPeriod = useMemo(() => {
    if (usesStatementPeriods && selectedAccountStatementDay != null) {
      const period = statementPeriodFromAnchor(
        pagerAnchorDate,
        selectedAccountStatementDay,
        activePagerOffset,
      );
      const endInclusive = new Date(period.end.getTime() - DAY_IN_MS);
      return {
        key: period.key,
        label: formatStatementRangeSublabel(period.start, endInclusive, activeLocale),
      };
    }
    const monthDate = addMonthsAtMonthStart(pagerAnchorDate, activePagerOffset);
    return {
      key: monthKeyFromDateLocal(monthDate),
      label: formatMonthYearLabel(monthDate, activeLocale),
    };
  }, [
    activeLocale,
    activePagerOffset,
    pagerAnchorDate,
    selectedAccountStatementDay,
    usesStatementPeriods,
  ]);
  const activePeriodCreditTotals = useMemo(() => {
    if (!selectedAccount || selectedAccount.type !== 'credit') return null;
    const periodTransactions = accountPeriodTransactionsMap.get(activePagerPeriod.key);
    if (!periodTransactions) return { debit: 0, credit: 0 };
    let debit = 0;
    let credit = 0;
    periodTransactions.forEach((tx) => {
      const delta = creditDeltaForAccountTransaction(tx, selectedAccount.id);
      if (delta > 0) debit += delta;
      else if (delta < 0) credit += -delta;
    });
    return { debit, credit };
  }, [accountPeriodTransactionsMap, activePagerPeriod.key, selectedAccount]);
  const isSelectionMode = selectedTransactionIds.length > 0;
  const selectedTransactionCount = selectedTransactionIds.length;
  const selectedTransactionTotal = useMemo(() => {
    if (selectedTransactionIds.length === 0) return 0;
    const selectedIdSet = new Set(selectedTransactionIds);
    let total = 0;
    selectedAccountTransactions.forEach((transaction) => {
      if (!selectedIdSet.has(transaction.id)) return;
      total += transaction.amount;
    });
    return total;
  }, [selectedAccountTransactions, selectedTransactionIds]);
  const normalizedSelectedTransactionTotal = useMemo(
    () => normalizeMoneyAmount(selectedTransactionTotal),
    [selectedTransactionTotal],
  );
  const selectedTransactionTotalLabel = useMemo(
    () =>
      formatAmount(
        Math.abs(normalizedSelectedTransactionTotal),
        {
          currencySymbol: settings.currencySymbol,
          displayMode: 'money',
        },
        { showSign: false, trueHourlyRate: 0 },
      ),
    [normalizedSelectedTransactionTotal, settings.currencySymbol],
  );
  const hasBulkChanges = bulkDateTouched || bulkNoteTouched;
  const trueHourlyRate = currentMonthWage?.trueHourlyRate ?? 0;
  const balanceToggleLabel = hideAccountBalances
    ? I18n.t('accounts.show_balances')
    : I18n.t('accounts.hide_balances');

  const handleToggleAccountBalances = useCallback(() => {
    setHideAccountBalances((previous) => !previous);
  }, []);

  const formatVisibleBalance = useCallback(
    (amount: number, currencyCode?: string) => {
      if (hideAccountBalances) return MASKED_BALANCE_VALUE;
      return formatAmount(normalizeMoneyAmount(amount), settings, {
        showSign: false,
        trueHourlyRate,
        currencyCode,
      });
    },
    [hideAccountBalances, settings, trueHourlyRate],
  );
  const renderVisibleBalanceNode = useCallback(
    (
      amount: number,
      options: {
        variant?: React.ComponentProps<typeof Text>['variant'];
        tone?: React.ComponentProps<typeof Text>['tone'];
        textClassName?: string;
        iconColor?: string;
        currencyCode?: string;
      } = {},
    ) => {
      const {
        variant = 'caption',
        tone = 'default',
        textClassName,
        iconColor,
        currencyCode,
      } = options;
      const label = formatVisibleBalance(amount, currencyCode);
      if (hideAccountBalances || settings.displayMode !== 'time') {
        return (
          <Text variant={variant} tone={tone} className={textClassName}>
            {label}
          </Text>
        );
      }
      return (
        <TimeValueInline
          value={label}
          variant={variant}
          tone={tone}
          textClassName={textClassName}
          iconColor={iconColor}
        />
      );
    },
    [formatVisibleBalance, hideAccountBalances, settings.displayMode],
  );

  const renderBalanceToggleButton = useCallback(
    () => (
      <Button
        size="icon"
        variant="secondary"
        className="h-10 w-10 rounded-full"
        accessibilityLabel={balanceToggleLabel}
        onPress={handleToggleAccountBalances}
      >
        {hideAccountBalances ? (
          <EyeOff size={18} color={themeColors.textMuted} />
        ) : (
          <Eye size={18} color={themeColors.textMuted} />
        )}
      </Button>
    ),
    [balanceToggleLabel, handleToggleAccountBalances, hideAccountBalances, themeColors.textMuted],
  );

  const handleToggleGroup = useCallback((cardId: string) => {
    void triggerHaptic('selection');
    setCollapsedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) {
        next.delete(cardId);
      } else {
        next.add(cardId);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (accountId !== null) {
      setSelectedAccountId(accountId);
    }
  }, [accountId]);

  useEffect(() => {
    if (activeAccountId && !selectedAccount) {
      if (accountId && onBack) {
        onBack();
        return;
      }
      setSelectedAccountId(null);
    }
  }, [accountId, activeAccountId, onBack, selectedAccount]);

  useEffect(() => {
    if (managementOnly) return;
    if (selectedAccount) return;
    setShowEditAccount(false);
  }, [managementOnly, selectedAccount]);
  useEffect(() => {
    if (!managementOnly) return;
    if (editingAccount) return;
    setShowEditAccount(false);
    setEditingAccountId(null);
  }, [editingAccount, managementOnly]);

  useEffect(() => {
    setSelectedTransaction(null);
    setSelectedTransactionIds([]);
    setShowBulkUpdate(false);
  }, [activeAccountId]);

  useEffect(() => {
    if (!activeAccountId) return;
    if (pagerActiveIndexRef.current === MONTH_PAGER_CENTER_INDEX) return;
    setPagerActiveIndex(MONTH_PAGER_CENTER_INDEX);
    const frame = requestAnimationFrame(() => {
      pagerListRef.current?.scrollToIndex({
        index: MONTH_PAGER_CENTER_INDEX,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId]);

  useEffect(() => {
    if (managementOnly || !activeAccountId || selectedTransactionIds.length === 0) return;
    const availableIds = new Set(selectedAccountTransactions.map((transaction) => transaction.id));
    setSelectedTransactionIds((previous) => {
      const next = previous.filter((id) => availableIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [activeAccountId, managementOnly, selectedAccountTransactions, selectedTransactionIds.length]);

  useEffect(() => {
    if (isSelectionMode) {
      setSelectedTransaction(null);
      return;
    }
    setShowBulkUpdate(false);
  }, [isSelectionMode]);

  useEffect(() => {
    if (resetToRootToken <= 0) return;
    setSelectedAccountId(accountId ?? null);
    setShowCreate(false);
    setShowGroupComposer(false);
    setNewGroupName('');
    setEditingGroupId(null);
    setEditingGroupName('');
    setEditingAccountId(null);
    setPayCardAccountId(null);
    setShowEditAccount(false);
  }, [accountId, resetToRootToken]);

  useEffect(() => {
    if (scrollToTopToken <= 0) return;
    const frame = requestAnimationFrame(() => {
      if (!managementOnly && activeAccountId && selectedAccount) {
        const currentIndex = pagerActiveIndexRef.current;
        pagerListRef.current?.scrollToIndex({ index: currentIndex, animated: false });
        getPagerScrollToTopRef(currentIndex).current?.();
        return;
      }
      if (managementOnly) {
        managementScrollRef.current?.scrollTo({ y: 0, animated: false });
        return;
      }
      accountsOverviewScrollRef.current?.scrollTo({ y: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [
    getPagerScrollToTopRef,
    managementScrollRef,
    managementOnly,
    pagerActiveIndexRef,
    pagerListRef,
    scrollToTopToken,
    activeAccountId,
    selectedAccount,
  ]);

  const balanceMap = useMemo(() => {
    return new Map(accountBalances.map((item) => [item.accountId, item.balance]));
  }, [accountBalances]);

  // Balances converted to the reporting currency, for cross-currency totals.
  // Falls back to the native balance when no rate is available.
  const convertedBalanceMap = useMemo(() => {
    return new Map(
      accountBalances.map((item) => [item.accountId, item.convertedBalance ?? item.balance]),
    );
  }, [accountBalances]);

  const { total, assetsTotal, debtTotal } = useMemo(() => {
    if (managementOnly) return { total: 0, assetsTotal: 0, debtTotal: 0 };
    let assets = 0;
    let debt = 0;
    for (const account of accounts) {
      if (!account.includeInTotals) continue;
      const balance = convertedBalanceMap.get(account.id) ?? account.startingBalance;
      if (account.type === 'credit') {
        debt += balance;
      } else {
        assets += balance;
      }
    }
    return {
      total: normalizeMoneyAmount(assets - debt),
      assetsTotal: normalizeMoneyAmount(assets),
      debtTotal: normalizeMoneyAmount(debt),
    };
  }, [accounts, convertedBalanceMap, managementOnly]);
  const creditSummaryByAccountId = useMemo(() => {
    if (managementOnly) return new Map<string, CreditSummary>();
    const creditAccounts = accounts.filter((account) => account.type === 'credit');
    if (creditAccounts.length === 0) return new Map<string, CreditSummary>();

    const now = new Date();
    const next = new Map<string, CreditSummary>();
    creditAccounts.forEach((account) => {
      const accountTxns = getTransactionsByAccount(account.id);
      const balance = balanceMap.get(account.id) ?? account.startingBalance;
      next.set(account.id, computeCreditCycleSummary(account, accountTxns, balance, now));
    });
    return next;
  }, [accounts, balanceMap, getTransactionsByAccount, managementOnly]);
  const { accountGroupSections, groupCards, staticCards } = useMemo(() => {
    const knownNames = new Set<string>();
    accountGroups.forEach((group) => {
      knownNames.add(group.name);
    });

    const buckets = new Map<string, Account[]>();
    accounts.forEach((account) => {
      const groupName = account.accountGroup?.trim() ?? '';
      const bucketKey = groupName || '__ungrouped__';
      const bucket = buckets.get(bucketKey);
      if (bucket) {
        bucket.push(account);
      } else {
        buckets.set(bucketKey, [account]);
      }
    });
    const ungrouped = buckets.get('__ungrouped__');

    // Sections drive global account reordering (non-empty only, in display order).
    const sections: AccountGroupSection[] = [];
    for (const group of accountGroups) {
      const list = buckets.get(group.name);
      if (list && list.length > 0) {
        sections.push({ id: group.id, label: group.name, accounts: list });
      }
    }
    for (const [key, list] of buckets) {
      if (key === '__ungrouped__' || knownNames.has(key)) continue;
      sections.push({ id: `group-${key}`, label: key, accounts: list });
    }
    if (ungrouped && ungrouped.length > 0) {
      sections.push({
        id: 'group-ungrouped',
        label: String(I18n.t('common.ungrouped')),
        accounts: ungrouped,
      });
    }

    // Parent cards for the collapsible UI. Real groups (draggable/editable) are
    // shown first — including empty ones — then unknown-name and ungrouped
    // buckets as static cards.
    const groups: GroupCard[] = accountGroups.map((group) => ({
      kind: 'group',
      id: group.id,
      group,
      label: group.name,
      accounts: buckets.get(group.name) ?? [],
    }));
    const statics: GroupCard[] = [];
    for (const [key, list] of buckets) {
      if (key === '__ungrouped__' || knownNames.has(key)) continue;
      statics.push({ kind: 'named', id: `group-${key}`, group: null, label: key, accounts: list });
    }
    if (ungrouped && ungrouped.length > 0) {
      statics.push({
        kind: 'ungrouped',
        id: 'group-ungrouped',
        group: null,
        label: String(I18n.t('common.ungrouped')),
        accounts: ungrouped,
      });
    }

    return { accountGroupSections: sections, groupCards: groups, staticCards: statics };
  }, [accounts, accountGroups]);
  const buildReorderedAccountIds = useCallback(
    (sectionId: string, orderedAccounts: Account[]) => {
      const nextIds: string[] = [];
      accountGroupSections.forEach((section) => {
        const sectionAccounts = section.id === sectionId ? orderedAccounts : section.accounts;
        sectionAccounts.forEach((account) => {
          nextIds.push(account.id);
        });
      });
      return nextIds;
    },
    [accountGroupSections],
  );
  const handleReorderAccountsInSection = useCallback(
    (sectionId: string, orderedAccounts: Account[]) => {
      reorderAccounts(buildReorderedAccountIds(sectionId, orderedAccounts));
    },
    [buildReorderedAccountIds, reorderAccounts],
  );

  const canCreateGroup = newGroupName.trim().length > 0;
  const startCreateGroup = useCallback(() => {
    setEditingGroupId(null);
    setEditingGroupName('');
    setShowGroupComposer(true);
  }, []);
  const cancelCreateGroup = useCallback(() => {
    setShowGroupComposer(false);
    setNewGroupName('');
  }, []);
  const handleCreateGroup = useCallback(() => {
    const normalized = newGroupName.trim();
    if (!normalized) return;
    createAccountGroup(normalized);
    setNewGroupName('');
    setShowGroupComposer(false);
  }, [createAccountGroup, newGroupName]);
  const startEditGroup = useCallback((group: AccountGroup) => {
    setShowGroupComposer(false);
    setNewGroupName('');
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  }, []);
  const cancelEditGroup = useCallback(() => {
    setEditingGroupId(null);
    setEditingGroupName('');
  }, []);
  const saveEditedGroup = useCallback(
    (groupId: string) => {
      const normalized = editingGroupName.trim();
      if (!normalized) return;
      renameAccountGroup(groupId, normalized);
      setEditingGroupId(null);
      setEditingGroupName('');
    },
    [editingGroupName, renameAccountGroup],
  );
  const handleDeleteGroup = useCallback(
    (group: AccountGroup) => {
      Alert.alert(I18n.t('accounts.delete_group_title'), I18n.t('accounts.delete_group_message'), [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => deleteAccountGroup(group.id),
        },
      ]);
    },
    [deleteAccountGroup],
  );
  const clearSelection = useCallback(() => {
    setSelectedTransactionIds([]);
  }, []);
  const toggleTransactionSelection = useCallback((transactionId: string) => {
    setSelectedTransactionIds((previous) => {
      const index = previous.indexOf(transactionId);
      if (index === -1) return [...previous, transactionId];
      if (previous.length === 1) return [];
      const next = [...previous];
      next.splice(index, 1);
      return next;
    });
  }, []);
  const handleTransactionPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleTransactionSelection(transaction.id);
        return;
      }
      if (onOpenTransaction) {
        onOpenTransaction(transaction);
        return;
      }
      setSelectedTransaction(transaction);
    },
    [isSelectionMode, onOpenTransaction, toggleTransactionSelection],
  );
  const handleTransactionSplitBadgePress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleTransactionSelection(transaction.id);
        return;
      }
      if (onOpenTransactionSplitBadge) {
        onOpenTransactionSplitBadge(transaction);
        return;
      }
      setSelectedTransaction(transaction);
    },
    [isSelectionMode, onOpenTransactionSplitBadge, toggleTransactionSelection],
  );
  const handleTransactionLongPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleTransactionSelection(transaction.id);
        return;
      }
      setSelectedTransactionIds([transaction.id]);
    },
    [isSelectionMode, toggleTransactionSelection],
  );
  const handleOpenBulkUpdate = useCallback(() => {
    if (selectedTransactionCount === 0) return;
    setBulkDate(formatDateInput(new Date()));
    setBulkDateTouched(false);
    setBulkNote('');
    setBulkNoteTouched(false);
    setShowBulkUpdate(true);
  }, [selectedTransactionCount]);
  const handleCloseBulkUpdate = useCallback(() => {
    setShowBulkUpdate(false);
  }, []);
  const handleApplyBulkUpdate = useCallback(() => {
    if (selectedTransactionIds.length === 0) return;
    if (!hasBulkChanges) return;

    const updates: { date?: string; note?: string | null } = {};
    if (bulkDateTouched) updates.date = bulkDate;
    if (bulkNoteTouched) {
      const normalizedNote = bulkNote.trim();
      updates.note = normalizedNote.length > 0 ? normalizedNote : null;
    }
    if (Object.keys(updates).length === 0) return;

    updateTransactionsBulk(
      selectedTransactionIds.map((transactionId) => ({ id: transactionId, input: updates })),
    );
    setShowBulkUpdate(false);
    setSelectedTransactionIds([]);
  }, [
    bulkDate,
    bulkDateTouched,
    bulkNote,
    bulkNoteTouched,
    hasBulkChanges,
    selectedTransactionIds,
    updateTransactionsBulk,
  ]);
  const handleDeleteSelectedTransactions = useCallback(() => {
    if (selectedTransactionIds.length === 0) return;
    const idsToDelete = [...selectedTransactionIds];
    Alert.alert(
      I18n.t('transactions.selection.delete_title'),
      I18n.t('transactions.selection.delete_message', { count: idsToDelete.length }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.delete'),
          style: 'destructive',
          onPress: () => {
            deleteTransactionsBulk(idsToDelete);
            setShowBulkUpdate(false);
            setSelectedTransactionIds([]);
          },
        },
      ],
    );
  }, [deleteTransactionsBulk, selectedTransactionIds]);
  const applyAccountSave = useCallback(
    ({
      account,
      currentBalance,
      updates,
      onComplete,
    }: {
      account: Account;
      currentBalance: number;
      updates: AccountEditorInput;
      onComplete: () => void;
    }) => {
      const accountUpdates = {
        name: updates.name,
        accountGroup: updates.accountGroup,
        logoId: updates.logoId,
        creditStatementDay: updates.creditStatementDay,
        creditDueDay: updates.creditDueDay,
        includeInTotals: updates.includeInTotals,
        currency: updates.currency,
      };

      // Currency change on an existing account re-denominates prior entries at
      // the latest rate in a lump — warn, then run it as its own operation.
      if (updates.currency && updates.currency !== account.currency) {
        Alert.alert(
          I18n.t('accounts.currency_change_title'),
          I18n.t('accounts.currency_change_message', {
            from: account.currency,
            to: updates.currency,
          }),
          [
            { text: I18n.t('common.cancel'), style: 'cancel' },
            {
              text: I18n.t('accounts.currency_change_action'),
              style: 'destructive',
              onPress: () => {
                changeAccountCurrency(account.id, updates.currency, {
                  name: updates.name,
                  accountGroup: updates.accountGroup,
                  logoId: updates.logoId,
                  creditStatementDay: updates.creditStatementDay,
                  creditDueDay: updates.creditDueDay,
                  includeInTotals: updates.includeInTotals,
                });
                onComplete();
              },
            },
          ],
        );
        return;
      }

      const delta = updates.startingBalance - currentBalance;
      const adjustmentAmount = Math.abs(delta);
      const hasBalanceChange = adjustmentAmount > 0.000001;

      if (!hasBalanceChange) {
        updateAccount(account.id, accountUpdates);
        onComplete();
        return;
      }

      const flowType = flowTypeForBalanceDelta(account.type, delta);
      Alert.alert(
        I18n.t('accounts.balance_adjustment_prompt_title'),
        I18n.t('accounts.balance_adjustment_prompt_message', {
          amount: formatAmount(adjustmentAmount, settings, {
            showSign: false,
            trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
          }),
        }),
        [
          { text: I18n.t('common.cancel'), style: 'cancel' },
          {
            text: I18n.t('accounts.record_as_difference'),
            onPress: () => {
              updateAccount(account.id, accountUpdates);
              createTransaction({
                type: 'balance_adjustment',
                amount: delta,
                currency: updates.currency || account.currency,
                date: new Date().toISOString(),
                accountId: account.id,
                fromAccountId: null,
                toAccountId: null,
                categoryId: null,
                note: String(I18n.t('accounts.balance_adjustment_transaction_note')),
              });
              onComplete();
            },
          },
          {
            text:
              flowType === 'income'
                ? I18n.t('accounts.record_as_income')
                : I18n.t('accounts.record_as_expense'),
            onPress: () => {
              updateAccount(account.id, accountUpdates);
              createTransaction({
                type: flowType,
                amount: adjustmentAmount,
                currency: updates.currency || account.currency,
                date: new Date().toISOString(),
                accountId: account.id,
                note: String(I18n.t('accounts.balance_adjustment_transaction_note')),
              });
              onComplete();
            },
          },
        ],
      );
    },
    [
      changeAccountCurrency,
      createTransaction,
      currentMonthWage?.trueHourlyRate,
      settings,
      updateAccount,
    ],
  );
  const handleAccountManagementPress = useCallback((account: Account) => {
    void triggerHaptic('selection');
    setEditingAccountId(account.id);
    setShowEditAccount(true);
  }, []);
  const handleAddAccountToGroup = useCallback(
    (card: GroupCard) => {
      if (!checkLimit('accounts', accounts.length)) return;
      void triggerHaptic('selection');
      setCreateAccountGroupName(card.kind === 'ungrouped' ? null : card.label);
      setShowCreate(true);
    },
    [accounts.length, checkLimit],
  );
  const handleAddTransactionForAccount = useCallback(
    (targetAccountId: string) => {
      if (onOpenAddTransaction) {
        onOpenAddTransaction(targetAccountId);
        return;
      }
      setAddTransactionAccountId(targetAccountId);
    },
    [onOpenAddTransaction],
  );
  const creditLabel = String(I18n.t('accounts.credit'));

  const selectedAccountIsCredit = selectedAccount?.type === 'credit';
  const detailListBottomPadding =
    SETTINGS_FORM_BOTTOM_PADDING +
    safeAreaInsets.bottom +
    spacing.sm +
    FLOATING_ACTION_SIZE +
    (selectedAccountIsCredit ? FLOATING_ACTION_SIZE + FLOATING_ACTION_GAP : 0);
  const selectedAccountIdForPager = selectedAccount?.id ?? '';
  const renderPagerPage = useCallback(
    ({ item }: { item: number }) => {
      const offset = item - MONTH_PAGER_CENTER_INDEX;
      const periodKey =
        usesStatementPeriods && selectedAccountStatementDay != null
          ? statementPeriodFromAnchor(pagerAnchorDate, selectedAccountStatementDay, offset).key
          : monthKeyFromDateLocal(addMonthsAtMonthStart(pagerAnchorDate, offset));
      const pageTransactions =
        accountPeriodTransactionsMap.get(periodKey) ?? EMPTY_PERIOD_TRANSACTIONS;
      return (
        <View style={pagerPageStyle} className="flex-1 bg-background">
          <ActivityTransactionList
            transactions={pageTransactions}
            locale={activeLocale}
            displaySettings={transactionDisplaySettings}
            subtotalCurrencyCode={selectedAccount?.currency ?? null}
            getDisplayValueForTransaction={getDisplayValueForTransaction}
            getTrueHourlyRateForDate={getTrueHourlyRateForDate}
            onTransactionPress={handleTransactionPress}
            onTransactionLongPress={handleTransactionLongPress}
            onTransactionSplitBadgePress={handleTransactionSplitBadgePress}
            selectedTransactionIds={selectedTransactionIds}
            selectionMode={isSelectionMode}
            emptyTitle={I18n.t(
              usesStatementPeriods
                ? 'accounts.empty_statement_title'
                : 'accounts.empty_period_title',
            )}
            emptyMessage={I18n.t(
              usesStatementPeriods
                ? 'accounts.empty_statement_message'
                : 'accounts.empty_period_message',
            )}
            contentPaddingBottom={detailListBottomPadding}
            contentPaddingHorizontal={SETTINGS_HORIZONTAL_PADDING}
            contentPaddingTop={0}
            disableItemAnimations
            compactItems
            listKey={`${selectedAccountIdForPager}-${periodKey}`}
            scrollToTopRef={getPagerScrollToTopRef(item)}
          />
        </View>
      );
    },
    [
      accountPeriodTransactionsMap,
      activeLocale,
      detailListBottomPadding,
      getDisplayValueForTransaction,
      getPagerScrollToTopRef,
      getTrueHourlyRateForDate,
      handleTransactionLongPress,
      handleTransactionPress,
      handleTransactionSplitBadgePress,
      isSelectionMode,
      pagerAnchorDate,
      pagerPageStyle,
      selectedAccount?.currency,
      selectedAccountIdForPager,
      selectedAccountStatementDay,
      selectedTransactionIds,
      transactionDisplaySettings,
      usesStatementPeriods,
    ],
  );

  if (addTransactionAccountId) {
    return withBackGesture(
      <AddTransactionScreen
        onClose={() => setAddTransactionAccountId(null)}
        initialAccountId={addTransactionAccountId}
      />,
    );
  }

  if (selectedTransaction) {
    return withBackGesture(
      <EditTransactionScreen
        transaction={selectedTransaction}
        onClose={() => setSelectedTransaction(null)}
      />,
    );
  }

  if (!managementOnly && activeAccountId && selectedAccount) {
    const account = selectedAccount;

    const balance = balanceMap.get(account.id) ?? account.startingBalance;
    const txns = selectedAccountTransactions;
    const isCredit = account.type === 'credit';
    const payFromAccounts = isCredit
      ? accounts.filter((item) => item.id !== account.id && item.type !== 'credit')
      : [];
    const cyclePayable = isCredit
      ? computeCreditCycleSummary(account, txns, balance, new Date()).payable
      : 0;
    const creditTotalsSummaryNode = activePeriodCreditTotals ? (
      <>
        <View className="flex-1 rounded-[18px] border border-destructive/15 bg-destructive/6 px-3 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full bg-destructive" />
            <Text variant="label" className="text-[10px] text-destructive">
              {I18n.t('accounts.type_debit')}
            </Text>
          </View>
          <View className="mt-1">
            {renderVisibleBalanceNode(activePeriodCreditTotals.debit, { variant: 'mono' })}
          </View>
        </View>
        <View className="flex-1 rounded-[18px] border border-success/20 bg-success/8 px-3 py-2.5">
          <View className="flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full bg-success" />
            <Text variant="label" className="text-[10px] text-success">
              {I18n.t('accounts.type_credit')}
            </Text>
          </View>
          <View className="mt-1">
            {renderVisibleBalanceNode(activePeriodCreditTotals.credit, { variant: 'mono' })}
          </View>
        </View>
      </>
    ) : undefined;
    return withBackGesture(
      <SettingsPageLayout edges={safeAreaEdges}>
        <View className="flex-1">
          <View style={styles.headerContainer}>
            <SettingsHeader
              className="px-0 pt-5 pb-2"
              onBack={isSelectionMode ? clearSelection : closeSelectedAccount}
              reserveActionRow
              title={I18n.t('accounts.title')}
              subtitleNode={
                <View className="flex-row items-center gap-1.5">
                  <AccountLogo logoId={account.logoId} type={account.type} size={20} />
                  <Text variant="friendly" tone="muted" numberOfLines={1}>
                    {account.name}
                  </Text>
                </View>
              }
              rightAccessory={
                !isSelectionMode ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-3"
                    onPress={() => {
                      setShowEditAccount(true);
                    }}
                  >
                    <Text>{I18n.t('accounts.edit_account')}</Text>
                  </Button>
                ) : null
              }
            />
          </View>
          {isSelectionMode ? (
            <View className="bg-background pb-1.5 pt-1">
              <TabletContentContainer>
                <View className="px-5 pt-1.5 gap-2.5">
                  <View className="rounded-pill bg-secondary/40 px-1.5 py-1.5 flex-row items-center justify-between gap-1.5">
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('selection');
                        clearSelection();
                      }}
                      className="h-9 px-3 rounded-full bg-card shadow-soft active:scale-95 items-center justify-center"
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('common.cancel')}
                    >
                      <Text variant="caption" tone="muted">
                        {I18n.t('common.cancel')}
                      </Text>
                    </Pressable>

                    <View className="flex-1 items-center px-1">
                      <View className="flex-row flex-wrap items-center justify-center gap-1.5">
                        <Text variant="caption" className="text-foreground">
                          {I18n.t('transactions.selection.selected_count', {
                            count: selectedTransactionCount,
                          })}
                        </Text>
                        <View className="rounded-full border border-border/35 bg-card px-2 py-[3px]">
                          <Text variant="label" className="text-foreground">
                            {selectedTransactionTotalLabel}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View className="flex-row items-center gap-1.5">
                      <Pressable
                        onPress={handleOpenBulkUpdate}
                        className="h-9 w-9 rounded-full bg-card shadow-soft active:scale-95 items-center justify-center"
                        accessibilityRole="button"
                        accessibilityLabel={I18n.t('transactions.selection.update')}
                        hitSlop={8}
                      >
                        <Pencil size={14} color={themeColors.primary} />
                      </Pressable>
                      <Pressable
                        onPress={handleDeleteSelectedTransactions}
                        className="h-9 w-9 rounded-full bg-card shadow-soft active:scale-95 items-center justify-center"
                        accessibilityRole="button"
                        accessibilityLabel={I18n.t('common.delete')}
                        hitSlop={8}
                      >
                        <Trash2 size={14} color={themeColors.coral} />
                      </Pressable>
                    </View>
                  </View>
                  {creditTotalsSummaryNode ? (
                    <View className="flex-row flex-wrap gap-2">{creditTotalsSummaryNode}</View>
                  ) : null}
                </View>
              </TabletContentContainer>
            </View>
          ) : (
            <MonthControlsHeader
              monthLabel={activePagerPeriod.label}
              onPrevMonth={() => scrollToRelativePage(-1)}
              onNextMonth={() => scrollToRelativePage(1)}
              hideTitleRow
              summary={creditTotalsSummaryNode}
            />
          )}
          <View className="flex-1 overflow-hidden bg-background">
            <FlatList
              ref={pagerListRef}
              data={pagerSlots}
              keyExtractor={pagerKeyExtractor}
              style={styles.flexContainer}
              {...MONTH_PAGER_LIST_CONFIG}
              renderItem={renderPagerPage}
              initialScrollIndex={MONTH_PAGER_CENTER_INDEX}
              getItemLayout={getPagerItemLayout}
              onScrollEndDrag={handlePagerScrollEndDrag}
              onMomentumScrollEnd={handlePagerMomentumEnd}
              onScrollToIndexFailed={handlePagerScrollToIndexFailed}
            />
          </View>
          {!isSelectionMode ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.floatingAddButtonContainer,
                { bottom: safeAreaInsets.bottom + spacing.sm },
              ]}
            >
              <View style={styles.floatingButtonStack}>
                {isCredit ? (
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('medium');
                      setPayCardAccountId(account.id);
                    }}
                    style={[styles.floatingAddButton, { backgroundColor: themeColors.accent }]}
                    accessibilityRole="button"
                    accessibilityLabel={String(I18n.t('accounts.pay_this_card'))}
                  >
                    <Text variant="bodyStrong" style={{ color: '#fff', fontSize: 14 }}>
                      {I18n.t('accounts.pay')}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    void triggerHaptic('medium');
                    handleAddTransactionForAccount(account.id);
                  }}
                  style={[styles.floatingAddButton, { backgroundColor: themeColors.primary }]}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('onboarding.bootstrap.add_transaction')}
                >
                  <Plus size={24} color="#fff" />
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
        <AccountEditorSheet
          visible={showEditAccount}
          account={account}
          currentBalance={balance}
          defaultCurrencyCode={settings.currencyCode}
          accountGroups={accountGroups}
          onClose={() => setShowEditAccount(false)}
          onSave={(updates) =>
            applyAccountSave({
              account,
              currentBalance: balance,
              updates,
              onComplete: () => setShowEditAccount(false),
            })
          }
          onDelete={() => {
            deleteAccount(account.id);
            setPayCardAccountId(null);
            setShowEditAccount(false);
            closeSelectedAccount();
          }}
          onOpenMultiCurrency={onOpenMultiCurrency}
        />
        <PayCreditCardSheet
          visible={payCardAccountId === account.id}
          onClose={() => setPayCardAccountId(null)}
          fromAccounts={payFromAccounts}
          accountGroups={accountGroups}
          currencySymbol={settings.currencySymbol}
          defaultAmount={cyclePayable}
          onSubmit={({ fromAccountId, amount, note }) => {
            createTransaction({
              type: 'transfer',
              amount,
              currency: accountById.get(fromAccountId)?.currency ?? settings.currencyCode,
              date: new Date().toISOString(),
              fromAccountId,
              toAccountId: account.id,
              note,
            });
            setPayCardAccountId(null);
          }}
        />
        <ThemeModal
          visible={showBulkUpdate}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={handleCloseBulkUpdate}
        >
          <SafeAreaView className="flex-1 bg-background" edges={['top']}>
            <View className="px-5 pt-8 pb-4 flex-row items-center justify-between">
              <View className="flex-1 pr-3">
                <Text variant="subheading">
                  {I18n.t('transactions.selection.update_title', {
                    count: selectedTransactionCount,
                  })}
                </Text>
                <Text variant="friendly" tone="muted">
                  {I18n.t('transactions.selection.update_subtitle')}
                </Text>
              </View>
              <View className="flex-row items-center gap-2">
                <Pressable
                  onPress={handleCloseBulkUpdate}
                  className="px-3 py-2 rounded-full bg-secondary/70"
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.cancel')}
                >
                  <Text variant="caption" tone="muted">
                    {I18n.t('common.cancel')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleApplyBulkUpdate}
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

            {/* Inside a pageSheet modal — no nav bar behind it, so no glass inset. */}
            <ScrollView
              className="flex-1"
              contentContainerStyle={ACCOUNT_BULK_SCROLL_CONTENT_STYLE}
            >
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
          </SafeAreaView>
        </ThemeModal>
      </SettingsPageLayout>,
    );
  }

  // Shared between the draggable group cards and the static (ungrouped/unknown)
  // cards. `isEditing` only ever matches a real group id, so static cards
  // naturally render in display mode.
  const renderGroupCard = (card: GroupCard) => (
    <GroupCollapsibleCard
      key={card.id}
      card={card}
      theme={accountRowThemeColors}
      rowWidth={managementRowWidth}
      expanded={!collapsedGroupIds.has(card.id)}
      creditLabel={creditLabel}
      isEditing={editingGroupId === card.id}
      editingName={editingGroupName}
      scrollableRef={managementScrollRef}
      onToggle={handleToggleGroup}
      onEditingNameChange={setEditingGroupName}
      onSaveName={saveEditedGroup}
      onCancelEdit={cancelEditGroup}
      onStartEdit={startEditGroup}
      onDelete={handleDeleteGroup}
      onAddAccount={handleAddAccountToGroup}
      onAccountPress={handleAccountManagementPress}
      onReorderAccounts={handleReorderAccountsInSection}
    />
  );

  return withBackGesture(
    <SettingsPageLayout edges={safeAreaEdges}>
      {managementOnly ? (
        <View style={styles.headerContainer}>
          <SettingsHeader
            className="px-0 pt-5 pb-1"
            onBack={onBack}
            title={I18n.t('accounts.title')}
            subtitle={I18n.t('accounts.manage_accounts_subtitle')}
            rightAccessory={
              <Button size="icon" onPress={startCreateGroup}>
                <Plus size={18} color="#fff" />
              </Button>
            }
          />
          <View style={styles.headerSpacer} />
        </View>
      ) : null}

      {managementOnly ? (
        groupCards.length === 0 && staticCards.length === 0 ? (
          <EmptyState
            title={I18n.t('accounts.empty_groups_title')}
            message={I18n.t('accounts.empty_groups_message')}
            mascotMood="curious"
          />
        ) : (
          <Animated.ScrollView
            ref={managementScrollRef}
            style={styles.flexContainer}
            contentContainerStyle={[ACCOUNT_MANAGEMENT_LIST_CONTENT_STYLE, listNavInset]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Sortable.Flex
              activeItemScale={1.02}
              activeItemShadowOpacity={0.08}
              customHandle
              dragActivationDelay={0}
              flexDirection="column"
              flexWrap="nowrap"
              gap={spacing.xs}
              inactiveItemOpacity={1}
              onDragEnd={({ fromIndex, order, toIndex }) => {
                if (fromIndex === toIndex) return;
                const orderedIds = order(groupCards)
                  .map((card) => (card.kind === 'group' ? card.group.id : null))
                  .filter((id): id is string => id !== null);
                reorderAccountGroups(orderedIds);
                void triggerHaptic('selection');
              }}
              scrollableRef={managementScrollRef}
              sortEnabled={editingGroupId === null}
              width="fill"
            >
              {groupCards.map(renderGroupCard)}
            </Sortable.Flex>
            {staticCards.length > 0 ? (
              <View style={styles.staticCardsStack}>{staticCards.map(renderGroupCard)}</View>
            ) : null}
          </Animated.ScrollView>
        )
      ) : (
        <>
          <MonthControlsHeader
            title={I18n.t('accounts.title')}
            monthLabel=""
            onPrevMonth={() => {}}
            onNextMonth={() => {}}
            hideNavigation
            showAccent={false}
            actions={
              <>
                {onOpenSettings ? (
                  <Button
                    size="icon"
                    variant="secondary"
                    haptic="selection"
                    className="h-10 w-10 rounded-full"
                    onPress={onOpenSettings}
                  >
                    <Settings size={18} color={themeColors.textMuted} />
                  </Button>
                ) : null}
                {renderBalanceToggleButton()}
              </>
            }
          >
            <AccountsSummaryBlock
              assets={assetsTotal}
              debt={debtTotal}
              net={total}
              themeColors={themeColors}
              renderValue={renderVisibleBalanceNode}
              onPressNetAssets={onOpenNetAssetsInsight}
            />
          </MonthControlsHeader>
          <AccountCardStack
            accounts={accounts}
            accountGroups={accountGroups}
            balanceMap={balanceMap}
            convertedBalanceMap={convertedBalanceMap}
            creditSummaryByAccountId={creditSummaryByAccountId}
            scrollViewRef={accountsOverviewScrollRef}
            settings={settings}
            trueHourlyRate={trueHourlyRate}
            hideBalances={hideAccountBalances}
            onOpenAccount={(id) => {
              void triggerHaptic('selection');
              if (onOpenAccount) {
                onOpenAccount(id);
                return;
              }
              setSelectedAccountId(id);
            }}
            onEditAccount={(id) => {
              void triggerHaptic('selection');
              setEditingAccountId(id);
              setShowEditAccount(true);
            }}
            onPayAccount={(id) => {
              void triggerHaptic('medium');
              setPayCardAccountId(id);
            }}
            onRenderBalanceNode={renderVisibleBalanceNode}
          />
        </>
      )}

      {editingAccount ? (
        <AccountEditorSheet
          visible={showEditAccount}
          account={editingAccount}
          currentBalance={balanceMap.get(editingAccount.id) ?? editingAccount.startingBalance}
          defaultCurrencyCode={settings.currencyCode}
          accountGroups={accountGroups}
          onClose={() => {
            setShowEditAccount(false);
            setEditingAccountId(null);
          }}
          onSave={(updates) => {
            applyAccountSave({
              account: editingAccount,
              currentBalance: balanceMap.get(editingAccount.id) ?? editingAccount.startingBalance,
              updates,
              onComplete: () => {
                setShowEditAccount(false);
                setEditingAccountId(null);
              },
            });
          }}
          onDelete={() => {
            deleteAccount(editingAccount.id);
            setShowEditAccount(false);
            setEditingAccountId(null);
          }}
          onOpenMultiCurrency={onOpenMultiCurrency}
        />
      ) : null}

      {payCardAccountId ? (
        <PayCreditCardSheet
          visible={!!payCardAccountId}
          onClose={() => setPayCardAccountId(null)}
          fromAccounts={accounts.filter((a) => a.id !== payCardAccountId && a.type !== 'credit')}
          accountGroups={accountGroups}
          currencySymbol={settings.currencySymbol}
          defaultAmount={(() => {
            const acc = accountById.get(payCardAccountId);
            if (!acc) return 0;
            const bal = balanceMap.get(payCardAccountId) ?? acc.startingBalance;
            const txns = getTransactionsByAccount(payCardAccountId);
            const { payable } = computeCreditCycleSummary(acc, txns, bal, new Date());
            return payable;
          })()}
          onSubmit={({ fromAccountId, amount, note }) => {
            createTransaction({
              type: 'transfer',
              amount,
              currency: accountById.get(fromAccountId)?.currency ?? settings.currencyCode,
              date: new Date().toISOString(),
              fromAccountId,
              toAccountId: payCardAccountId,
              note,
            });
            setPayCardAccountId(null);
          }}
        />
      ) : null}

      <AccountEditorSheet
        visible={showCreate}
        account={null}
        presetGroupName={createAccountGroupName}
        currentBalance={0}
        defaultCurrencyCode={settings.currencyCode}
        accountGroups={accountGroups}
        onClose={() => {
          setShowCreate(false);
          setCreateAccountGroupName(null);
        }}
        onSave={(input) => {
          createAccount({
            ...input,
            currency: input.currency || DEFAULT_CURRENCY,
          });
          setShowCreate(false);
          setCreateAccountGroupName(null);
        }}
        onOpenMultiCurrency={onOpenMultiCurrency}
      />

      <ThemeModal
        visible={showGroupComposer}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={cancelCreateGroup}
      >
        <SafeAreaView className="flex-1 bg-background">
          <SettingsHeader
            className="px-5 pt-5 pb-2"
            title={I18n.t('accounts.create_group')}
            onClose={cancelCreateGroup}
          />
          <ScrollView
            contentContainerStyle={ACCOUNT_EDITOR_SCROLL_CONTENT_STYLE}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Input
              label={I18n.t('accounts.group_name')}
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder={I18n.t('accounts.create_group_placeholder')}
            />
          </ScrollView>
          <SettingsActionBar
            onCancel={cancelCreateGroup}
            onSave={handleCreateGroup}
            saveDisabled={!canCreateGroup}
          />
        </SafeAreaView>
      </ThemeModal>
    </SettingsPageLayout>,
  );
}
