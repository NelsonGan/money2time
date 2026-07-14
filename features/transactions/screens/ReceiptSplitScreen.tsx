import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AlertTriangle, ChevronLeft, Minus, Plus, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { DatePickerModal } from '~/components/datePicker';
import {
  AccountPickerSheet,
  CategoryEmoji,
  CategoryPickerSheet,
  type CategoryPickerOption,
  FatButton,
  Text,
} from '~/components/ui';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { useApp, useTransactions } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { RootStackParamList } from '~/navigation/rootStack';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { deleteReceiptImage } from '~/services/userAssets';
import type { Category } from '~/types';
import { dayKeyFromDateLocal, formatAmount, formatShortDate } from '~/utils/formatters';

import {
  evaluateExpression,
  formatMoney as formatCalcAmount,
  sanitizeInitialAmount,
} from '../components/editor/calculatorEngine';
import { MiniNumpad } from '../components/editor/MiniNumpad';
import {
  applyPercentToItems,
  buildDraftFromPersisted,
  buildDraftFromSeed,
  buildNameById,
  computeDraft,
  type DraftItem,
  draftItemsSubtotal,
  draftToRepositoryInput,
  draftToSplitInputs,
  formatDraftAmount,
  ME_PERSON_ID,
  newDraftItem,
  newFriend,
  paidConflicts,
  type ReceiptSplitDraft,
  toAmountNumber,
} from '../components/receiptSplit/receiptSplitDraft';
import { consumeReceiptSplitLaunch, type ReceiptSplitLaunch } from '../lib/receiptSplitBridge';
import { friendLetter, splitQuantityLine } from '../lib/receiptSplitMath';
import { recentSplitPersonNames } from '../lib/settleUp';

type Step = 1 | 2 | 3;

const MIN_PEOPLE = 2;
const MAX_PEOPLE = 12;
const DEFAULT_TAX_PERCENT = 10;
const MIN_TAX_PERCENT = -99;
const MAX_TAX_PERCENT = 100;

function buildCategoryPickerOptions(categories: Category[]): {
  parents: CategoryPickerOption[];
  childByParent: Map<string, CategoryPickerOption[]>;
} {
  const parents: CategoryPickerOption[] = [];
  const childByParent = new Map<string, CategoryPickerOption[]>();
  const parentIds = new Set<string>();
  categories.forEach((category) => {
    if (!category.parentId) {
      parents.push({ id: category.id, name: category.name, icon: category.icon });
      parentIds.add(category.id);
    }
  });
  categories.forEach((category) => {
    if (category.parentId && parentIds.has(category.parentId)) {
      const list = childByParent.get(category.parentId) ?? [];
      list.push({ id: category.id, name: category.name, icon: category.icon });
      childByParent.set(category.parentId, list);
    }
  });
  return { parents, childByParent };
}

/**
 * Split by Item — the itemized receipt split editor. Three steps: review the
 * scanned line items (Step 1) and optionally apply a tax/service % that scales
 * the item amounts, choose how many people are splitting and assign each item
 * to its host (Step 2), and confirm the computed per-person totals + expense
 * metadata (Step 3). Launched via the receiptSplitBridge; on save it writes the
 * parent expense, the bridge transaction_splits rows, and the itemized detail.
 * Unnamed people are labeled "Person A", "Person B", … — a custom name is
 * optional.
 */
