import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { GripVertical, Pencil, Plus, Trash2 } from 'lucide-react-native';
import DraggableFlatList, { type RenderItemParams } from 'react-native-draggable-flatlist';

import { ThemeModal } from '~/components/ui/theme-modal';
import { Text } from '~/components/ui/text';
import { Input } from '~/components/ui/input';
import { Button } from '~/components/ui/button';
import {
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SETTINGS_LIST_BOTTOM_PADDING,
  SettingsActionBar,
  SettingsHeader,
  SettingsPageLayout,
  SettingsSection,
} from '~/components/ui/settings';
import { SelectField } from '~/components/ui/select';
import { SegmentedToggle } from '~/components/ui/toggle';
import { ActivityTransactionList } from '~/features/transactions/components';
import { EmptyState } from '~/components/feedback/EmptyState';
import { useApp } from '~/context/AppContext';
import {
  ACCOUNT_TYPE_OPTIONS,
  DEFAULT_CATEGORY_EMOJIS,
  DEFAULT_CURRENCY,
} from '~/constants/appDefaults';
import { type Account, type AccountGroup, type AccountType } from '~/types';
import { formatAmount } from '~/utils/formatters';
import { useThemeColors } from '~/hooks/useThemeColors';
import { cn } from '~/utils';
import { triggerHaptic } from '~/services/haptics';
import { useEdgeSwipeBack } from '~/hooks/useEdgeSwipeBack';
import { I18n } from '~/lib/i18n';

interface AccountGroupSection {
  id: string;
  label: string;
  accounts: Account[];
}

