import { Eye, EyeOff, GripVertical, Pencil, Plus, Settings, Trash2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';
import Animated, { FadeIn } from 'react-native-reanimated';
import { type Edge, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { EdgeSwipeBackContainer } from '~/components/navigation/EdgeSwipeBackContainer';
import {
  Button,
  Input,
  SegmentedToggle,
  SelectField,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsActionBar,
  SettingsHeader,
  SettingsPageLayout,
  SettingsSection,
  Text,
  ThemeModal,
} from '~/components/ui';
import {
  ACCOUNT_TYPE_OPTIONS,
  DEFAULT_CATEGORY_EMOJIS,
  DEFAULT_CURRENCY,
} from '~/constants/appDefaults';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { ActivityTransactionList } from '~/features/transactions/components';
import { AccountPanel, DatePanel } from '~/features/transactions/components/editor';
import { AddTransactionScreen, EditTransactionScreen } from '~/features/transactions/screens';
import { useDebouncedPersistence } from '~/hooks/useDebouncedPersistence';
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
import { formatAmount, formatDateInput, normalizeMoneyAmount } from '~/utils/formatters';

const SNAP_CONFIG = {
  damping: 100,
  stiffness: 800,
  mass: 0.2,
  overshootClamping: true,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};

interface AccountGroupSection {
  id: string;
  label: string;
  accounts: Account[];
}

interface EditAccountSaveInput {
  name: string;
  accountGroup: string | null;
  creditStatementDay: number | null;
  creditDueDay: number | null;
  includeInTotals: boolean;
  targetBalance: number;
}

interface CreditSummary {
  payable: number;
  outstanding: number;
}

type AccountListRow =
  | { kind: 'group'; id: string; label: string }
  | { kind: 'account'; id: string; accountId: string };
type AccountManagementView = 'accounts' | 'groups';

const ACCOUNT_EDITOR_SCROLL_CONTENT_STYLE = {
  paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
} as const;
const ACCOUNT_MANAGEMENT_LIST_CONTENT_STYLE = {
  paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
} as const;
const ACCOUNT_MANAGEMENT_GROUP_LIST_CONTENT_STYLE = {
  paddingTop: 6,
  ...ACCOUNT_MANAGEMENT_LIST_CONTENT_STYLE,
} as const;
const ACCOUNT_BULK_SCROLL_CONTENT_STYLE = {
  padding: SETTINGS_HORIZONTAL_PADDING,
  paddingBottom: SETTINGS_LIST_BOTTOM_PADDING + spacing.xs,
  gap: spacing.sm,
} as const;
const ACCOUNT_PANEL_HEIGHT = 236;
const ACCOUNT_BULK_DATE_PANEL_HEIGHT = 360;
const MASKED_BALANCE_VALUE = '••••';
const DRAGGABLE_LIST_BACK_SWIPE_GUARD = { left: -28 } as const;
const DRAGGABLE_LIST_ACTIVATION_DISTANCE = 12;

const styles = StyleSheet.create({
  rowContainer: {
    paddingBottom: spacing.xxs,
  },
  rowCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
  },
  rowCardActive: {
    opacity: 0.95,
  },
  rowDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  rowTitleWrap: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 13,
  },
  rowSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  rowActionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDragButton: {
    minWidth: 40,
    minHeight: 40,
    padding: spacing.xs,
    marginRight: -2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowEditModeStack: {
    gap: spacing.xs,
    paddingRight: spacing.xxs,
  },
  rowEditModeActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  accountRowPressable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  accountCreditBadge: {
    fontSize: 11,
  },
  headerContainer: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
  },
  selectionOverlay: {
    position: 'absolute',
    top: spacing.xs,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  headerSpacer: {
    height: spacing.xs,
  },
  flexContainer: {
    flex: 1,
  },
  groupedSectionHeader: {
    paddingLeft: spacing.xxs,
    paddingRight: spacing.sm,
    paddingBottom: spacing.xxs,
  },
  groupedSectionHeaderFirst: {
    paddingTop: 6,
  },
  groupedSectionHeaderRest: {
    paddingTop: spacing.sm,
  },
  groupedSectionLabel: {
    fontSize: 11,
  },
  bulkDatePanel: {
    height: ACCOUNT_BULK_DATE_PANEL_HEIGHT,
  },
  accountPanel: {
    height: ACCOUNT_PANEL_HEIGHT,
  },
  floatingAddButtonContainer: {
    position: 'absolute',
    right: SETTINGS_HORIZONTAL_PADDING,
    zIndex: 25,
  },
  floatingAddButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
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

function isNegativeForDisplay(value: number) {
  return normalizeMoneyAmount(value) < 0;
}

function AddAccountSheet({
  visible,
  onClose,
  onCreate,
  accountGroups,
  currencySymbol,
}: {
  visible: boolean;
  onClose: () => void;
  accountGroups: AccountGroup[];
  currencySymbol: string;
  onCreate: (input: {
    name: string;
    type: AccountType;
    accountGroup: string | null;
    creditStatementDay: number | null;
    creditDueDay: number | null;
    icon: string;
    color: string;
    startingBalance: number;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('debit');
  const [accountGroupId, setAccountGroupId] = useState<string>('none');
  const [icon, setIcon] = useState('🏦');
  const [color, setColor] = useState<string>('#1F8A6F');
  const [startingBalance, setStartingBalance] = useState('0');
  const [creditStatementDay, setCreditStatementDay] = useState('25');
  const [creditDueDay, setCreditDueDay] = useState('1');
  const accountGroupNameById = useMemo(
    () => new Map(accountGroups.map((group) => [group.id, group.name])),
    [accountGroups],
  );
  const accountGroupOptions = useMemo(
    () => [
      { value: 'none', label: I18n.t('common.ungrouped') },
      ...accountGroups.map((group) => ({ value: group.id, label: group.name })),
    ],
    [accountGroups],
  );
  const canSave = name.trim().length > 0;

  const handleCreate = () => {
    if (!canSave) return;
    const parsedStatementDay = Number(creditStatementDay);
    const parsedDueDay = Number(creditDueDay);
    const normalizedStatementDay =
      Number.isInteger(parsedStatementDay) && parsedStatementDay >= 1 && parsedStatementDay <= 31
        ? parsedStatementDay
        : null;
    const normalizedDueDay =
      Number.isInteger(parsedDueDay) && parsedDueDay >= 1 && parsedDueDay <= 31
        ? parsedDueDay
        : null;
    onCreate({
      name: name.trim(),
      type,
      accountGroup:
        accountGroupId === 'none' ? null : (accountGroupNameById.get(accountGroupId) ?? null),
      creditStatementDay: type === 'credit' ? normalizedStatementDay : null,
      creditDueDay: type === 'credit' ? normalizedDueDay : null,
      icon: icon || '🏦',
      color: color || '#1F8A6F',
      startingBalance: Number(startingBalance) || 0,
    });
    setName('');
    setType('debit');
    setAccountGroupId('none');
    setIcon('🏦');
    setColor('#1F8A6F');
    setStartingBalance('0');
    setCreditStatementDay('25');
    setCreditDueDay('1');
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
          title={I18n.t('accounts.new_account')}
          onClose={onClose}
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
            <View className="gap-2">
              <SelectField
                label={I18n.t('accounts.account_group')}
                value={accountGroupId}
                onChange={setAccountGroupId}
                options={accountGroupOptions}
              />
            </View>
            <View>
              <Text variant="label" tone="muted" className="mb-2">
                {I18n.t('accounts.type')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {ACCOUNT_TYPE_OPTIONS.map((item) => (
                  <Pressable
                    key={item.value}
                    onPress={() => {
                      void triggerHaptic('selection');
                      setType(item.value);
                      setIcon(item.icon);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: type === item.value }}
                    className={cn(
                      'px-4 py-2.5 rounded-full border',
                      type === item.value
                        ? 'bg-primary/15 border-primary/50'
                        : 'bg-card border-border/40',
                    )}
                  >
                    <Text
                      variant="caption"
                      className={cn(type === item.value ? 'text-primary' : 'text-muted-foreground')}
                    >
                      {item.icon} {item.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {type === 'credit' ? (
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

            <View className="flex-row gap-2">
              <View className="flex-1">
                <Input label={I18n.t('categories.color')} value={color} onChangeText={setColor} />
              </View>
            </View>

            <View>
              <Text variant="label" tone="muted" className="mb-2">
                {I18n.t('categories.emoji')}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {DEFAULT_CATEGORY_EMOJIS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    onPress={() => {
                      void triggerHaptic('selection');
                      setIcon(emoji);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${I18n.t('categories.emoji')} ${emoji}`}
                    accessibilityState={{ selected: icon === emoji }}
                    className={cn(
                      'h-11 w-11 rounded-full border items-center justify-center',
                      icon === emoji
                        ? 'bg-primary/15 border-primary/50'
                        : 'bg-card border-border/40',
                    )}
                  >
                    <Text className={cn(icon === emoji ? '' : 'opacity-80')}>{emoji}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Input
              label={I18n.t('accounts.starting_balance')}
              variant="currency"
              currencySymbol={currencySymbol}
              value={startingBalance}
              onChangeText={setStartingBalance}
            />
          </View>
        </ScrollView>
        <SettingsActionBar onCancel={onClose} onSave={handleCreate} saveDisabled={!canSave} />
      </SafeAreaView>
    </ThemeModal>
  );
}

function EditAccountSheet({
  visible,
  account,
  currentBalance,
  currencySymbol,
  accountGroups,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  account: Account;
  currentBalance: number;
  currencySymbol: string;
  accountGroups: AccountGroup[];
  onClose: () => void;
  onSave: (updates: EditAccountSaveInput) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(account.name);
  const [accountGroupId, setAccountGroupId] = useState<string>('none');
  const [includeInTotals, setIncludeInTotals] = useState(account.includeInTotals);
  const [balanceInput, setBalanceInput] = useState(() => toBalanceInputValue(currentBalance));
  const [creditStatementDay, setCreditStatementDay] = useState(
    String(account.creditStatementDay ?? '25'),
  );
  const [creditDueDay, setCreditDueDay] = useState(String(account.creditDueDay ?? '1'));
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
    setName(account.name);
    const matchedGroupId = account.accountGroup
      ? (accountGroupIdByName.get(account.accountGroup) ?? 'none')
      : 'none';
    setAccountGroupId(matchedGroupId);
    setIncludeInTotals(account.includeInTotals);
    setBalanceInput(toBalanceInputValue(currentBalance));
    setCreditStatementDay(String(account.creditStatementDay ?? '25'));
    setCreditDueDay(String(account.creditDueDay ?? '1'));
  }, [account, accountGroupIdByName, currentBalance, visible]);

  const normalizedName = name.trim();
  const parsedTargetBalance = Number(balanceInput);
  const hasValidBalance = balanceInput.trim().length > 0 && Number.isFinite(parsedTargetBalance);
  const canSave = normalizedName.length > 0 && hasValidBalance;

  const handleSave = () => {
    if (!canSave || !Number.isFinite(parsedTargetBalance)) return;
    const parsedStatementDay = Number(creditStatementDay);
    const parsedDueDay = Number(creditDueDay);
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
      accountGroup:
        accountGroupId === 'none' ? null : (accountGroupNameById.get(accountGroupId) ?? null),
      creditStatementDay: account.type === 'credit' ? normalizedStatementDay : null,
      creditDueDay: account.type === 'credit' ? normalizedDueDay : null,
      includeInTotals,
      targetBalance: parsedTargetBalance,
    });
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
          title={I18n.t('accounts.edit_account')}
          onClose={onClose}
        />
        <ScrollView contentContainerStyle={ACCOUNT_EDITOR_SCROLL_CONTENT_STYLE}>
          <View className="gap-4">
            <Input
              label={I18n.t('accounts.account_name')}
              value={name}
              onChangeText={setName}
              placeholder={I18n.t('accounts.account_name_placeholder')}
            />
            <Input
              label={I18n.t('accounts.current_balance')}
              variant="currency"
              currencySymbol={currencySymbol}
              value={balanceInput}
              onChangeText={setBalanceInput}
              helperText={I18n.t('accounts.current_balance_hint')}
            />
            <SelectField
              label={I18n.t('accounts.account_group')}
              value={accountGroupId}
              onChange={setAccountGroupId}
              options={accountGroupOptions}
            />
            <View className="gap-2">
              <Text variant="label" tone="muted">
                {I18n.t('accounts.include_in_totals')}
              </Text>
              <SegmentedToggle
                value={includeInTotals ? 'include' : 'hide'}
                onChange={(value) => setIncludeInTotals(value === 'include')}
                options={[
                  { value: 'include', label: I18n.t('accounts.include_option_include') },
                  { value: 'hide', label: I18n.t('accounts.include_option_hide') },
                ]}
              />
              <Text variant="label" tone="muted" className="px-1">
                {I18n.t('accounts.include_in_totals_hint')}
              </Text>
            </View>
            {account.type === 'credit' ? (
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
          </View>

          <SettingsSection className="mt-6" title={I18n.t('settings.danger_zone')} danger>
            <Pressable
              onPress={() => {
                void triggerHaptic('warning');
                onDelete();
              }}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('accounts.delete_account')}
              className="self-start rounded-full border border-destructive/30 bg-destructive/8 px-3 py-2"
            >
              <Text variant="caption" className="text-destructive">
                {I18n.t('accounts.delete_account')}
              </Text>
            </Pressable>
          </SettingsSection>
        </ScrollView>
        <SettingsActionBar onCancel={onClose} onSave={handleSave} saveDisabled={!canSave} />
      </SafeAreaView>
    </ThemeModal>
  );
}

function clampStatementDate(year: number, month: number, day: number) {
  const last = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(Math.max(day, 1), last));
}

function getNextByDay(day: number, from: Date) {
  const thisMonth = clampStatementDate(from.getFullYear(), from.getMonth(), day);
  if (thisMonth.getTime() > from.getTime()) return thisMonth;
  return clampStatementDate(from.getFullYear(), from.getMonth() + 1, day);
}

function getCurrentStatementStart(statementDay: number, now: Date) {
  const thisMonth = clampStatementDate(now.getFullYear(), now.getMonth(), statementDay);
  if (thisMonth.getTime() <= now.getTime()) return thisMonth;
  return clampStatementDate(now.getFullYear(), now.getMonth() - 1, statementDay);
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
  const currentCycleStartIso = getCurrentStatementStart(
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

function defaultCreditSummary(balance: number): CreditSummary {
  return { payable: 0, outstanding: Math.max(0, balance) };
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
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState(I18n.t('accounts.credit_payment_note'));
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
              <View
                className="rounded-[18px] border border-border/30 bg-card/35 overflow-hidden"
                style={styles.accountPanel}
              >
                <AccountPanel
                  accounts={fromAccounts}
                  accountGroups={accountGroups}
                  selectedId={fromAccountId}
                  onSelect={setFromAccountId}
                />
              </View>
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
    </ThemeModal>
  );
}

// Module-level callbacks for Row — avoids hooks/closures inside renderItem
let _acctThemeColors: {
  surface: string;
  surfaceMuted: string;
  textMuted: string;
  coral: string;
  text: string;
  error: string;
  errorSoft: string;
} | null = null;
let _acctEditingGroupId: string | null = null;
let _acctEditingGroupName: string = '';
let _acctOnEditingNameChange: ((v: string) => void) | null = null;
let _acctOnSaveGroup: ((id: string) => void) | null = null;
let _acctOnCancelEditGroup: (() => void) | null = null;
let _acctOnStartEditGroup: ((item: AccountGroup) => void) | null = null;
let _acctOnDeleteGroup: ((item: AccountGroup) => void) | null = null;
let _acctAccountCountByGroupName: Map<string, number> = new Map();
let _acctOnAccountPress: ((account: Account) => void) | null = null;
let _acctCreditLabel: string = '';

// IMPORTANT: Only inline `style` props inside renderItem — className/NativeWind causes freezes with DraggableFlatList
function GroupRowItem({ item, drag, isActive }: RenderItemParams<AccountGroup>) {
  const tc = _acctThemeColors!;
  const isEditing = _acctEditingGroupId === item.id;
  const groupAccountCount = _acctAccountCountByGroupName.get(item.name.trim()) ?? 0;

  return (
    <View style={styles.rowContainer}>
      <View
        style={[
          styles.rowCard,
          isActive ? styles.rowCardActive : null,
          {
            borderColor: isActive ? tc.textMuted : 'rgba(0,0,0,0.08)',
            backgroundColor: isActive ? tc.surfaceMuted : tc.surface,
          },
        ]}
      >
        {isEditing ? (
          <View style={styles.rowEditModeStack}>
            <Input
              value={_acctEditingGroupName}
              onChangeText={_acctOnEditingNameChange ?? (() => {})}
              placeholder={I18n.t('accounts.group_name')}
            />
            <View style={styles.rowEditModeActions}>
              <Button size="sm" className="flex-1" onPress={() => _acctOnSaveGroup?.(item.id)}>
                <Text>{I18n.t('common.save')}</Text>
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onPress={() => _acctOnCancelEditGroup?.()}
              >
                <Text>{I18n.t('common.cancel')}</Text>
              </Button>
            </View>
          </View>
        ) : (
          <View style={styles.rowDisplay}>
            <View style={styles.rowTitleWrap}>
              <Text style={[styles.rowTitle, { color: tc.text }]}>{item.name}</Text>
              <Text style={[styles.rowSubtitle, { color: tc.textMuted }]}>
                {I18n.t('accounts.group_accounts_count', { count: groupAccountCount })}
              </Text>
            </View>
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                _acctOnStartEditGroup?.(item);
              }}
              hitSlop={4}
              style={[styles.rowActionButton, { backgroundColor: 'rgba(0,0,0,0.05)' }]}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.edit')}
            >
              <Pencil size={11} color={tc.textMuted} />
            </Pressable>
            <Pressable
              onPress={() => {
                void triggerHaptic('warning');
                _acctOnDeleteGroup?.(item);
              }}
              hitSlop={4}
              style={[styles.rowActionButton, { backgroundColor: 'rgba(255,0,0,0.06)' }]}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.delete')}
            >
              <Trash2 size={11} color={tc.coral} />
            </Pressable>
            <Pressable
              onLongPress={drag}
              delayLongPress={100}
              disabled={isActive}
              hitSlop={8}
              style={styles.rowDragButton}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('accounts.reorder_groups')}
            >
              <GripVertical size={16} color={tc.textMuted} />
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

interface AccountMgmtAccountItem {
  id: string;
  account: Account;
}

function AccountMgmtRowItem({ item, drag, isActive }: RenderItemParams<AccountMgmtAccountItem>) {
  const tc = _acctThemeColors!;
  const account = item.account;
  const isCredit = account.type === 'credit';

  return (
    <View style={styles.rowContainer}>
      <View
        style={[
          styles.rowCard,
          isActive ? styles.rowCardActive : null,
          styles.rowDisplay,
          {
            borderColor: isCredit
              ? isActive
                ? tc.coral
                : 'rgba(255,0,0,0.12)'
              : isActive
                ? tc.textMuted
                : 'rgba(0,0,0,0.08)',
            backgroundColor: isCredit
              ? isActive
                ? tc.errorSoft
                : 'rgba(255,0,0,0.03)'
              : isActive
                ? tc.surfaceMuted
                : tc.surface,
          },
        ]}
      >
        <Pressable
          onPress={() => _acctOnAccountPress?.(account)}
          disabled={isActive}
          style={styles.accountRowPressable}
          accessibilityRole="button"
          accessibilityLabel={account.name}
        >
          <View style={styles.rowTitleWrap}>
            <Text style={[styles.rowTitle, { color: tc.text }]} numberOfLines={1}>
              {account.name}
            </Text>
          </View>
          {isCredit ? (
            <Text style={[styles.accountCreditBadge, { color: tc.error }]}>{_acctCreditLabel}</Text>
          ) : null}
        </Pressable>
        <Pressable
          onLongPress={drag}
          delayLongPress={100}
          disabled={isActive}
          hitSlop={8}
          style={styles.rowDragButton}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('accounts.reorder_accounts')}
        >
          <GripVertical size={16} color={tc.textMuted} />
        </Pressable>
      </View>
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
  onOpenTransaction?: (transaction: TransactionWithRelations) => void;
  onOpenSettings?: () => void;
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
  onOpenTransaction,
  onOpenSettings,
  useNativeBackGesture = false,
  safeAreaEdges = ['top'],
}: AccountsScreenProps = {}) {
  const themeColors = useThemeColors();
  const safeAreaInsets = useSafeAreaInsets();
  const { persistOrder } = useDebouncedPersistence(500);
  const {
    accountGroups,
    accounts,
    accountBalances,
    transactions,
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
    updateTransactionsBulk,
  } = useApp();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(accountId);
  const [hideAccountBalances, setHideAccountBalances] = useState(false);
  const [managementView, setManagementView] = useState<AccountManagementView>('accounts');
  const [showCreate, setShowCreate] = useState(false);
  const [showGroupComposer, setShowGroupComposer] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [showPayCard, setShowPayCard] = useState(false);
  const [showEditAccount, setShowEditAccount] = useState(false);
  const [addTransactionAccountId, setAddTransactionAccountId] = useState<string | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithRelations | null>(
    null,
  );
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkDate, setBulkDate] = useState(() => formatDateInput(new Date()));
  const [bulkDateTouched, setBulkDateTouched] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  const [bulkNoteTouched, setBulkNoteTouched] = useState(false);
  const [isReordering, setIsReordering] = useState(false);
  const accountsListRef = useRef<FlatList<AccountListRow> | null>(null);
  const detailScrollToTopRef = useRef<(() => void) | null>(null);
  const skipNextAccountGroupsSyncRef = useRef(false);
  const skipNextAccountSectionsSyncRef = useRef(false);
  const [localAccountGroups, setLocalAccountGroups] = useState<AccountGroup[]>(() => accountGroups);
  const [localAccountGroupSections, setLocalAccountGroupSections] = useState<AccountGroupSection[]>(
    [],
  );
  const transactionDisplaySettings = useMemo(
    () => ({
      currencySymbol: settings.currencySymbol,
      displayMode: settings.displayMode,
      hourRounding: settings.hourRounding,
    }),
    [settings.currencySymbol, settings.displayMode, settings.hourRounding],
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
          hourRounding: settings.hourRounding,
        },
        { showSign: false, trueHourlyRate: 0 },
      ),
    [normalizedSelectedTransactionTotal, settings.currencySymbol, settings.hourRounding],
  );
  const selectedTransactionTotalToneClass =
    normalizedSelectedTransactionTotal > 0
      ? 'text-success'
      : normalizedSelectedTransactionTotal < 0
        ? 'text-destructive'
        : 'text-muted-foreground';
  const hasBulkChanges = bulkDateTouched || bulkNoteTouched;
  const isManagementGroupsView = managementOnly && managementView === 'groups';
  const trueHourlyRate = currentMonthWage?.trueHourlyRate ?? 0;
  const balanceToggleLabel = hideAccountBalances
    ? I18n.t('accounts.show_balances')
    : I18n.t('accounts.hide_balances');

  const handleToggleAccountBalances = useCallback(() => {
    setHideAccountBalances((previous) => !previous);
  }, []);

  const formatVisibleBalance = useCallback(
    (amount: number) => {
      if (hideAccountBalances) return MASKED_BALANCE_VALUE;
      return formatAmount(normalizeMoneyAmount(amount), settings, {
        showSign: false,
        trueHourlyRate,
      });
    },
    [hideAccountBalances, settings, trueHourlyRate],
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

  const handleManagementViewChange = useCallback((nextView: AccountManagementView) => {
    setIsReordering(false);
    setManagementView(nextView);
    setShowGroupComposer(false);
    setNewGroupName('');
    setEditingGroupId(null);
    setEditingGroupName('');
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
    if (selectedAccount) return;
    setShowEditAccount(false);
  }, [selectedAccount]);

  useEffect(() => {
    setSelectedTransaction(null);
    setSelectedTransactionIds([]);
    setShowBulkUpdate(false);
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
    setIsReordering(false);
  }, [activeAccountId, managementOnly, selectedTransaction]);

  useEffect(() => {
    if (resetToRootToken <= 0) return;
    setSelectedAccountId(accountId ?? null);
    setManagementView('accounts');
    setShowCreate(false);
    setShowGroupComposer(false);
    setNewGroupName('');
    setEditingGroupId(null);
    setEditingGroupName('');
    setShowPayCard(false);
    setShowEditAccount(false);
  }, [accountId, resetToRootToken]);

  useEffect(() => {
    if (scrollToTopToken <= 0) return;
    const frame = requestAnimationFrame(() => {
      if (!managementOnly && activeAccountId && selectedAccount) {
        detailScrollToTopRef.current?.();
        return;
      }
      if (isManagementGroupsView) {
        return;
      }
      accountsListRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [isManagementGroupsView, managementOnly, scrollToTopToken, activeAccountId, selectedAccount]);

  const balanceMap = useMemo(() => {
    return new Map(accountBalances.map((item) => [item.accountId, item.balance]));
  }, [accountBalances]);

  const total = useMemo(() => {
    if (managementOnly) return 0;
    const sum = accounts.reduce((runningTotal, account) => {
      if (!account.includeInTotals) return runningTotal;
      const balance = balanceMap.get(account.id) ?? account.startingBalance;
      const signedBalance = account.type === 'credit' ? -balance : balance;
      return runningTotal + signedBalance;
    }, 0);
    return normalizeMoneyAmount(sum);
  }, [accounts, balanceMap, managementOnly]);
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
  const { accountGroupSections, accountCountByGroupName, groupedAccounts } = useMemo(() => {
    const groupNames = new Set<string>();
    accountGroups.forEach((group) => {
      groupNames.add(group.name);
    });

    const buckets = new Map<string, Account[]>();
    const counts = new Map<string, number>();

    accounts.forEach((account) => {
      const groupName = account.accountGroup?.trim() ?? '';
      if (groupName) {
        counts.set(groupName, (counts.get(groupName) ?? 0) + 1);
      }

      const bucketKey = groupName || '__ungrouped__';
      const bucket = buckets.get(bucketKey);
      if (bucket) {
        bucket.push(account);
      } else {
        buckets.set(bucketKey, [account]);
      }
    });

    const sections: AccountGroupSection[] = [];
    // Named groups in accountGroups sort order
    for (const group of accountGroups) {
      const list = buckets.get(group.name);
      if (list && list.length > 0) {
        sections.push({ id: group.id, label: group.name, accounts: list });
      }
    }
    // Unknown group names (not in accountGroups)
    for (const [key, list] of buckets) {
      if (key === '__ungrouped__' || groupNames.has(key)) continue;
      sections.push({ id: `group-${key}`, label: key, accounts: list });
    }
    // Ungrouped last
    const ungrouped = buckets.get('__ungrouped__');
    if (ungrouped && ungrouped.length > 0) {
      sections.push({
        id: 'group-ungrouped',
        label: String(I18n.t('common.ungrouped')),
        accounts: ungrouped,
      });
    }

    const rows: AccountListRow[] = [];
    sections.forEach((section) => {
      rows.push({ kind: 'group', id: section.id, label: section.label });
      section.accounts.forEach((account) => {
        rows.push({ kind: 'account', id: `a-${account.id}`, accountId: account.id });
      });
    });

    return {
      accountGroupSections: sections,
      accountCountByGroupName: counts,
      groupedAccounts: rows,
    };
  }, [accounts, accountGroups]);
  useEffect(() => {
    if (isReordering) return;
    if (skipNextAccountGroupsSyncRef.current) {
      skipNextAccountGroupsSyncRef.current = false;
      return;
    }
    setLocalAccountGroups(accountGroups);
  }, [accountGroups, isReordering]);

  useEffect(() => {
    if (isReordering) return;
    if (skipNextAccountSectionsSyncRef.current) {
      skipNextAccountSectionsSyncRef.current = false;
      return;
    }
    setLocalAccountGroupSections(accountGroupSections);
  }, [accountGroupSections, isReordering]);

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
    void triggerHaptic('selection');
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
      updates: EditAccountSaveInput;
      onComplete: () => void;
    }) => {
      const accountUpdates = {
        name: updates.name,
        accountGroup: updates.accountGroup,
        creditStatementDay: updates.creditStatementDay,
        creditDueDay: updates.creditDueDay,
        includeInTotals: updates.includeInTotals,
      };
      const delta = updates.targetBalance - currentBalance;
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
                currency: settings.currencySymbol,
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
                currency: settings.currencySymbol,
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
    [createTransaction, currentMonthWage?.trueHourlyRate, settings, updateAccount],
  );
  const handleAccountManagementPress = useCallback((account: Account) => {
    void triggerHaptic('selection');
    setSelectedAccountId(account.id);
    setShowEditAccount(true);
  }, []);
  const handleAddTransactionForAccount = useCallback((accountId: string) => {
    setAddTransactionAccountId(accountId);
  }, []);
  const creditLabel = String(I18n.t('accounts.credit'));

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
    const normalizedBalance = normalizeMoneyAmount(balance);
    const txns = selectedAccountTransactions;
    const payFromAccounts = accounts.filter(
      (item) => item.id !== account.id && item.type !== 'credit',
    );
    const now = new Date();
    const statementDay = account.creditStatementDay ?? null;
    const dueDay = account.creditDueDay ?? null;
    const nextDue = dueDay ? getNextByDay(dueDay, now) : null;
    const { outstanding, payable: cyclePayable } = computeCreditCycleSummary(
      account,
      txns,
      balance,
      now,
    );
    const accountGroupLabel = account.accountGroup?.trim() || String(I18n.t('common.ungrouped'));
    const includeInTotalsLabel = account.includeInTotals
      ? I18n.t('accounts.include_option_include')
      : I18n.t('accounts.include_option_hide');

    return withBackGesture(
      <SettingsPageLayout edges={safeAreaEdges}>
        <View className="flex-1">
          <View style={styles.headerContainer}>
            <SettingsHeader
              className="px-0 pt-5 pb-2"
              onBack={isSelectionMode ? clearSelection : closeSelectedAccount}
              title={I18n.t('accounts.title')}
              subtitleNode={
                <Text variant="friendly" tone="muted" numberOfLines={1}>
                  {account.name}
                </Text>
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
            <View pointerEvents="box-none" style={styles.selectionOverlay}>
              <View style={styles.headerContainer}>
                <View className="rounded-2xl bg-card border border-border/40 px-3 py-2.5 flex-row items-center justify-between gap-2">
                  <Pressable
                    onPress={clearSelection}
                    className="rounded-full bg-secondary/70 px-3 py-1.5 active:opacity-85"
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
                      <View className="rounded-full border border-border/35 bg-secondary/70 px-2 py-[3px]">
                        <Text variant="label" className={selectedTransactionTotalToneClass}>
                          {selectedTransactionTotalLabel}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View className="flex-row items-center gap-2">
                    <Pressable
                      onPress={handleOpenBulkUpdate}
                      className="h-9 w-9 rounded-full bg-primary/12 border border-primary/35 items-center justify-center active:opacity-85"
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('transactions.selection.update')}
                      hitSlop={8}
                    >
                      <Pencil size={14} color={themeColors.primary} />
                    </Pressable>
                    <Pressable
                      onPress={handleDeleteSelectedTransactions}
                      className="h-9 w-9 rounded-full bg-destructive/10 border border-destructive/35 items-center justify-center active:opacity-85"
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('common.delete')}
                      hitSlop={8}
                    >
                      <Trash2 size={14} color={themeColors.coral} />
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          <ActivityTransactionList
            transactions={txns}
            displaySettings={transactionDisplaySettings}
            getDisplayValueForTransaction={getDisplayValueForTransaction}
            getTrueHourlyRateForDate={getTrueHourlyRateForDate}
            onTransactionPress={handleTransactionPress}
            onTransactionLongPress={handleTransactionLongPress}
            selectedTransactionIds={selectedTransactionIds}
            selectionMode={isSelectionMode}
            emptyTitle={I18n.t('accounts.empty_transactions_title')}
            emptyMessage={I18n.t('accounts.empty_transactions_message')}
            contentPaddingBottom={SETTINGS_FORM_BOTTOM_PADDING}
            contentPaddingHorizontal={SETTINGS_HORIZONTAL_PADDING}
            contentPaddingTop={0}
            disableItemAnimations
            compactItems
            scrollToTopRef={detailScrollToTopRef}
            listHeaderComponent={
              <View className="pb-2 gap-2">
                <View className="gap-1.5 px-1 py-1">
                  <View className="flex-row items-center justify-between gap-3 border-b border-border/25 py-2">
                    <Text variant="label" tone="muted">
                      {I18n.t('accounts.balance')}
                    </Text>
                    <Text
                      variant="friendly"
                      className={isNegativeForDisplay(normalizedBalance) ? 'text-destructive' : 'text-foreground'}
                    >
                      {formatVisibleBalance(normalizedBalance)}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between gap-3 border-b border-border/25 py-2">
                    <Text variant="label" tone="muted">
                      {I18n.t('accounts.account_group')}
                    </Text>
                    <Text variant="friendly" numberOfLines={1} className="flex-1 text-right">
                      {accountGroupLabel}
                    </Text>
                  </View>
                  <View className="flex-row items-center justify-between gap-3 py-2">
                    <Text variant="label" tone="muted">
                      {I18n.t('accounts.include_in_totals')}
                    </Text>
                    <Text
                      variant="friendly"
                      className={account.includeInTotals ? 'text-success' : 'text-muted-foreground'}
                    >
                      {includeInTotalsLabel}
                    </Text>
                  </View>
                </View>

                {account.type === 'credit' ? (
                  <View className="gap-2.5">
                    <View className="rounded-[18px] border border-border/35 bg-card px-4 py-3">
                      <Text variant="label" tone="muted">
                        {I18n.t('accounts.billing')}
                      </Text>
                      <Text variant="caption" className="mt-1">
                        {I18n.t('accounts.statement_due', {
                          statementDay: statementDay ?? '-',
                          dueDay: dueDay ?? '-',
                        })}
                      </Text>
                      <Text variant="label" tone="muted" className="mt-1.5">
                        {I18n.t('accounts.next_due', {
                          date: nextDue
                            ? nextDue.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })
                            : '-',
                        })}
                      </Text>
                      <View className="mt-2.5 flex-row items-center gap-2">
                        <View className="flex-1 rounded-[14px] border border-border/30 bg-background px-3 py-2">
                          <Text variant="label" tone="muted">
                            {I18n.t('accounts.payable')}
                          </Text>
                          <Text variant="caption" className="mt-0.5 text-destructive">
                            {formatVisibleBalance(cyclePayable)}
                          </Text>
                        </View>
                        <View className="flex-1 rounded-[14px] border border-border/30 bg-background px-3 py-2">
                          <Text variant="label" tone="muted">
                            {I18n.t('accounts.outstanding')}
                          </Text>
                          <Text variant="caption" className="mt-0.5 text-destructive">
                            {formatVisibleBalance(outstanding)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Button variant="secondary" onPress={() => setShowPayCard(true)}>
                      <Text>{I18n.t('accounts.pay_this_card')}</Text>
                    </Button>
                  </View>
                ) : null}
              </View>
            }
          />
          {!isSelectionMode ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.floatingAddButtonContainer,
                { bottom: safeAreaInsets.bottom + spacing.sm },
              ]}
            >
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
          ) : null}
        </View>
        <EditAccountSheet
          visible={showEditAccount}
          account={account}
          currentBalance={balance}
          currencySymbol={settings.currencySymbol}
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
            setShowEditAccount(false);
            closeSelectedAccount();
          }}
        />
        <PayCreditCardSheet
          visible={showPayCard}
          onClose={() => setShowPayCard(false)}
          fromAccounts={payFromAccounts}
          accountGroups={accountGroups}
          currencySymbol={settings.currencySymbol}
          defaultAmount={cyclePayable}
          onSubmit={({ fromAccountId, amount, note }) => {
            createTransaction({
              type: 'transfer',
              amount,
              currency: settings.currencySymbol,
              date: new Date().toISOString(),
              fromAccountId,
              toAccountId: account.id,
              note,
            });
            setShowPayCard(false);
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

            <ScrollView
              className="flex-1"
              contentContainerStyle={ACCOUNT_BULK_SCROLL_CONTENT_STYLE}
            >
              <View className="gap-2.5">
                <Text variant="caption" tone="muted">
                  {I18n.t('transactions.editor.date')}
                </Text>
                <View
                  className="rounded-[18px] border border-border/30 bg-card/35 overflow-hidden"
                  style={styles.bulkDatePanel}
                >
                  <DatePanel
                    value={bulkDate}
                    onSelect={(value) => {
                      setBulkDate(value);
                      setBulkDateTouched(true);
                    }}
                  />
                </View>
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
          </SafeAreaView>
        </ThemeModal>
      </SettingsPageLayout>,
    );
  }

  // Set module-level callbacks for row components
  _acctThemeColors = themeColors;
  _acctEditingGroupId = editingGroupId;
  _acctEditingGroupName = editingGroupName;
  _acctOnEditingNameChange = setEditingGroupName;
  _acctOnSaveGroup = saveEditedGroup;
  _acctOnCancelEditGroup = cancelEditGroup;
  _acctOnStartEditGroup = startEditGroup;
  _acctOnDeleteGroup = handleDeleteGroup;
  _acctAccountCountByGroupName = accountCountByGroupName;
  _acctOnAccountPress = handleAccountManagementPress;
  _acctCreditLabel = creditLabel;

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
              <Button
                size="icon"
                onPress={() => {
                  if (isManagementGroupsView) {
                    startCreateGroup();
                  } else {
                    setShowCreate(true);
                  }
                }}
              >
                <Plus size={18} color="#fff" />
              </Button>
            }
          />
          <SegmentedToggle
            value={managementView}
            onChange={handleManagementViewChange}
            options={[
              { value: 'accounts', label: I18n.t('accounts.title') },
              { value: 'groups', label: I18n.t('accounts.groups') },
            ]}
          />
          {isManagementGroupsView && showGroupComposer ? (
            <View className="rounded-2xl border border-border/35 bg-card p-3 gap-2.5 mt-2">
              <Input
                label={I18n.t('accounts.create_group')}
                value={newGroupName}
                onChangeText={setNewGroupName}
                placeholder={I18n.t('accounts.create_group_placeholder')}
              />
              <View className="flex-row items-center gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onPress={handleCreateGroup}
                  disabled={!canCreateGroup}
                >
                  <Text>{I18n.t('accounts.create_group')}</Text>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1"
                  onPress={cancelCreateGroup}
                >
                  <Text>{I18n.t('common.cancel')}</Text>
                </Button>
              </View>
            </View>
          ) : null}
          <View style={styles.headerSpacer} />
        </View>
      ) : null}

      {isManagementGroupsView ? (
        <>
          {localAccountGroups.length === 0 ? (
            <EmptyState
              title={I18n.t('accounts.empty_groups_title')}
              message={I18n.t('accounts.empty_groups_message')}
              mascotMood="curious"
            />
          ) : (
            <View style={styles.flexContainer}>
              <DraggableFlatList
                data={localAccountGroups}
                keyExtractor={(item: AccountGroup) => item.id}
                renderItem={GroupRowItem}
                extraData={`${editingGroupId}-${editingGroupName}`}
                dragHitSlop={DRAGGABLE_LIST_BACK_SWIPE_GUARD}
                activationDistance={DRAGGABLE_LIST_ACTIVATION_DISTANCE}
                animationConfig={SNAP_CONFIG}
                onDragBegin={() => {
                  setIsReordering(true);
                  void triggerHaptic('medium');
                }}
                onRelease={() => {
                  setIsReordering(false);
                }}
                onDragEnd={({ data }: { data: AccountGroup[] }) => {
                  setIsReordering(false);
                  void triggerHaptic('light');
                  skipNextAccountGroupsSyncRef.current = true;
                  setLocalAccountGroups(data);
                  const ids = data.map((g) => g.id);
                  persistOrder('account_groups', ids);
                  reorderAccountGroups(ids);
                }}
                autoscrollThreshold={80}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={ACCOUNT_MANAGEMENT_GROUP_LIST_CONTENT_STYLE}
              />
            </View>
          )}
        </>
      ) : managementOnly ? (
        <ScrollView
          style={styles.flexContainer}
          contentContainerStyle={ACCOUNT_MANAGEMENT_LIST_CONTENT_STYLE}
          showsVerticalScrollIndicator={false}
        >
          {localAccountGroupSections.map((section, sectionIndex) => (
            <View key={section.id}>
              <View
                style={[
                  styles.groupedSectionHeader,
                  sectionIndex === 0
                    ? styles.groupedSectionHeaderFirst
                    : styles.groupedSectionHeaderRest,
                ]}
              >
                <Text style={[styles.groupedSectionLabel, { color: themeColors.textMuted }]}>
                  {section.label}
                </Text>
              </View>
              <DraggableFlatList
                data={section.accounts.map((acc) => ({ id: acc.id, account: acc }))}
                keyExtractor={(item) => item.id}
                renderItem={AccountMgmtRowItem}
                dragHitSlop={DRAGGABLE_LIST_BACK_SWIPE_GUARD}
                activationDistance={DRAGGABLE_LIST_ACTIVATION_DISTANCE}
                animationConfig={SNAP_CONFIG}
                scrollEnabled={false}
                showsVerticalScrollIndicator={false}
                onDragBegin={() => {
                  setIsReordering(true);
                  void triggerHaptic('medium');
                }}
                onRelease={() => {
                  setIsReordering(false);
                }}
                onDragEnd={({ data: newData }: { data: AccountMgmtAccountItem[] }) => {
                  setIsReordering(false);
                  void triggerHaptic('light');
                  const updatedSections = localAccountGroupSections.map((s) =>
                    s.id === section.id
                      ? { ...s, accounts: newData.map((item) => item.account) }
                      : s,
                  );
                  skipNextAccountSectionsSyncRef.current = true;
                  setLocalAccountGroupSections(updatedSections);
                  const allIds = updatedSections.flatMap((s) => s.accounts.map((a) => a.id));
                  persistOrder('accounts', allIds);
                  reorderAccounts(allIds);
                }}
              />
            </View>
          ))}
        </ScrollView>
      ) : (
        <FlatList
          ref={accountsListRef}
          data={groupedAccounts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={ACCOUNT_MANAGEMENT_LIST_CONTENT_STYLE}
          ListHeaderComponent={
            <View className="pb-2 gap-2">
              <SettingsHeader
                className="px-0 pt-5 pb-1"
                onBack={onBack}
                title={I18n.t('accounts.title')}
                subtitle={onOpenSettings ? undefined : I18n.t('accounts.manage_balances')}
                rightAccessory={
                  <View className="flex-row items-center gap-2">
                    {onOpenSettings ? (
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-10 w-10 rounded-full"
                        onPress={() => {
                          void triggerHaptic('selection');
                          onOpenSettings();
                        }}
                      >
                        <Settings size={18} color={themeColors.textMuted} />
                      </Button>
                    ) : null}
                    {renderBalanceToggleButton()}
                  </View>
                }
              />
            </View>
          }
          renderItem={({ item, index }) => {
            if (item.kind === 'group') {
              return (
                <View
                  className={cn(
                    'pl-1 pr-3 pb-1 flex-row items-center justify-between',
                    index === 0 ? 'pt-1.5' : 'pt-5',
                  )}
                >
                  <Text variant="label" tone="muted">
                    {item.label}
                  </Text>
                  {index === 0 ? (
                    <Text
                      variant="caption"
                      className={total >= 0 ? 'text-success' : 'text-destructive'}
                    >
                      {formatVisibleBalance(total)}
                    </Text>
                  ) : null}
                </View>
              );
            }
            const account = accountById.get(item.accountId);
            if (!account) return null;
            const balance = balanceMap.get(account.id) ?? account.startingBalance;
            const normalizedBalance = normalizeMoneyAmount(balance);
            const creditSummary =
              account.type === 'credit'
                ? (creditSummaryByAccountId.get(account.id) ?? defaultCreditSummary(balance))
                : null;
            return (
              <Animated.View entering={FadeIn.duration(220)}>
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    if (onOpenAccount) {
                      onOpenAccount(account.id);
                      return;
                    }
                    setSelectedAccountId(account.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${I18n.t('nav.account')}: ${account.name}`}
                  className={cn(
                    'mb-1 rounded-2xl border px-3 py-2.5 flex-row items-center gap-2',
                    account.type === 'credit'
                      ? 'border-destructive/30 bg-destructive/7'
                      : 'border-border/35 bg-card',
                  )}
                >
                  <View className="flex-1">
                    <Text variant="caption" className="text-foreground" numberOfLines={1}>
                      {account.name}
                    </Text>
                  </View>
                  {account.type === 'credit' && creditSummary ? (
                    <View className="items-end">
                      <Text variant="label" className="text-destructive">
                        {I18n.t('accounts.pay')} {formatVisibleBalance(creditSummary.payable)}
                      </Text>
                      <Text variant="label" tone="muted">
                        {I18n.t('accounts.out')} {formatVisibleBalance(creditSummary.outstanding)}
                      </Text>
                    </View>
                  ) : (
                    <Text
                      variant="caption"
                      className={isNegativeForDisplay(normalizedBalance) ? 'text-destructive' : 'text-success'}
                    >
                      {formatVisibleBalance(normalizedBalance)}
                    </Text>
                  )}
                </Pressable>
              </Animated.View>
            );
          }}
        />
      )}

      {managementOnly && selectedAccount ? (
        <EditAccountSheet
          visible={showEditAccount}
          account={selectedAccount}
          currentBalance={balanceMap.get(selectedAccount.id) ?? selectedAccount.startingBalance}
          currencySymbol={settings.currencySymbol}
          accountGroups={accountGroups}
          onClose={() => {
            setShowEditAccount(false);
            setSelectedAccountId(null);
          }}
          onSave={(updates) => {
            applyAccountSave({
              account: selectedAccount,
              currentBalance: balanceMap.get(selectedAccount.id) ?? selectedAccount.startingBalance,
              updates,
              onComplete: () => {
                setShowEditAccount(false);
                setSelectedAccountId(null);
              },
            });
          }}
          onDelete={() => {
            deleteAccount(selectedAccount.id);
            setShowEditAccount(false);
            setSelectedAccountId(null);
          }}
        />
      ) : null}

      <AddAccountSheet
        visible={showCreate}
        onClose={() => setShowCreate(false)}
        accountGroups={accountGroups}
        currencySymbol={settings.currencySymbol}
        onCreate={(input) => {
          createAccount({
            ...input,
            currency: DEFAULT_CURRENCY,
            includeInTotals: true,
          });
          setShowCreate(false);
        }}
      />
    </SettingsPageLayout>,
  );
}