export function ReceiptSplitScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const themeColors = useThemeColors();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const {
    settings,
    accounts,
    accountGroups,
    categories,
    isSimpleMode,
    simpleWalletId,
    createTransactionWithSplits,
    updateTransactionReceiptSplit,
    getReceiptSplitForTransaction,
  } = useApp();
  const { transactions } = useTransactions();

  const [launch] = useState<ReceiptSplitLaunch | null>(() => consumeReceiptSplitLaunch());
  const editTransaction = useMemo(
    () =>
      launch?.mode === 'edit'
        ? (transactions.find((tx) => tx.id === launch.transactionId) ?? null)
        : null,
    // The edit target is snapshotted on mount; live churn must not reset the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [draft, setDraft] = useState<ReceiptSplitDraft>(() => {
    const defaults = {
      currency: settings.currencyCode,
      date: dayKeyFromDateLocal(new Date()),
      accountId: isSimpleMode ? simpleWalletId : (accounts[0]?.id ?? null),
    };
    if (launch?.mode === 'edit') {
      const persisted = getReceiptSplitForTransaction(launch.transactionId);
      if (persisted && editTransaction) {
        return buildDraftFromPersisted(persisted, editTransaction.splits ?? [], {
          date: editTransaction.date,
          categoryId: editTransaction.categoryId,
          accountId: editTransaction.accountId,
        });
      }
      return buildDraftFromSeed(
        editTransaction
          ? {
              items: [],
              merchant: editTransaction.note,
              currency: editTransaction.currency,
              date: editTransaction.date,
              receiptUri: editTransaction.receiptUri ?? null,
              categoryId: editTransaction.categoryId,
              accountId: editTransaction.accountId,
            }
          : undefined,
        defaults,
      );
    }
    return buildDraftFromSeed(launch?.seed, defaults);
  });

  const [step, setStep] = useState<Step>(1);
  const [selectedPersonId, setSelectedPersonId] = useState<string>(ME_PERSON_ID);
  const [numpadItemId, setNumpadItemId] = useState<string | null>(null);
  const [numpadExpression, setNumpadExpression] = useState('');
  const [activeMetaPicker, setActiveMetaPicker] = useState<'account' | 'category' | 'date' | null>(
    null,
  );
  // Tax/service percentage stepper — pending until "Apply" scales the items.
  const [taxPending, setTaxPending] = useState<number>(DEFAULT_TAX_PERCENT);

  const savedRef = useRef(false);
  const dirtyRef = useRef(false);
  const scanOwnedReceiptRef = useRef<string | null>(null);
  scanOwnedReceiptRef.current =
    launch?.mode === 'create' && launch.source === 'scan' ? draft.receiptUri : null;

  const isEditMode = launch?.mode === 'edit';
  const priorSplits = useMemo(() => editTransaction?.splits ?? [], [editTransaction]);

  useEffect(() => {
    if (!launch) return;
    void trackEvent(
      isEditMode ? AnalyticsEvents.RECEIPT_SPLIT_REOPENED : AnalyticsEvents.RECEIPT_SPLIT_STARTED,
      {
        entryPoint: launch.entryPoint,
        entryMode: launch.mode === 'create' ? launch.source : 'edit',
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!launch) navigation.goBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (savedRef.current || !dirtyRef.current) {
          if (!savedRef.current && launch) {
            if (scanOwnedReceiptRef.current) deleteReceiptImage(scanOwnedReceiptRef.current);
            void trackEvent(AnalyticsEvents.RECEIPT_SPLIT_ABANDONED, { step });
          }
          return;
        }
        event.preventDefault();
        Alert.alert(
          I18n.t('transactions.receiptSplit.discard_title'),
          I18n.t('transactions.receiptSplit.discard_message'),
          [
            { text: I18n.t('transactions.receiptSplit.keep_editing'), style: 'cancel' },
            {
              text: I18n.t('transactions.receiptSplit.discard_confirm'),
              style: 'destructive',
              onPress: () => {
                if (scanOwnedReceiptRef.current) deleteReceiptImage(scanOwnedReceiptRef.current);
                void trackEvent(AnalyticsEvents.RECEIPT_SPLIT_ABANDONED, { step });
                navigation.dispatch(event.data.action);
              },
            },
          ],
        );
      }),
    [navigation, launch, step],
  );

  const updateDraft = useCallback((updater: (prev: ReceiptSplitDraft) => ReceiptSplitDraft) => {
    dirtyRef.current = true;
    setDraft(updater);
  }, []);

  const computation = useMemo(() => computeDraft(draft), [draft]);
  const grandTotal = useMemo(() => draftItemsSubtotal(draft), [draft]);

  const formatDraftMoney = useCallback(
    (value: number) => formatAmount(value, settings, { currencyCode: draft.currency }),
    [settings, draft.currency],
  );

  // Person id → display label ("Me", a custom name, or "Person A").
  const labelForLetter = useCallback(
    (letter: string) => I18n.t('transactions.receiptSplit.person_named', { label: letter }),
    [],
  );
  const displayByPersonId = useMemo(() => {
    const map = new Map<string, string>();
    let friendIndex = 0;
    for (const person of draft.people) {
      if (person.isSelf) {
        map.set(person.id, I18n.t('transactions.editor.split.me_label'));
        continue;
      }
      map.set(person.id, person.name.trim() || labelForLetter(friendLetter(friendIndex)));
      friendIndex += 1;
    }
    return map;
  }, [draft.people, labelForLetter]);

  const personInitial = useCallback(
    (personId: string) => (displayByPersonId.get(personId)?.slice(0, 1) || '?').toUpperCase(),
    [displayByPersonId],
  );

  // ----- numpad plumbing (item amounts only) -----------------------------

  const openNumpad = useCallback(
    (itemId: string) => {
      Keyboard.dismiss();
      const current = draft.items.find((item) => item.id === itemId)?.lineTotal ?? '';
      setNumpadExpression(sanitizeInitialAmount(current));
      setNumpadItemId(itemId);
    },
    [draft.items],
  );

  const writeItemAmount = useCallback(
    (itemId: string, raw: string) => {
      updateDraft((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === itemId ? { ...item, lineTotal: raw } : item)),
      }));
    },
    [updateDraft],
  );

  const handleNumpadChange = useCallback(
    (expression: string) => {
      setNumpadExpression(expression);
      if (!numpadItemId) return;
      writeItemAmount(numpadItemId, formatCalcAmount(evaluateExpression(expression)));
    },
    [numpadItemId, writeItemAmount],
  );

  const handleNumpadConfirm = useCallback(() => {
    if (numpadItemId) {
      writeItemAmount(numpadItemId, formatDraftAmount(evaluateExpression(numpadExpression)));
    }
    setNumpadItemId(null);
  }, [numpadItemId, numpadExpression, writeItemAmount]);

  // ----- step 1 actions ---------------------------------------------------

  const handleAddItem = useCallback(() => {
    void triggerHaptic('selection');
    updateDraft((prev) => ({ ...prev, items: [...prev.items, newDraftItem()] }));
  }, [updateDraft]);

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      void triggerHaptic('selection');
      setNumpadItemId((current) => (current === itemId ? null : current));
      updateDraft((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== itemId) }));
    },
    [updateDraft],
  );

  const handleRenameItem = useCallback(
    (itemId: string, name: string) => {
      updateDraft((prev) => ({
        ...prev,
        items: prev.items.map((item) => (item.id === itemId ? { ...item, name } : item)),
      }));
    },
    [updateDraft],
  );

  const handleSplitSingles = useCallback(
    (item: DraftItem) => {
      const rows = splitQuantityLine({
        quantity: item.quantity,
        lineTotal: toAmountNumber(item.lineTotal),
      });
      if (!rows) return;
      void triggerHaptic('selection');
      updateDraft((prev) => {
        const index = prev.items.findIndex((candidate) => candidate.id === item.id);
        if (index < 0) return prev;
        const replacements = rows.map((row) =>
          newDraftItem({
            name: item.name,
            quantity: 1,
            unitPrice: item.unitPrice,
            lineTotal: formatDraftAmount(row.lineTotal),
            shares: item.shares.map((share) => ({ ...share })),
          }),
        );
        const items = [...prev.items];
        items.splice(index, 1, ...replacements);
        return { ...prev, items };
      });
    },
    [updateDraft],
  );

  const canApplyTax = draft.items.length > 0 && taxPending !== 0;
  const handleApplyTax = useCallback(() => {
    if (!canApplyTax) return;
    void triggerHaptic('selection');
    updateDraft((prev) => ({ ...prev, items: applyPercentToItems(prev.items, taxPending) }));
  }, [canApplyTax, taxPending, updateDraft]);

  // ----- step 2 actions (people count + assignment) -----------------------

  const friends = useMemo(() => draft.people.filter((person) => !person.isSelf), [draft.people]);

  const handleChangePeopleCount = useCallback(
    (nextCount: number) => {
      const clamped = Math.max(MIN_PEOPLE, Math.min(MAX_PEOPLE, nextCount));
      void triggerHaptic('selection');
      updateDraft((prev) => {
        const currentFriends = prev.people.filter((person) => !person.isSelf);
        const wantFriends = clamped - 1; // people count includes Me
        if (wantFriends > currentFriends.length) {
          const added = Array.from({ length: wantFriends - currentFriends.length }, () =>
            newFriend(),
          );
          return { ...prev, people: [...prev.people, ...added] };
        }
        if (wantFriends < currentFriends.length) {
          const removed = currentFriends.slice(wantFriends);
          const removedIds = new Set(removed.map((person) => person.id));
          return {
            ...prev,
            people: prev.people.filter((person) => !removedIds.has(person.id)),
            items: prev.items.map((item) => ({
              ...item,
              shares: item.shares.filter((share) => !removedIds.has(share.personId)),
            })),
          };
        }
        return prev;
      });
      setSelectedPersonId((current) => {
        if (current === ME_PERSON_ID) return current;
        const stillThere = friends.slice(0, clamped - 1).some((person) => person.id === current);
        return stillThere ? current : ME_PERSON_ID;
      });
    },
    [updateDraft, friends],
  );

  const handleRenamePerson = useCallback(
    (personId: string, name: string) => {
      updateDraft((prev) => ({
        ...prev,
        people: prev.people.map((person) =>
          person.id === personId ? { ...person, name } : person,
        ),
      }));
    },
    [updateDraft],
  );

  const nameSuggestions = useMemo(() => {
    const selected = draft.people.find((person) => person.id === selectedPersonId);
    if (!selected || selected.isSelf) return [];
    const query = selected.name.trim().toLowerCase();
    const used = new Set(
      draft.people
        .filter((person) => person.id !== selectedPersonId)
        .map((person) => person.name.trim().toLowerCase())
        .filter(Boolean),
    );
    return recentSplitPersonNames(transactions)
      .filter((name) => !used.has(name.trim().toLowerCase()))
      .filter((name) => (query ? name.toLowerCase().includes(query) : true))
      .slice(0, 6);
  }, [draft.people, selectedPersonId, transactions]);

  const handleToggleItemForSelected = useCallback(
    (itemId: string) => {
      void triggerHaptic('selection');
      updateDraft((prev) => ({
        ...prev,
        items: prev.items.map((item) => {
          if (item.id !== itemId) return item;
          const has = item.shares.some((share) => share.personId === selectedPersonId);
          return {
            ...item,
            shares: has
              ? item.shares.filter((share) => share.personId !== selectedPersonId)
              : [...item.shares, { personId: selectedPersonId, weight: 1 }],
          };
        }),
      }));
    },
    [updateDraft, selectedPersonId],
  );

  const handleAssignRestToMe = useCallback(() => {
    void triggerHaptic('selection');
    updateDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.shares.length === 0
          ? { ...item, shares: [{ personId: ME_PERSON_ID, weight: 1 }] }
          : item,
      ),
    }));
  }, [updateDraft]);

  // ----- step 3 / save -----------------------------------------------------

  const nameById = useMemo(
    () => buildNameById(draft.people, labelForLetter),
    [draft.people, labelForLetter],
  );

  const conflicts = useMemo(
    () => (isEditMode ? paidConflicts(computation, priorSplits, nameById) : []),
    [isEditMode, computation, priorSplits, nameById],
  );

  const handleSave = useCallback(() => {
    if (!launch) return;
    if (conflicts.length > 0) {
      Alert.alert(
        I18n.t('transactions.receiptSplit.paid_locked_title'),
        I18n.t('transactions.receiptSplit.paid_locked_message', { names: conflicts.join(', ') }),
      );
      return;
    }
    const fallbackPayback = settings.defaultPaybackAccountId ?? draft.accountId ?? null;
    const splits = draftToSplitInputs(draft, computation, fallbackPayback, nameById, priorSplits);
    const repositoryDraft = draftToRepositoryInput(
      draft,
      launch.mode === 'create' ? launch.source : 'manual',
      nameById,
    );
    const parentInput = {
      type: 'expense' as const,
      amount: grandTotal,
      currency: draft.currency,
      date: draft.date,
      accountId: draft.accountId,
      categoryId: draft.categoryId,
      note: draft.merchant.trim() || null,
      sentiment: 'neutral' as const,
      receiptUri: draft.receiptUri,
    };

    savedRef.current = true;
    void triggerHaptic('success');
    void trackEvent(AnalyticsEvents.RECEIPT_SPLIT_SAVED, {
      itemCount: draft.items.length,
      personCount: computation.perPerson.length,
      sharedItemCount: draft.items.filter((item) => item.shares.length > 1).length,
      mode: launch.mode,
    });

    if (launch.mode === 'edit') {
      updateTransactionReceiptSplit(launch.transactionId, parentInput, splits, repositoryDraft);
      navigation.goBack();
      return;
    }
    const transactionId = createTransactionWithSplits(parentInput, splits, repositoryDraft);
    navigation.replace('SettleUpTransaction', { transactionId });
  }, [
    launch,
    conflicts,
    settings.defaultPaybackAccountId,
    draft,
    computation,
    grandTotal,
    nameById,
    priorSplits,
    updateTransactionReceiptSplit,
    createTransactionWithSplits,
    navigation,
  ]);

  // ----- derived UI state ---------------------------------------------------

  const hasItems = draft.items.length > 0;
  const friendsWithShares = useMemo(
    () => computation.perPerson.some((person) => !person.isSelf && person.total > 0),
    [computation],
  );
  const canLeaveStep1 = hasItems && grandTotal > 0;
  const canLeaveStep2 = computation.unassignedItemIds.length === 0 && friendsWithShares;

  const categoryOptions = useMemo(
    () => buildCategoryPickerOptions(categories.filter((category) => category.type === 'expense')),
    [categories],
  );
  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === draft.categoryId) ?? null,
    [categories, draft.categoryId],
  );
  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === draft.accountId) ?? null,
    [accounts, draft.accountId],
  );
  const totalsByPersonId = useMemo(() => {
    const map = new Map<string, number>();
    for (const person of computation.perPerson) map.set(person.personKey, person.total);
    return map;
  }, [computation]);

  if (!launch) return <View className="flex-1 bg-background" />;

  const stepTitles: Record<Step, string> = {
    1: I18n.t('transactions.receiptSplit.step_items'),
    2: I18n.t('transactions.receiptSplit.step_assign'),
    3: I18n.t('transactions.receiptSplit.step_summary'),
  };

  // ----- render -------------------------------------------------------------

  const renderHeader = () => (
    <View className="flex-row items-center px-5 pb-2 pt-3">
      <Pressable
        accessibilityRole="button"
        className="h-9 w-9 items-center justify-center rounded-full bg-secondary"
        onPress={() => {
          if (step > 1) {
            setNumpadItemId(null);
            setStep((current) => (current - 1) as Step);
          } else {
            navigation.goBack();
          }
        }}
      >
        <ChevronLeft size={20} color={themeColors.text} />
      </Pressable>
      <View className="flex-1 items-center">
        <Text variant="headingSm">{I18n.t('transactions.receiptSplit.title')}</Text>
        <Text variant="caption" tone="muted">
          {I18n.t('transactions.receiptSplit.step_indicator', { step, total: 3 })} ·{' '}
          {stepTitles[step]}
        </Text>
      </View>
      <View className="h-9 w-9" />
    </View>
  );

  const renderStepDots = () => (
    <View className="flex-row gap-1.5 px-5 pb-3">
      {[1, 2, 3].map((dot) => (
        <View
          key={dot}
          className="h-1.5 flex-1 rounded-full"
          style={{
            backgroundColor: dot <= step ? themeColors.primary : themeColors.backgroundSubtle,
          }}
        />
      ))}
    </View>
  );

  const renderTotalHero = (label: string, value: number) => (
    <View className="items-center px-4 pb-2 pt-4">
      <Text variant="caption" tone="muted">
        {label}
      </Text>
      <Text variant="title" className="mt-1 text-center">
        {formatDraftMoney(value)}
      </Text>
      <View className="mt-2 h-[3px] w-8 rounded-full bg-primary/30" />
    </View>
  );

  const renderItemsStep = () => (
    <Animated.View key="step-1" entering={FadeIn.duration(250)} className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-6 gap-2"
        keyboardShouldPersistTaps="handled"
      >
        {renderTotalHero(I18n.t('transactions.receiptSplit.total_label'), grandTotal)}
        {draft.lowConfidence ? (
          <View className="flex-row items-center gap-2 rounded-2xl bg-warning/10 px-4 py-3">
            <AlertTriangle size={16} color={themeColors.error} />
            <Text variant="caption" tone="warning" className="flex-1">
              {I18n.t('transactions.receiptSplit.low_confidence_banner')}
            </Text>
          </View>
        ) : null}
        {draft.items.length === 0 ? (
          <View className="items-center gap-1 py-8">
            <Text variant="subheading">
              {I18n.t('transactions.receiptSplit.items_empty_title')}
            </Text>
            <Text variant="caption" tone="muted" className="text-center">
              {I18n.t('transactions.receiptSplit.items_empty_message')}
            </Text>
          </View>
        ) : null}
        {draft.items.map((item) => {
          const focused = numpadItemId === item.id;
          const singles = Number.isInteger(item.quantity) && item.quantity >= 2;
          return (
            <View
              key={item.id}
              className={`rounded-2xl border px-4 py-3 ${
                item.lowConfidence
                  ? 'border-warning/40 bg-warning/5'
                  : focused
                    ? 'border-primary/50 bg-secondary/40'
                    : 'border-border/40 bg-secondary/30'
              }`}
            >
              <View className="flex-row items-center gap-3">
                <TextInput
                  value={item.name}
                  onChangeText={(name) => handleRenameItem(item.id, name)}
                  placeholder={I18n.t('transactions.receiptSplit.item_name_placeholder')}
                  placeholderTextColor={themeColors.mutedForeground}
                  className="flex-1 text-[15px] text-foreground"
                  style={SINGLE_LINE_TEXT_INPUT_STYLE}
                  onFocus={() => setNumpadItemId(null)}
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openNumpad(item.id)}
                  className={`rounded-xl px-3 py-1.5 ${focused ? 'bg-primary/15' : 'bg-secondary'}`}
                >
                  <Text variant="mono" tone={focused ? 'primary' : 'default'}>
                    {item.lineTotal || '0.00'}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  className="h-7 w-7 items-center justify-center rounded-full bg-secondary"
                  onPress={() => handleDeleteItem(item.id)}
                >
                  <X size={14} color={themeColors.mutedForeground} />
                </Pressable>
              </View>
              {item.quantity !== 1 ? (
                <View className="mt-2 flex-row items-center gap-2">
                  <Text variant="caption" tone="muted">
                    {I18n.t('transactions.receiptSplit.quantity_prefix', {
                      count: item.quantity,
                    })}
                  </Text>
                  {singles ? (
                    <Pressable
                      accessibilityRole="button"
                      className="rounded-full bg-secondary px-3 py-1"
                      onPress={() => handleSplitSingles(item)}
                    >
                      <Text variant="caption" tone="secondary">
                        {I18n.t('transactions.receiptSplit.split_singles')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
        <Pressable
          accessibilityRole="button"
          className="mt-1 flex-row items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-3"
          onPress={handleAddItem}
        >
          <Plus size={16} color={themeColors.primary} />
          <Text variant="bodyStrong" tone="primary">
            {I18n.t('transactions.receiptSplit.add_item')}
          </Text>
        </Pressable>

        {renderTaxCard()}
      </ScrollView>
    </Animated.View>
  );

  const renderTaxCard = () => (
    <View className="mt-3 overflow-hidden rounded-[20px] border border-border/25 bg-card/60">
      <View className="px-4 pb-1 pt-3">
        <Text variant="caption" tone="muted">
          {taxPending < 0
            ? I18n.t('transactions.editor.split.discount_title')
            : I18n.t('transactions.receiptSplit.tax_service_title')}
        </Text>
      </View>
      <View className="flex-row items-center gap-3 px-4 pb-3 pt-1">
        <Pressable
          onPress={() => setTaxPending((p) => Math.max(MIN_TAX_PERCENT, p - 1))}
          disabled={taxPending <= MIN_TAX_PERCENT}
          hitSlop={6}
          className="h-8 w-8 items-center justify-center rounded-full bg-secondary/60"
          style={{ opacity: taxPending <= MIN_TAX_PERCENT ? 0.4 : 1 }}
        >
          <Minus size={14} color={themeColors.text} />
        </Pressable>
        <Text variant="bodyStrong" className="min-w-[60px] text-center">
          {I18n.t('transactions.editor.split.percent_chip', { percent: taxPending })}
        </Text>
        <Pressable
          onPress={() => setTaxPending((p) => Math.min(MAX_TAX_PERCENT, p + 1))}
          disabled={taxPending >= MAX_TAX_PERCENT}
          hitSlop={6}
          className="h-8 w-8 items-center justify-center rounded-full bg-secondary/60"
          style={{ opacity: taxPending >= MAX_TAX_PERCENT ? 0.4 : 1 }}
        >
          <Plus size={14} color={themeColors.text} />
        </Pressable>
        <View className="flex-1" />
        <Pressable
          onPress={handleApplyTax}
          disabled={!canApplyTax}
          className={`rounded-full px-3.5 py-1.5 active:opacity-80 ${
            canApplyTax ? 'bg-primary' : 'bg-secondary/60'
          }`}
          style={{ opacity: canApplyTax ? 1 : 0.4 }}
        >
          <Text
            variant="caption"
            className={`font-medium ${
              canApplyTax ? 'text-primary-foreground' : 'text-muted-foreground'
            }`}
          >
            {I18n.t('transactions.editor.split.apply')}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderPeopleChips = () => (
    <View className="flex-row flex-wrap gap-2 px-5">
      {draft.people.map((person) => {
        const selected = person.id === selectedPersonId;
        return (
          <Pressable
            key={person.id}
            accessibilityRole="button"
            className={`flex-row items-center gap-2 rounded-full px-3.5 py-2 ${
              selected ? 'bg-primary' : 'bg-secondary'
            }`}
            onPress={() => {
              void triggerHaptic('selection');
              setSelectedPersonId(person.id);
            }}
          >
            <Text variant="bodyStrong" className={selected ? 'text-primary-foreground' : undefined}>
              {displayByPersonId.get(person.id)}
            </Text>
            <Text
              variant="caption"
              className={selected ? 'text-primary-foreground/80' : undefined}
              tone={selected ? undefined : 'muted'}
            >
              {formatDraftMoney(totalsByPersonId.get(person.id) ?? 0)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderAssignStep = () => {
    const unassignedCount = computation.unassignedItemIds.length;
    const unassignedIds = new Set(computation.unassignedItemIds);
    const selectedPerson = draft.people.find((person) => person.id === selectedPersonId);
    return (
      <Animated.View key="step-2" entering={FadeIn.duration(250)} className="flex-1">
        {/* People count stepper */}
        <View className="mx-5 mb-3 flex-row items-center justify-between rounded-2xl bg-secondary/40 px-4 py-2.5">
          <Text variant="bodyStrong">{I18n.t('transactions.receiptSplit.people_label')}</Text>
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => handleChangePeopleCount(draft.people.length - 1)}
              disabled={draft.people.length <= MIN_PEOPLE}
              hitSlop={6}
              className="h-8 w-8 items-center justify-center rounded-full bg-secondary"
              style={{ opacity: draft.people.length <= MIN_PEOPLE ? 0.4 : 1 }}
            >
              <Minus size={14} color={themeColors.text} />
            </Pressable>
            <Text variant="bodyStrong" className="min-w-[24px] text-center">
              {draft.people.length}
            </Text>
            <Pressable
              onPress={() => handleChangePeopleCount(draft.people.length + 1)}
              disabled={draft.people.length >= MAX_PEOPLE}
              hitSlop={6}
              className="h-8 w-8 items-center justify-center rounded-full bg-secondary"
              style={{ opacity: draft.people.length >= MAX_PEOPLE ? 0.4 : 1 }}
            >
              <Plus size={14} color={themeColors.text} />
            </Pressable>
          </View>
        </View>

        {renderPeopleChips()}

        {/* Optional name for the selected friend */}
        {selectedPerson && !selectedPerson.isSelf ? (
          <View className="px-5 pt-3">
            <View className="flex-row items-center gap-2 rounded-2xl bg-secondary/50 px-4 py-2.5">
              <TextInput
                value={selectedPerson.name}
                onChangeText={(name) => handleRenamePerson(selectedPerson.id, name)}
                placeholder={I18n.t('transactions.receiptSplit.optional_name')}
                placeholderTextColor={themeColors.mutedForeground}
                className="flex-1 text-[15px] text-foreground"
                style={SINGLE_LINE_TEXT_INPUT_STYLE}
                returnKeyType="done"
              />
              {selectedPerson.name.trim() ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => handleRenamePerson(selectedPerson.id, '')}
                >
                  <X size={16} color={themeColors.mutedForeground} />
                </Pressable>
              ) : null}
            </View>
            {nameSuggestions.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2 pt-2"
                keyboardShouldPersistTaps="always"
              >
                {nameSuggestions.map((name) => (
                  <Pressable
                    key={name}
                    accessibilityRole="button"
                    className="rounded-full bg-secondary/60 px-3 py-1.5"
                    onPress={() => handleRenamePerson(selectedPerson.id, name)}
                  >
                    <Text variant="caption">{name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
          </View>
        ) : null}

        <Text variant="caption" tone="muted" className="px-5 pb-2 pt-3">
          {I18n.t('transactions.receiptSplit.assign_hint')}
        </Text>
        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-6 gap-2">
          {draft.items.map((item) => {
            const isUnassigned = unassignedIds.has(item.id);
            const selectedHasShare = item.shares.some(
              (draftShare) => draftShare.personId === selectedPersonId,
            );
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                className={`flex-row items-center gap-3 rounded-2xl border px-4 py-3 ${
                  selectedHasShare
                    ? 'border-primary/60 bg-primary/10'
                    : isUnassigned
                      ? 'border-warning/40 bg-warning/5'
                      : 'border-border/40 bg-secondary/30'
                }`}
                onPress={() => handleToggleItemForSelected(item.id)}
              >
                <View className="flex-1">
                  <Text variant="body" numberOfLines={1}>
                    {item.name || I18n.t('transactions.receiptSplit.item_name_placeholder')}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {formatDraftMoney(toAmountNumber(item.lineTotal))}
                  </Text>
                </View>
                {item.shares.length > 0 ? (
                  <View className="flex-row">
                    {item.shares.slice(0, 4).map((draftShare, index) => (
                      <View
                        key={draftShare.personId}
                        className="h-7 w-7 items-center justify-center rounded-full border border-background bg-secondary"
                        style={index > 0 ? { marginLeft: -8 } : undefined}
                      >
                        <Text variant="caption">{personInitial(draftShare.personId)}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text variant="caption" tone="warning">
                    {I18n.t('transactions.receiptSplit.unassigned_label')}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
        {unassignedCount > 0 ? (
          <View className="flex-row items-center justify-between border-t border-border/30 px-5 py-3">
            <Text variant="caption" tone="warning">
              {I18n.t('transactions.receiptSplit.unassigned_count', { count: unassignedCount })}
            </Text>
            <Pressable
              accessibilityRole="button"
              className="rounded-full bg-secondary px-3 py-1.5"
              onPress={handleAssignRestToMe}
            >
              <Text variant="caption" tone="secondary">
                {I18n.t('transactions.receiptSplit.assign_rest_me')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </Animated.View>
    );
  };

  const renderSummaryStep = () => {
    const itemNameById = new Map(draft.items.map((item) => [item.id, item.name]));
    return (
      <Animated.View key="step-3" entering={FadeIn.duration(250)} className="flex-1">
        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-6 gap-3">
          {renderTotalHero(I18n.t('transactions.receiptSplit.total_label'), grandTotal)}
          {computation.perPerson.map((person) => (
            <View
              key={person.personKey}
              className="rounded-[22px] border border-border/40 bg-secondary/30 px-4 py-3.5"
            >
              <View className="flex-row items-center justify-between">
                <Text variant="bodyStrong">
                  {person.isSelf
                    ? I18n.t('transactions.receiptSplit.your_share')
                    : displayByPersonId.get(person.personKey)}
                </Text>
                <Text variant="mono">{formatDraftMoney(person.total)}</Text>
              </View>
              <View className="mt-2 gap-1">
                {person.lines.map((line) => (
                  <View
                    key={`${person.personKey}-${line.itemId}`}
                    className="flex-row items-center justify-between"
                  >
                    <Text variant="caption" tone="muted" className="flex-1 pr-3" numberOfLines={1}>
                      {itemNameById.get(line.itemId) ||
                        I18n.t('transactions.receiptSplit.item_name_placeholder')}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatDraftMoney(line.amount)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ))}

          <View className="mt-1 rounded-[22px] border border-border/40 px-4 py-1">
            <Pressable
              accessibilityRole="button"
              className="flex-row items-center justify-between border-b border-border/30 py-3"
              onPress={() => setActiveMetaPicker('account')}
            >
              <Text variant="body" tone="muted">
                {I18n.t('transaction_detail.account')}
              </Text>
              <Text variant="body">{selectedAccount?.name ?? I18n.t('ui.select.placeholder')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="flex-row items-center justify-between border-b border-border/30 py-3"
              onPress={() => setActiveMetaPicker('category')}
            >
              <Text variant="body" tone="muted">
                {I18n.t('transaction_detail.category')}
              </Text>
              <View className="flex-row items-center gap-1.5">
                {selectedCategory ? <CategoryEmoji icon={selectedCategory.icon} size={16} /> : null}
                <Text variant="body">
                  {selectedCategory?.name ?? I18n.t('ui.select.placeholder')}
                </Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="flex-row items-center justify-between border-b border-border/30 py-3"
              onPress={() => setActiveMetaPicker('date')}
            >
              <Text variant="body" tone="muted">
                {I18n.t('transactions.receiptSplit.date_label')}
              </Text>
              <Text variant="body">{formatShortDate(draft.date)}</Text>
            </Pressable>
            <View className="flex-row items-center justify-between py-3">
              <Text variant="body" tone="muted">
                {I18n.t('transaction_detail.note')}
              </Text>
              <TextInput
                value={draft.merchant}
                onChangeText={(merchant) => updateDraft((prev) => ({ ...prev, merchant }))}
                placeholder={I18n.t('transactions.receiptSplit.merchant_placeholder')}
                placeholderTextColor={themeColors.mutedForeground}
                className="flex-1 pl-6 text-right text-[15px] text-foreground"
                style={SINGLE_LINE_TEXT_INPUT_STYLE}
              />
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    );
  };

  const renderFooter = () => {
    if (numpadItemId) return null;
    if (step === 1) {
      return (
        <View className="px-5" style={{ paddingBottom: Math.max(bottomInset, 12) }}>
          <FatButton
            label={I18n.t('common.next')}
            disabled={!canLeaveStep1}
            color={themeColors.primary}
            onPress={() => setStep(2)}
          />
        </View>
      );
    }
    if (step === 2) {
      return (
        <View className="px-5" style={{ paddingBottom: Math.max(bottomInset, 12) }}>
          <FatButton
            label={I18n.t('common.next')}
            disabled={!canLeaveStep2}
            color={themeColors.primary}
            onPress={() => setStep(3)}
          />
        </View>
      );
    }
    return (
      <View className="px-5" style={{ paddingBottom: Math.max(bottomInset, 12) }}>
        <FatButton
          label={I18n.t('transactions.receiptSplit.save_action')}
          color={themeColors.primary}
          onPress={handleSave}
        />
      </View>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {renderHeader()}
      {renderStepDots()}
      {step === 1 ? renderItemsStep() : step === 2 ? renderAssignStep() : renderSummaryStep()}
      {renderFooter()}
      {numpadItemId ? (
        <MiniNumpad
          key={numpadItemId}
          initialExpression={numpadExpression}
          onValueChange={handleNumpadChange}
          onConfirm={handleNumpadConfirm}
        />
      ) : null}

      <AccountPickerSheet
        visible={activeMetaPicker === 'account'}
        onClose={() => setActiveMetaPicker(null)}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={draft.accountId}
        onSelect={(accountId) => {
          updateDraft((prev) => ({ ...prev, accountId }));
          setActiveMetaPicker(null);
        }}
      />

      <CategoryPickerSheet
        visible={activeMetaPicker === 'category'}
        onClose={() => setActiveMetaPicker(null)}
        parents={categoryOptions.parents}
        childByParent={categoryOptions.childByParent}
        allowParentSelection
        selectedCategoryId={draft.categoryId}
        onSelect={(categoryId) => {
          updateDraft((prev) => ({ ...prev, categoryId }));
          setActiveMetaPicker(null);
        }}
      />

      <DatePickerModal
        visible={activeMetaPicker === 'date'}
        value={draft.date}
        onSelect={(date) => {
          updateDraft((prev) => ({ ...prev, date }));
          setActiveMetaPicker(null);
        }}
        onClose={() => setActiveMetaPicker(null)}
      />
    </SafeAreaView>
  );
}
