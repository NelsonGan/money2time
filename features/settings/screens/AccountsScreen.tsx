import {
  CalendarDays,
  CreditCard,
  Eye,
  EyeOff,
  GripVertical,
  Landmark,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, useAnimatedRef } from 'react-native-reanimated';
import { type Edge, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Sortable from 'react-native-sortables';

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
  Text,
  ThemeModal,
  TimeValueInline,
} from '~/components/ui';
import { ACCOUNT_TYPE_OPTIONS, DEFAULT_CURRENCY } from '~/constants/appDefaults';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { ActivityTransactionList } from '~/features/transactions/components';
import { AccountPanel, DatePanel } from '~/features/transactions/components/editor';
import { AddTransactionScreen, EditTransactionScreen } from '~/features/transactions/screens';
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

interface AccountGroupSection {
  id: string;
  label: string;
  accounts: Account[];
}

interface AccountEditorInput {
  name: string;
  type: AccountType;
  accountGroup: string | null;
  creditStatementDay: number | null;
  creditDueDay: number | null;
  includeInTotals: boolean;
  startingBalance: number;
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

function withColorAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const normalizedAlpha = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
}

const styles = StyleSheet.create({
  rowContainer: {
    paddingBottom: 0,
    width: '100%',
  },
  rowCard: {
    borderRadius: 22,
    borderWidth: 1,
    width: '100%',
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: spacing.sm,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 2,
  },
  rowDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowLeadingBadge: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowLeadingText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  rowLeadingEmoji: {
    fontSize: 18,
  },
  rowTitleWrap: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  rowSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowActionButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
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
    gap: spacing.sm,
    minHeight: 44,
  },
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

function AccountEditorSheet({
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
  account: Account | null;
  currentBalance: number;
  currencySymbol: string;
  accountGroups: AccountGroup[];
  onClose: () => void;
  onSave: (input: AccountEditorInput) => void;
  onDelete?: () => void;
}) {
  const themeColors = useThemeColors();
  const isEdit = account !== null;

  const [name, setName] = useState('');
  const [type, setType] = useState<AccountType>('debit');
  const [accountGroupId, setAccountGroupId] = useState<string>('none');
  const [includeInTotals, setIncludeInTotals] = useState(true);
  const [balanceInput, setBalanceInput] = useState('0');
  const [creditStatementDay, setCreditStatementDay] = useState('25');
  const [creditDueDay, setCreditDueDay] = useState('1');

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
      const matchedGroupId = account.accountGroup
        ? (accountGroupIdByName.get(account.accountGroup) ?? 'none')
        : 'none';
      setAccountGroupId(matchedGroupId);
      setIncludeInTotals(account.includeInTotals);
      setBalanceInput(toBalanceInputValue(currentBalance));
      setCreditStatementDay(String(account.creditStatementDay ?? '25'));
      setCreditDueDay(String(account.creditDueDay ?? '1'));
    } else {
      setName('');
      setType('debit');
      setAccountGroupId('none');
      setIncludeInTotals(true);
      setBalanceInput('0');
      setCreditStatementDay('25');
      setCreditDueDay('1');
    }
  }, [account, accountGroupIdByName, currentBalance, visible]);

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
      accountGroup:
        accountGroupId === 'none' ? null : (accountGroupNameById.get(accountGroupId) ?? null),
      creditStatementDay: resolvedType === 'credit' ? normalizedStatementDay : null,
      creditDueDay: resolvedType === 'credit' ? normalizedDueDay : null,
      includeInTotals,
      startingBalance: parsedBalance,
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
            <SelectField
              label={I18n.t('accounts.account_group')}
              value={accountGroupId}
              onChange={setAccountGroupId}
              options={accountGroupOptions}
            />
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
                        className="px-4 py-2.5 rounded-full border bg-primary/15 border-primary/50"
                      >
                        <Text variant="caption" className="text-primary">
                          {item.icon} {item.label}
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
                        'px-4 py-2.5 rounded-full border',
                        type === item.value
                          ? 'bg-primary/15 border-primary/50'
                          : 'bg-card border-border/40',
                      )}
                    >
                      <Text
                        variant="caption"
                        className={cn(
                          type === item.value ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {item.icon} {item.label}
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
              currencySymbol={currencySymbol}
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
  accent: string;
  accentBorder: string;
  accentSoft: string;
  border: string;
  card: string;
  deleteBorder: string;
  deleteSurface: string;
  error: string;
  primary: string;
  primaryMuted: string;
  primarySoft: string;
  textMuted: string;
  text: string;
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
let _acctRowWidth: number | null = null;

interface GroupRowItemProps {
  item: AccountGroup;
}

interface AccountMgmtRowItemProps {
  account: Account;
}

function getBadgeLabel(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '#';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

function DragHandleButton({
  backgroundColor,
  borderColor,
  iconColor,
  label,
}: {
  backgroundColor: string;
  borderColor: string;
  iconColor: string;
  label: string;
}) {
  return (
    <Sortable.Handle>
      <View
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.rowActionButton,
          {
            backgroundColor,
            borderColor,
          },
        ]}
      >
        <GripVertical size={14} color={iconColor} />
      </View>
    </Sortable.Handle>
  );
}

function GroupRowItem({ item }: GroupRowItemProps) {
  const tc = _acctThemeColors!;
  const isEditing = _acctEditingGroupId === item.id;
  const groupAccountCount = _acctAccountCountByGroupName.get(item.name.trim()) ?? 0;

  return (
    <View style={[styles.rowContainer, _acctRowWidth ? { width: _acctRowWidth } : null]}>
      <View
        style={[
          styles.rowCard,
          {
            borderColor: tc.border,
            backgroundColor: tc.card,
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
            <View
              style={[
                styles.rowLeadingBadge,
                {
                  backgroundColor: tc.primarySoft,
                  borderColor: tc.primaryMuted,
                },
              ]}
            >
              <Text style={[styles.rowLeadingText, { color: tc.primary }]}>
                {getBadgeLabel(item.name)}
              </Text>
            </View>
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
              style={[
                styles.rowActionButton,
                {
                  backgroundColor: tc.primarySoft,
                  borderColor: tc.primaryMuted,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.edit')}
            >
              <Pencil size={13} color={tc.primary} />
            </Pressable>
            <Pressable
              onPress={() => {
                void triggerHaptic('warning');
                _acctOnDeleteGroup?.(item);
              }}
              hitSlop={4}
              style={[
                styles.rowActionButton,
                {
                  backgroundColor: tc.deleteSurface,
                  borderColor: tc.deleteBorder,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.delete')}
            >
              <Trash2 size={13} color={tc.error} />
            </Pressable>
            <DragHandleButton
              backgroundColor={tc.primarySoft}
              borderColor={tc.primaryMuted}
              iconColor={tc.textMuted}
              label={`${I18n.t('common.reorder')} ${item.name}`}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function AccountMgmtRowItem({ account }: AccountMgmtRowItemProps) {
  const tc = _acctThemeColors!;
  const isCredit = account.type === 'credit';
  const accountTypeLabel =
    ACCOUNT_TYPE_OPTIONS.find((option) => option.value === account.type)?.label ?? account.type;
  const accountVisibilityLabel = account.includeInTotals
    ? I18n.t('accounts.include_option_include')
    : I18n.t('accounts.include_option_hide');

  return (
    <View style={[styles.rowContainer, _acctRowWidth ? { width: _acctRowWidth } : null]}>
      <View
        style={[
          styles.rowCard,
          styles.rowDisplay,
          {
            borderColor: tc.border,
            backgroundColor: tc.card,
          },
        ]}
      >
        <Pressable
          onPress={() => _acctOnAccountPress?.(account)}
          style={styles.accountRowPressable}
          accessibilityRole="button"
          accessibilityLabel={account.name}
        >
          <View
            style={[
              styles.rowLeadingBadge,
              {
                backgroundColor: isCredit ? tc.accentSoft : tc.primarySoft,
                borderColor: isCredit ? tc.accentBorder : tc.primaryMuted,
              },
            ]}
          >
            <Text style={styles.rowLeadingEmoji}>{isCredit ? '💳' : '🏦'}</Text>
          </View>
          <View style={styles.rowTitleWrap}>
            <Text style={[styles.rowTitle, { color: tc.text }]} numberOfLines={1}>
              {account.name}
            </Text>
            <Text style={[styles.rowSubtitle, { color: tc.textMuted }]} numberOfLines={1}>
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
            <Text
              style={[
                styles.rowTypeText,
                {
                  color: isCredit ? tc.accent : tc.primary,
                },
              ]}
            >
              {isCredit ? _acctCreditLabel : accountTypeLabel}
            </Text>
          </View>
        </Pressable>
        <DragHandleButton
          backgroundColor={tc.primarySoft}
          borderColor={tc.primaryMuted}
          iconColor={tc.textMuted}
          label={`${I18n.t('common.reorder')} ${account.name}`}
        />
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
  onOpenAddTransaction?: (accountId: string) => void;
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
  onOpenAddTransaction,
  onOpenTransaction,
  onOpenSettings,
  useNativeBackGesture = false,
  safeAreaEdges = ['top'],
}: AccountsScreenProps = {}) {
  const themeColors = useThemeColors();
  const { width: windowWidth } = useWindowDimensions();
  const accountRowThemeColors = useMemo(
    () => ({
      accent: themeColors.accent,
      accentBorder: withColorAlpha(themeColors.accent, 0.32),
      accentSoft: themeColors.accentSoft,
      border: withColorAlpha(themeColors.primary, 0.18),
      card: themeColors.card,
      deleteBorder: withColorAlpha(themeColors.error, 0.28),
      deleteSurface: themeColors.errorSoft,
      error: themeColors.error,
      primary: themeColors.primary,
      primaryMuted: themeColors.primaryMuted,
      primarySoft: themeColors.primarySoft,
      text: themeColors.text,
      textMuted: themeColors.textMuted,
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
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
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
  const accountsListRef = useRef<FlatList<AccountListRow> | null>(null);
  const managementAccountsScrollRef =
    useAnimatedRef<React.ElementRef<typeof Animated.ScrollView>>();
  const managementGroupsScrollRef = useAnimatedRef<React.ElementRef<typeof Animated.ScrollView>>();
  const detailScrollToTopRef = useRef<(() => void) | null>(null);
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
  const selectedTransactionTotalToneClass = 'text-foreground';
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
  const renderVisibleBalanceNode = useCallback(
    (
      amount: number,
      options: {
        variant?: React.ComponentProps<typeof Text>['variant'];
        tone?: React.ComponentProps<typeof Text>['tone'];
        textClassName?: string;
        iconColor?: string;
      } = {},
    ) => {
      const { variant = 'caption', tone = 'default', textClassName, iconColor } = options;
      const label = formatVisibleBalance(amount);
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

  const handleManagementViewChange = useCallback((nextView: AccountManagementView) => {
    setManagementView(nextView);
    setShowGroupComposer(false);
    setNewGroupName('');
    setEditingGroupId(null);
    setEditingGroupName('');
    setEditingAccountId(null);
    setShowEditAccount(false);
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
    setManagementView('accounts');
    setShowCreate(false);
    setShowGroupComposer(false);
    setNewGroupName('');
    setEditingGroupId(null);
    setEditingGroupName('');
    setEditingAccountId(null);
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
        creditStatementDay: updates.creditStatementDay,
        creditDueDay: updates.creditDueDay,
        includeInTotals: updates.includeInTotals,
      };
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
    setEditingAccountId(account.id);
    setShowEditAccount(true);
  }, []);
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
                    onPress={() => {
                      void triggerHaptic('selection');
                      clearSelection();
                    }}
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
              <View className="pb-3 gap-3">
                <View className="rounded-[24px] border border-border/30 bg-card px-5 pt-5 pb-4 shadow-soft">
                  <View className="items-center gap-2">
                    <View className="h-14 w-14 items-center justify-center rounded-[20px] bg-primary/10 border border-primary/15">
                      {account.type === 'credit' ? (
                        <CreditCard size={24} color={themeColors.primary} />
                      ) : (
                        <Landmark size={24} color={themeColors.primary} />
                      )}
                    </View>
                    <Text variant="label" tone="muted" className="mt-1">
                      {I18n.t('accounts.balance')}
                    </Text>
                    {renderVisibleBalanceNode(normalizedBalance, {
                      variant: 'heading',
                      textClassName: isNegativeForDisplay(normalizedBalance)
                        ? 'text-destructive'
                        : 'text-foreground',
                      iconColor: isNegativeForDisplay(normalizedBalance)
                        ? themeColors.error
                        : themeColors.text,
                    })}
                  </View>
                  <View className="mt-4 flex-row gap-2">
                    <View className="flex-1 rounded-[16px] bg-secondary/40 border border-border/15 px-3 py-2.5 items-center">
                      <Text variant="label" tone="muted" className="text-[10px] tracking-wide">
                        {I18n.t('accounts.account_group')}
                      </Text>
                      <Text variant="caption" className="mt-1" numberOfLines={1}>
                        {accountGroupLabel}
                      </Text>
                    </View>
                    <View className="flex-1 rounded-[16px] bg-secondary/40 border border-border/15 px-3 py-2.5 items-center">
                      <Text variant="label" tone="muted" className="text-[10px] tracking-wide">
                        {I18n.t('accounts.include_in_totals')}
                      </Text>
                      <Text
                        variant="caption"
                        className={cn(
                          'mt-1',
                          account.includeInTotals ? 'text-success' : 'text-muted-foreground',
                        )}
                      >
                        {includeInTotalsLabel}
                      </Text>
                    </View>
                  </View>
                </View>

                {account.type === 'credit' ? (
                  <View className="gap-2.5">
                    <View className="rounded-[24px] border border-border/30 bg-card px-5 py-4 shadow-soft">
                      <View className="flex-row items-center gap-2.5 mb-3">
                        <View className="h-8 w-8 items-center justify-center rounded-xl bg-accent/10 border border-accent/15">
                          <CalendarDays size={15} color={themeColors.accent} />
                        </View>
                        <View className="flex-1">
                          <Text variant="bodyStrong">{I18n.t('accounts.billing')}</Text>
                          <Text variant="label" tone="muted" className="mt-0.5">
                            {I18n.t('accounts.statement_due', {
                              statementDay: statementDay ?? '-',
                              dueDay: dueDay ?? '-',
                            })}
                          </Text>
                        </View>
                        <View className="rounded-full bg-secondary/50 border border-border/20 px-2.5 py-1">
                          <Text variant="label" tone="muted" className="text-[10px]">
                            {I18n.t('accounts.next_due', {
                              date: nextDue
                                ? nextDue.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : '-',
                            })}
                          </Text>
                        </View>
                      </View>
                      <View className="flex-row items-center gap-2">
                        <View className="flex-1 rounded-[16px] border border-destructive/15 bg-destructive/5 px-3 py-2.5">
                          <Text variant="label" tone="muted" className="text-[10px] tracking-wide">
                            {I18n.t('accounts.payable')}
                          </Text>
                          {renderVisibleBalanceNode(cyclePayable, {
                            variant: 'caption',
                            textClassName: 'mt-1 text-destructive',
                            iconColor: themeColors.error,
                          })}
                        </View>
                        <View className="flex-1 rounded-[16px] border border-destructive/15 bg-destructive/5 px-3 py-2.5">
                          <Text variant="label" tone="muted" className="text-[10px] tracking-wide">
                            {I18n.t('accounts.outstanding')}
                          </Text>
                          {renderVisibleBalanceNode(outstanding, {
                            variant: 'caption',
                            textClassName: 'mt-1 text-destructive',
                            iconColor: themeColors.error,
                          })}
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
        <AccountEditorSheet
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
  _acctThemeColors = accountRowThemeColors;
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
  _acctRowWidth = managementRowWidth;

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
            variant="home"
            className="my-2"
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
          {accountGroups.length === 0 ? (
            <EmptyState
              title={I18n.t('accounts.empty_groups_title')}
              message={I18n.t('accounts.empty_groups_message')}
              mascotMood="curious"
            />
          ) : (
            <Animated.ScrollView
              ref={managementGroupsScrollRef}
              style={styles.flexContainer}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={ACCOUNT_MANAGEMENT_GROUP_LIST_CONTENT_STYLE}
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
                  const orderedGroups = order(accountGroups);
                  reorderAccountGroups(orderedGroups.map((group) => group.id));
                  void triggerHaptic('selection');
                }}
                scrollableRef={managementGroupsScrollRef}
                sortEnabled={editingGroupId === null}
                width="fill"
              >
                {accountGroups.map((group) => (
                  <GroupRowItem key={group.id} item={group} />
                ))}
              </Sortable.Flex>
            </Animated.ScrollView>
          )}
        </>
      ) : managementOnly ? (
        <Animated.ScrollView
          ref={managementAccountsScrollRef}
          style={styles.flexContainer}
          contentContainerStyle={ACCOUNT_MANAGEMENT_LIST_CONTENT_STYLE}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {accountGroupSections.map((section, sectionIndex) => (
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
                  const orderedAccounts = order(section.accounts);
                  reorderAccounts(buildReorderedAccountIds(section.id, orderedAccounts));
                  void triggerHaptic('selection');
                }}
                scrollableRef={managementAccountsScrollRef}
                width="fill"
              >
                {section.accounts.map((account) => (
                  <AccountMgmtRowItem key={account.id} account={account} />
                ))}
              </Sortable.Flex>
            </View>
          ))}
        </Animated.ScrollView>
      ) : (
        <FlatList
          ref={accountsListRef}
          data={groupedAccounts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={ACCOUNT_MANAGEMENT_LIST_CONTENT_STYLE}
          ListHeaderComponent={
            <View className="pb-2 gap-2">
              <SettingsHeader
                className="px-0 pt-3 pb-1.5"
                onBack={onBack}
                title={I18n.t('accounts.title')}
                subtitle={onOpenSettings ? undefined : I18n.t('accounts.manage_balances')}
                rightAccessory={
                  <View className="flex-row items-center gap-2">
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
                  {index === 0
                    ? renderVisibleBalanceNode(total, {
                        variant: 'caption',
                        textClassName: total >= 0 ? 'text-success' : 'text-destructive',
                        iconColor: total >= 0 ? themeColors.success : themeColors.error,
                      })
                    : null}
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
                      <View className="flex-row items-center gap-1">
                        <Text variant="label" className="text-destructive">
                          {I18n.t('accounts.pay')}
                        </Text>
                        {renderVisibleBalanceNode(creditSummary.payable, {
                          variant: 'label',
                          textClassName: 'text-destructive',
                          iconColor: themeColors.error,
                        })}
                      </View>
                      <View className="mt-0.5 flex-row items-center gap-1">
                        <Text variant="label" tone="muted">
                          {I18n.t('accounts.out')}
                        </Text>
                        {renderVisibleBalanceNode(creditSummary.outstanding, {
                          variant: 'label',
                          tone: 'muted',
                          iconColor: themeColors.textMuted,
                        })}
                      </View>
                    </View>
                  ) : (
                    renderVisibleBalanceNode(normalizedBalance, {
                      variant: 'caption',
                      textClassName: isNegativeForDisplay(normalizedBalance)
                        ? 'text-destructive'
                        : 'text-success',
                      iconColor: isNegativeForDisplay(normalizedBalance)
                        ? themeColors.error
                        : themeColors.success,
                    })
                  )}
                </Pressable>
              </Animated.View>
            );
          }}
        />
      )}

      {managementOnly && editingAccount ? (
        <AccountEditorSheet
          visible={showEditAccount}
          account={editingAccount}
          currentBalance={balanceMap.get(editingAccount.id) ?? editingAccount.startingBalance}
          currencySymbol={settings.currencySymbol}
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
        />
      ) : null}

      <AccountEditorSheet
        visible={showCreate}
        account={null}
        currentBalance={0}
        currencySymbol={settings.currencySymbol}
        accountGroups={accountGroups}
        onClose={() => setShowCreate(false)}
        onSave={(input) => {
          createAccount({
            ...input,
            currency: DEFAULT_CURRENCY,
          });
          setShowCreate(false);
        }}
      />
    </SettingsPageLayout>,
  );
}