function withColorAlpha(hex: string, alpha: number) {
  const value = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return hex;
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const normalizedAlpha = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${normalizedAlpha})`;
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
  const [type, setType] = useState<AccountType>('cash');
  const [accountGroupId, setAccountGroupId] = useState<string>('none');
  const [icon, setIcon] = useState('💵');
  const [color, setColor] = useState<string>('#1F8A6F');
  const [startingBalance, setStartingBalance] = useState('0');
  const [creditStatementDay, setCreditStatementDay] = useState('25');
  const [creditDueDay, setCreditDueDay] = useState('1');
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
        accountGroupId === 'none'
          ? null
          : (accountGroups.find((group) => group.id === accountGroupId)?.name ?? null),
      creditStatementDay: type === 'credit' ? normalizedStatementDay : null,
      creditDueDay: type === 'credit' ? normalizedDueDay : null,
      icon: icon || '💵',
      color: color || '#1F8A6F',
      startingBalance: Number(startingBalance) || 0,
    });
    setName('');
    setType('cash');
    setAccountGroupId('none');
    setIcon('💵');
    setColor('#1F8A6F');
    setStartingBalance('0');
    setCreditStatementDay('25');
    setCreditDueDay('1');
  };

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end" pointerEvents="box-none">
        <Pressable className="absolute inset-0 bg-black/20" onPress={onClose} />
        <SafeAreaView
          className="rounded-t-[28px] border-t border-border/40 bg-background"
          edges={['bottom']}
        >
          <View className="items-center pt-3">
            <View className="h-1.5 w-11 rounded-full bg-border/70" />
          </View>
          <SettingsHeader
            className="px-5 pt-3 pb-2"
            title={I18n.t('accounts.new_account')}
            onClose={onClose}
          />

          <ScrollView
            className="max-h-[620px]"
            contentContainerStyle={{
              paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
              paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
            }}
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
                  options={[
                    { value: 'none', label: I18n.t('common.ungrouped') },
                    ...accountGroups.map((group) => ({ value: group.id, label: group.name })),
                  ]}
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
      </View>
    </ThemeModal>
  );
}

function EditAccountSheet({
  visible,
  account,
  accountGroups,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  account: Account;
  accountGroups: AccountGroup[];
  onClose: () => void;
  onSave: (updates: {
    name: string;
    accountGroup: string | null;
    creditStatementDay: number | null;
    creditDueDay: number | null;
    includeInTotals: boolean;
  }) => void;
  onDelete: () => void;
}) {
  const themeColors = useThemeColors();
  const [name, setName] = useState(account.name);
  const [accountGroupId, setAccountGroupId] = useState<string>('none');
  const [includeInTotals, setIncludeInTotals] = useState(account.includeInTotals);
  const [creditStatementDay, setCreditStatementDay] = useState(
    String(account.creditStatementDay ?? '25'),
  );
  const [creditDueDay, setCreditDueDay] = useState(String(account.creditDueDay ?? '1'));

  useEffect(() => {
    setName(account.name);
    const matchedGroupId = account.accountGroup
      ? (accountGroups.find((group) => group.name === account.accountGroup)?.id ?? 'none')
      : 'none';
    setAccountGroupId(matchedGroupId);
    setIncludeInTotals(account.includeInTotals);
    setCreditStatementDay(String(account.creditStatementDay ?? '25'));
    setCreditDueDay(String(account.creditDueDay ?? '1'));
  }, [account, accountGroups, visible]);

  const normalizedName = name.trim();
  const canSave = normalizedName.length > 0;

  const handleSave = () => {
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

    onSave({
      name: normalizedName,
      accountGroup:
        accountGroupId === 'none'
          ? null
          : (accountGroups.find((group) => group.id === accountGroupId)?.name ?? null),
      creditStatementDay: account.type === 'credit' ? normalizedStatementDay : null,
      creditDueDay: account.type === 'credit' ? normalizedDueDay : null,
      includeInTotals,
    });
    onClose();
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
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
            paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
          }}
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
              options={[
                { value: 'none', label: I18n.t('common.ungrouped') },
                ...accountGroups.map((group) => ({ value: group.id, label: group.name })),
              ]}
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
              className="self-start rounded-full border border-destructive/30 bg-destructive/8 px-3 py-2"
            >
              <Text variant="caption" style={{ color: themeColors.coral }}>
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
    type: 'expense' | 'income' | 'transfer';
    amount: number;
    accountId?: string | null;
    fromAccountId?: string | null;
    toAccountId?: string | null;
  },
  creditAccountId: string,
) {
  if (tx.type === 'expense' && tx.accountId === creditAccountId) return tx.amount;
  if (tx.type === 'income' && tx.accountId === creditAccountId) return -tx.amount;
  if (tx.type === 'transfer' && tx.fromAccountId === creditAccountId) return tx.amount;
  if (tx.type === 'transfer' && tx.toAccountId === creditAccountId) return -tx.amount;
  return 0;
}

function PayCreditCardSheet({
  visible,
  onClose,
  onSubmit,
  fromOptions,
  currencySymbol,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (input: { fromAccountId: string; amount: number; note: string | null }) => void;
  fromOptions: { value: string; label: string }[];
  currencySymbol: string;
}) {
  const [fromAccountId, setFromAccountId] = useState<string | null>(fromOptions[0]?.value ?? null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState(I18n.t('accounts.credit_payment_note'));
  const numericAmount = Number(amount);
  const canSave = !!fromAccountId && amount.trim().length > 0 && Number.isFinite(numericAmount);

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
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
            paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
          }}
        >
          <View className="gap-4">
            <SelectField
              label={I18n.t('accounts.pay_from')}
              value={fromAccountId}
              onChange={setFromAccountId}
              options={fromOptions}
            />
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

function AccountGroupsSheet({
  visible,
  groups,
  onClose,
  onCreate,
  onRename,
  onDelete,
}: {
  visible: boolean;
  groups: AccountGroup[];
  onClose: () => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}) {
  const themeColors = useThemeColors();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const canCreate = newName.trim().length > 0;

  const handleCreate = () => {
    const normalized = newName.trim();
    if (!normalized) return;
    onCreate(normalized);
    setNewName('');
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
          title={I18n.t('accounts.account_groups')}
          onClose={onClose}
        />
        <View className="px-5 pb-3">
          <Input
            label={I18n.t('accounts.create_group')}
            value={newName}
            onChangeText={setNewName}
            placeholder={I18n.t('accounts.create_group_placeholder')}
          />
        </View>

        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
            paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
          }}
          renderItem={({ item }) => {
            const isEditing = editingId === item.id;
            return (
              <View className="mb-2 rounded-2xl border border-border/35 bg-card p-3">
                {isEditing ? (
                  <View className="gap-2">
                    <Input
                      value={editingName}
                      onChangeText={setEditingName}
                      placeholder={I18n.t('accounts.group_name')}
                    />
                    <View className="flex-row gap-2">
                      <Button
                        size="sm"
                        onPress={() => {
                          const normalized = editingName.trim();
                          if (!normalized) return;
                          onRename(item.id, normalized);
                          setEditingId(null);
                          setEditingName('');
                        }}
                      >
                        <Text>{I18n.t('common.save')}</Text>
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => {
                          setEditingId(null);
                          setEditingName('');
                        }}
                      >
                        <Text>{I18n.t('common.cancel')}</Text>
                      </Button>
                    </View>
                  </View>
                ) : (
                  <View className="flex-row items-center">
                    <Text className="flex-1">{item.name}</Text>
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('selection');
                        setEditingId(item.id);
                        setEditingName(item.name);
                      }}
                      className="h-9 w-9 items-center justify-center rounded-full bg-secondary/55 mr-2"
                    >
                      <Pencil size={14} color={themeColors.textMuted} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        void triggerHaptic('warning');
                        onDelete(item.id);
                      }}
                      className="h-9 w-9 items-center justify-center rounded-full bg-destructive/12"
                    >
                      <Trash2 size={14} color={themeColors.coral} />
                    </Pressable>
                  </View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              title={I18n.t('accounts.empty_groups_title')}
              message={I18n.t('accounts.empty_groups_message')}
              mascotMood="curious"
            />
          }
        />
        <SettingsActionBar onCancel={onClose} onSave={handleCreate} saveDisabled={!canCreate} />
      </SafeAreaView>
    </ThemeModal>
  );
}

interface AccountsScreenProps {
  onBack?: () => void;
  managementOnly?: boolean;
}

export function AccountsScreen({ onBack, managementOnly = false }: AccountsScreenProps = {}) {
  const themeColors = useThemeColors();
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
    getTransactionsByAccount,
    renameAccountGroup,
    reorderAccounts,
    updateAccount,
  } = useApp();

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [showPayCard, setShowPayCard] = useState(false);
  const [showEditAccount, setShowEditAccount] = useState(false);
  const [isReorderingAccounts, setIsReorderingAccounts] = useState(false);
  const [reorderDraftGroups, setReorderDraftGroups] = useState<AccountGroupSection[]>([]);
  const swipeBackHandlers = useEdgeSwipeBack(
    selectedAccountId ? () => setSelectedAccountId(null) : onBack,
  );

  const selectedAccount = selectedAccountId
    ? (accounts.find((item) => item.id === selectedAccountId) ?? null)
    : null;

  useEffect(() => {
    if (selectedAccountId && !selectedAccount) {
      setSelectedAccountId(null);
    }
  }, [selectedAccountId, selectedAccount]);

  useEffect(() => {
    if (selectedAccount) return;
    setShowEditAccount(false);
  }, [selectedAccount]);

  const balanceMap = useMemo(() => {
    if (managementOnly) return new Map<string, number>();
    return new Map(accountBalances.map((item) => [item.accountId, item.balance]));
  }, [accountBalances, managementOnly]);

  const total = useMemo(() => {
    if (managementOnly) return 0;
    return accounts.reduce(
      (sum, account) =>
        sum +
        (account.includeInTotals ? (balanceMap.get(account.id) ?? account.startingBalance) : 0),
      0,
    );
  }, [accounts, balanceMap, managementOnly]);
  const creditSummaryByAccountId = useMemo(() => {
    if (managementOnly) return new Map<string, { payable: number; outstanding: number }>();
    const creditAccounts = accounts.filter((account) => account.type === 'credit');
    if (creditAccounts.length === 0)
      return new Map<string, { payable: number; outstanding: number }>();

    const now = new Date();
    const creditIdSet = new Set(creditAccounts.map((account) => account.id));
    const txByCreditId = new Map<string, typeof transactions>();
    creditAccounts.forEach((account) => txByCreditId.set(account.id, []));

    transactions.forEach((tx) => {
      const touched = new Set<string>();
      if (tx.accountId && creditIdSet.has(tx.accountId)) touched.add(tx.accountId);
      if (tx.fromAccountId && creditIdSet.has(tx.fromAccountId)) touched.add(tx.fromAccountId);
      if (tx.toAccountId && creditIdSet.has(tx.toAccountId)) touched.add(tx.toAccountId);
      touched.forEach((creditId) => {
        txByCreditId.get(creditId)?.push(tx);
      });
    });

    const next = new Map<string, { payable: number; outstanding: number }>();
    creditAccounts.forEach((account) => {
      const accountTxns = txByCreditId.get(account.id) ?? [];
      const cycleStartIso = account.creditStatementDay
        ? getCurrentStatementStart(account.creditStatementDay, now).toISOString()
        : null;
      const cycleTxns = cycleStartIso
        ? accountTxns.filter((tx) => tx.date >= cycleStartIso)
        : accountTxns;
      const payable = Math.max(
        0,
        cycleTxns.reduce((sum, tx) => sum + creditDeltaForAccountTransaction(tx, account.id), 0),
      );
      const outstanding = Math.max(0, balanceMap.get(account.id) ?? account.startingBalance);
      next.set(account.id, { payable, outstanding });
    });
    return next;
  }, [accounts, balanceMap, managementOnly, transactions]);
  const accountGroupSections = useMemo<AccountGroupSection[]>(() => {
    const sections: AccountGroupSection[] = [];
    const byLabel = new Map<string, AccountGroupSection>();
    accounts.forEach((account) => {
      const label = account.accountGroup?.trim() || String(I18n.t('common.ungrouped'));
      const existing = byLabel.get(label);
      if (existing) {
        existing.accounts.push(account);
        return;
      }
      const next: AccountGroupSection = {
        id: `group-${sections.length}-${label}`,
        label,
        accounts: [account],
      };
      byLabel.set(label, next);
      sections.push(next);
    });
    return sections;
  }, [accounts]);

  const groupedAccounts = useMemo(() => {
    const rows: (
      | { kind: 'group'; id: string; label: string }
      | { kind: 'account'; id: string; accountId: string }
    )[] = [];
    accountGroupSections.forEach((section) => {
      rows.push({ kind: 'group', id: section.id, label: section.label });
      section.accounts.forEach((account) => {
        rows.push({ kind: 'account', id: `a-${account.id}`, accountId: account.id });
      });
    });
    return rows;
  }, [accountGroupSections]);
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const startReorderAccounts = () => {
    setReorderDraftGroups(
      accountGroupSections.map((section) => ({
        id: section.id,
        label: section.label,
        accounts: [...section.accounts],
      })),
    );
    setIsReorderingAccounts(true);
  };

  const saveReorderAccounts = () => {
    if (reorderDraftGroups.length > 0) {
      const flattened = reorderDraftGroups.flatMap((group) =>
        group.accounts.map((item) => item.id),
      );
      reorderAccounts(flattened);
    }
    setIsReorderingAccounts(false);
  };

  if (!managementOnly && selectedAccountId && selectedAccount) {
    const account = selectedAccount;

    const balance = balanceMap.get(account.id) ?? account.startingBalance;
    const txns = getTransactionsByAccount(account.id);
    const payFromOptions = accounts
      .filter((item) => item.id !== account.id && item.type !== 'credit')
      .map((item) => ({ value: item.id, label: `${item.icon} ${item.name}` }));
    const now = new Date();
    const statementDay = account.creditStatementDay ?? null;
    const dueDay = account.creditDueDay ?? null;
    const nextDue = dueDay ? getNextByDay(dueDay, now) : null;
    const cycleStart = statementDay
      ? getCurrentStatementStart(statementDay, now).toISOString()
      : null;
    const cycleTxns = cycleStart ? txns.filter((item) => item.date >= cycleStart) : [];
    const cyclePayable = Math.max(
      0,
      cycleTxns.reduce((sum, item) => sum + creditDeltaForAccountTransaction(item, account.id), 0),
    );
    const outstanding = Math.max(0, balance);
    const accountTypeLabel =
      ACCOUNT_TYPE_OPTIONS.find((option) => option.value === account.type)?.label ?? account.type;
    const accountColorBorder = withColorAlpha(account.color, 0.35);
    const accountColorFill = withColorAlpha(account.color, 0.16);

    return (
      <SettingsPageLayout swipeBackHandlers={swipeBackHandlers}>
        <ActivityTransactionList
          transactions={txns}
          emptyTitle={I18n.t('accounts.empty_transactions_title')}
          emptyMessage={I18n.t('accounts.empty_transactions_message')}
          contentPaddingBottom={SETTINGS_FORM_BOTTOM_PADDING}
          contentPaddingHorizontal={SETTINGS_HORIZONTAL_PADDING}
          contentPaddingTop={0}
          disableItemAnimations
          compactItems
          listHeaderComponent={
            <View className="pb-2 gap-2">
              <SettingsHeader
                className="px-0 pt-5 pb-2"
                onBack={() => setSelectedAccountId(null)}
                title={I18n.t('accounts.title')}
                subtitle={`${account.icon} ${account.name}`}
                rightAccessory={
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8 px-3"
                    onPress={() => {
                      void triggerHaptic('selection');
                      setShowEditAccount(true);
                    }}
                  >
                    <Text>{I18n.t('accounts.edit_account')}</Text>
                  </Button>
                }
              />

              <View className="relative overflow-hidden rounded-[24px] border border-border/35 bg-card px-4 py-4 shadow-soft">
                <View className="absolute -top-10 -right-8 h-28 w-28 rounded-full bg-primary/12" />
                <View className="absolute -bottom-12 -left-8 h-24 w-24 rounded-full bg-success/10" />

                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1 flex-row items-center gap-3">
                    <View
                      className="h-11 w-11 items-center justify-center rounded-2xl border"
                      style={{
                        borderColor: accountColorBorder,
                        backgroundColor: accountColorFill,
                      }}
                    >
                      <Text className="text-[20px]">{account.icon}</Text>
                    </View>
                    <View className="flex-1">
                      <Text variant="caption" className="text-foreground" numberOfLines={1}>
                        {account.name}
                      </Text>
                      {account.accountGroup ? (
                        <Text variant="label" tone="muted" className="mt-0.5" numberOfLines={1}>
                          {account.accountGroup}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <View
                    className={cn(
                      'rounded-full border px-2.5 py-1',
                      account.type === 'credit'
                        ? 'border-destructive/35 bg-destructive/12'
                        : 'border-primary/35 bg-primary/10',
                    )}
                  >
                    <Text
                      variant="label"
                      className={account.type === 'credit' ? 'text-destructive' : 'text-primary'}
                    >
                      {accountTypeLabel}
                    </Text>
                  </View>
                </View>

                <View className="mt-3 rounded-[18px] border border-border/30 bg-background/75 px-3.5 py-3">
                  <Text variant="label" tone="muted">
                    {I18n.t('accounts.balance')}
                  </Text>
                  <Text
                    className={cn('mt-1', balance >= 0 ? 'text-foreground' : 'text-destructive')}
                    variant="title"
                  >
                    {formatAmount(balance, settings, {
                      showSign: false,
                      trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
                    })}
                  </Text>
                </View>

                <View className="mt-3 flex-row items-center justify-between">
                  <View className="rounded-full border border-border/35 bg-background/65 px-2.5 py-1">
                    <Text variant="label" tone="muted">
                      {I18n.t('accounts.include_in_totals')}
                    </Text>
                  </View>
                  <View
                    className={cn(
                      'rounded-full border px-2.5 py-1',
                      account.includeInTotals
                        ? 'border-success/35 bg-success/10'
                        : 'border-border/35 bg-secondary/35',
                    )}
                  >
                    <Text
                      variant="label"
                      className={account.includeInTotals ? 'text-success' : 'text-muted-foreground'}
                    >
                      {account.includeInTotals
                        ? I18n.t('accounts.include_option_include')
                        : I18n.t('accounts.include_option_hide')}
                    </Text>
                  </View>
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
                          ? nextDue.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : '-',
                      })}
                    </Text>
                    <View className="mt-2.5 flex-row items-center gap-2">
                      <View className="flex-1 rounded-[14px] border border-border/30 bg-background px-3 py-2">
                        <Text variant="label" tone="muted">
                          {I18n.t('accounts.payable')}
                        </Text>
                        <Text variant="caption" className="mt-0.5 text-destructive">
                          {formatAmount(cyclePayable, settings, {
                            showSign: false,
                            trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
                          })}
                        </Text>
                      </View>
                      <View className="flex-1 rounded-[14px] border border-border/30 bg-background px-3 py-2">
                        <Text variant="label" tone="muted">
                          {I18n.t('accounts.outstanding')}
                        </Text>
                        <Text variant="caption" className="mt-0.5 text-destructive">
                          {formatAmount(outstanding, settings, {
                            showSign: false,
                            trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
                          })}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <Button variant="secondary" onPress={() => setShowPayCard(true)}>
                    <Text>{I18n.t('accounts.pay_this_card')}</Text>
                  </Button>
                </View>
              ) : null}

              <Text variant="subheading">{I18n.t('nav.activity')}</Text>
            </View>
          }
        />
        <EditAccountSheet
          visible={showEditAccount}
          account={account}
          accountGroups={accountGroups}
          onClose={() => setShowEditAccount(false)}
          onSave={(updates) => updateAccount(account.id, updates)}
          onDelete={() => {
            deleteAccount(account.id);
            setShowEditAccount(false);
            setSelectedAccountId(null);
          }}
        />
        <PayCreditCardSheet
          visible={showPayCard}
          onClose={() => setShowPayCard(false)}
          fromOptions={payFromOptions}
          currencySymbol={settings.currencySymbol}
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
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout
      swipeBackHandlers={swipeBackHandlers}
      actionBar={
        isReorderingAccounts ? (
          <SettingsActionBar
            onCancel={() => setIsReorderingAccounts(false)}
            onSave={saveReorderAccounts}
          />
        ) : undefined
      }
    >
      {isReorderingAccounts ? (
        <FlatList
          data={reorderDraftGroups}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
            paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
          }}
          ListHeaderComponent={
            <View className="pb-2">
              <SettingsHeader
                className="px-0 pt-5 pb-2"
                onBack={onBack}
                title={I18n.t('accounts.reorder_title')}
                subtitle={I18n.t('accounts.reorder_subtitle')}
              />
            </View>
          }
          renderItem={({ item: section }) => {
            return (
              <View className="mb-3">
                <View className="px-1 pb-1">
                  <Text variant="label" tone="muted">
                    {section.label}
                  </Text>
                </View>
                <DraggableFlatList
                  data={section.accounts}
                  keyExtractor={(account) => account.id}
                  scrollEnabled={false}
                  activationDistance={12}
                  autoscrollThreshold={80}
                  autoscrollSpeed={180}
                  onDragEnd={({ data }) => {
                    setReorderDraftGroups((prev) =>
                      prev.map((group) =>
                        group.id === section.id ? { ...group, accounts: data } : group,
                      ),
                    );
                  }}
                  renderItem={({
                    item: account,
                    drag,
                    isActive,
                  }: RenderItemParams<(typeof accounts)[number]>) => {
                    return (
                      <Pressable
                        onLongPress={() => {
                          void triggerHaptic('medium');
                          drag();
                        }}
                        disabled={isActive}
                        className={cn(
                          'mb-1 rounded-2xl border px-3 py-2.5 flex-row items-center gap-2',
                          isActive ? 'opacity-85' : '',
                          account.type === 'credit'
                            ? 'border-destructive/30 bg-destructive/7'
                            : 'border-border/35 bg-card',
                        )}
                      >
                        <GripVertical size={16} color={themeColors.textMuted} />
                        <View className="flex-1">
                          <Text variant="caption" className="text-foreground" numberOfLines={1}>
                            {account.name}
                          </Text>
                        </View>
                        {account.type === 'credit' ? (
                          <Text variant="label" className="mr-1 text-destructive">
                            {I18n.t('accounts.cc')}
                          </Text>
                        ) : null}
                        {!managementOnly ? (
                          <Text
                            variant="caption"
                            className={
                              (balanceMap.get(account.id) ?? account.startingBalance) >= 0
                                ? 'text-success'
                                : 'text-destructive'
                            }
                          >
                            {formatAmount(
                              balanceMap.get(account.id) ?? account.startingBalance,
                              settings,
                              {
                                showSign: false,
                                trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
                              },
                            )}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  }}
                />
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={groupedAccounts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
            paddingBottom: SETTINGS_LIST_BOTTOM_PADDING,
          }}
          ListHeaderComponent={
            <View className="pb-2 gap-2">
              <SettingsHeader
                className="px-0 pt-5 pb-1"
                onBack={onBack}
                title={I18n.t('accounts.title')}
                subtitle={
                  managementOnly
                    ? I18n.t('settings.accounts_subtitle')
                    : I18n.t('accounts.manage_balances')
                }
                rightAccessory={
                  managementOnly ? (
                    <Button size="icon" onPress={() => setShowCreate(true)}>
                      <Plus size={18} color="#fff" />
                    </Button>
                  ) : undefined
                }
              />
              {managementOnly ? (
                <View className="flex-row items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onPress={() => setShowGroups(true)}
                  >
                    <Text>{I18n.t('accounts.groups')}</Text>
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    onPress={startReorderAccounts}
                  >
                    <Text>{I18n.t('categories.reorder')}</Text>
                  </Button>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item, index }) => {
            if (item.kind === 'group') {
              const showInlineTotal = !managementOnly && index === 0;
              return (
                <View className="pl-1 pr-3 pt-1.5 pb-1 flex-row items-center justify-between">
                  <Text variant="label" tone="muted">
                    {item.label}
                  </Text>
                  {showInlineTotal ? (
                    <Text
                      variant="caption"
                      className={total >= 0 ? 'text-success' : 'text-destructive'}
                    >
                      {formatAmount(total, settings, {
                        showSign: false,
                        trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
                      })}
                    </Text>
                  ) : null}
                </View>
              );
            }
            const account = accountById.get(item.accountId);
            if (!account) return null;
            const balance = managementOnly
              ? 0
              : (balanceMap.get(account.id) ?? account.startingBalance);
            const creditSummary =
              !managementOnly && account.type === 'credit'
                ? (creditSummaryByAccountId.get(account.id) ?? {
                    payable: 0,
                    outstanding: Math.max(0, balance),
                  })
                : null;
            return (
              <Animated.View entering={FadeIn.duration(220)}>
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    if (managementOnly) {
                      setSelectedAccountId(account.id);
                      setShowEditAccount(true);
                      return;
                    }
                    setSelectedAccountId(account.id);
                  }}
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
                  {managementOnly ? (
                    account.type === 'credit' ? (
                      <Text variant="label" className="text-destructive">
                        {I18n.t('accounts.credit')}
                      </Text>
                    ) : null
                  ) : account.type === 'credit' && creditSummary ? (
                    <View className="items-end">
                      <Text variant="label" className="text-destructive">
                        {I18n.t('accounts.pay')}{' '}
                        {formatAmount(creditSummary.payable, settings, {
                          showSign: false,
                          trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
                        })}
                      </Text>
                      <Text variant="label" tone="muted">
                        {I18n.t('accounts.out')}{' '}
                        {formatAmount(creditSummary.outstanding, settings, {
                          showSign: false,
                          trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
                        })}
                      </Text>
                    </View>
                  ) : (
                    <Text
                      variant="caption"
                      className={balance >= 0 ? 'text-success' : 'text-destructive'}
                    >
                      {formatAmount(balance, settings, {
                        showSign: false,
                        trueHourlyRate: currentMonthWage?.trueHourlyRate ?? 0,
                      })}
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
          accountGroups={accountGroups}
          onClose={() => {
            setShowEditAccount(false);
            setSelectedAccountId(null);
          }}
          onSave={(updates) => {
            updateAccount(selectedAccount.id, updates);
            setSelectedAccountId(null);
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
      <AccountGroupsSheet
        visible={showGroups}
        groups={accountGroups}
        onClose={() => setShowGroups(false)}
        onCreate={createAccountGroup}
        onRename={renameAccountGroup}
        onDelete={deleteAccountGroup}
      />
    </SettingsPageLayout>
  );
}
