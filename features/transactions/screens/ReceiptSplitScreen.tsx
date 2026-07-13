import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react-native';
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
import { PortionsSheet } from '../components/receiptSplit/PortionsSheet';
import {
  buildDraftFromPersisted,
  buildDraftFromSeed,
  computeDraft,
  type DraftItem,
  type DraftPerson,
  draftToMathInput,
  draftToRepositoryInput,
  draftToSplitInputs,
  formatDraftAmount,
  ME_PERSON_ID,
  mePerson,
  newDraftItem,
  paidConflicts,
  type ReceiptSplitDraft,
  toAmountNumber,
} from '../components/receiptSplit/receiptSplitDraft';
import { consumeReceiptSplitLaunch, type ReceiptSplitLaunch } from '../lib/receiptSplitBridge';
import { itemsSubtotal, reconcileDelta, splitQuantityLine } from '../lib/receiptSplitMath';
import { recentSplitPersonNames } from '../lib/settleUp';

type Step = 1 | 2 | 3;

type NumpadTarget =
  | { kind: 'item'; itemId: string }
  | { kind: 'field'; field: 'tax' | 'service' | 'discount' | 'total' };

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

const personInitial = (person: DraftPerson): string => {
  const source = person.isSelf ? I18n.t('transactions.editor.split.me_label') : person.name.trim();
  return (source.slice(0, 1) || '?').toUpperCase();
};

const personLabel = (person: DraftPerson): string =>
  person.isSelf ? I18n.t('transactions.editor.split.me_label') : person.name.trim();

/**
 * Split by Item — the itemized receipt split editor. Three steps: review the
 * line items (Step 1), assign them to people with optional portion weights
 * (Step 2), and confirm the computed per-person totals + expense metadata
 * (Step 3). Launched via the receiptSplitBridge; on save it writes the parent
 * expense, the bridge transaction_splits rows, and the itemized detail.
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
      // Edit launch without a persisted record — seed from the transaction.
      return buildDraftFromSeed(
        editTransaction
          ? {
              items: [],
              tax: 0,
              service: 0,
              discount: 0,
              total: editTransaction.amount,
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
  const [numpadTarget, setNumpadTarget] = useState<NumpadTarget | null>(null);
  const [numpadExpression, setNumpadExpression] = useState('');
  const [addingPerson, setAddingPerson] = useState(false);
  const [personQuery, setPersonQuery] = useState('');
  const [portionsItemId, setPortionsItemId] = useState<string | null>(null);
  const [paybackPickerPersonId, setPaybackPickerPersonId] = useState<string | null>(null);
  const [activeMetaPicker, setActiveMetaPicker] = useState<'account' | 'category' | 'date' | null>(
    null,
  );
  const savedRef = useRef(false);
  const dirtyRef = useRef(false);
  const itemsEditedRef = useRef(0);
  // A scan-launched create owns its receipt image: attach on save, delete on
  // discard (mirrors the quick-scan editor's contract). Render-synced ref so
  // the beforeRemove listener reads the latest path.
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

  // Orphaned mount (deep link with no bridge payload) — nothing to edit.
  useEffect(() => {
    if (!launch) navigation.goBack();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Any removal that isn't an explicit save confirms discard when dirty.
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

  const mathInput = useMemo(() => draftToMathInput(draft), [draft]);
  const delta = useMemo(() => reconcileDelta(mathInput), [mathInput]);
  const computation = useMemo(() => computeDraft(draft), [draft]);
  const subtotal = useMemo(() => itemsSubtotal(mathInput.items), [mathInput]);

  const formatDraftMoney = useCallback(
    (value: number) => formatAmount(value, settings, { currencyCode: draft.currency }),
    [settings, draft.currency],
  );

  // ----- numpad plumbing -------------------------------------------------

  const openNumpad = useCallback(
    (target: NumpadTarget) => {
      Keyboard.dismiss();
      setAddingPerson(false);
      let current = '';
      if (target.kind === 'item') {
        current = draft.items.find((item) => item.id === target.itemId)?.lineTotal ?? '';
      } else {
        current = draft[target.field];
      }
      setNumpadExpression(sanitizeInitialAmount(current));
      setNumpadTarget(target);
    },
    [draft],
  );

  const writeNumpadValue = useCallback(
    (target: NumpadTarget, raw: string) => {
      updateDraft((prev) => {
        if (target.kind === 'item') {
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.id === target.itemId ? { ...item, lineTotal: raw } : item,
            ),
          };
        }
        return { ...prev, [target.field]: raw };
      });
    },
    [updateDraft],
  );

  const handleNumpadChange = useCallback(
    (expression: string) => {
      setNumpadExpression(expression);
      if (!numpadTarget) return;
      writeNumpadValue(numpadTarget, formatCalcAmount(evaluateExpression(expression)));
    },
    [numpadTarget, writeNumpadValue],
  );

  const handleNumpadConfirm = useCallback(() => {
    if (numpadTarget) {
      itemsEditedRef.current += 1;
      writeNumpadValue(numpadTarget, formatDraftAmount(evaluateExpression(numpadExpression)));
    }
    setNumpadTarget(null);
  }, [numpadTarget, numpadExpression, writeNumpadValue]);

  // ----- step 1 actions ---------------------------------------------------

  const handleAddItem = useCallback(() => {
    void triggerHaptic('selection');
    updateDraft((prev) => ({ ...prev, items: [...prev.items, newDraftItem()] }));
  }, [updateDraft]);

  const handleDeleteItem = useCallback(
    (itemId: string) => {
      void triggerHaptic('selection');
      itemsEditedRef.current += 1;
      setNumpadTarget((target) =>
        target?.kind === 'item' && target.itemId === itemId ? null : target,
      );
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
      itemsEditedRef.current += 1;
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

  const handleAddAdjustment = useCallback(() => {
    void triggerHaptic('selection');
    void trackEvent(AnalyticsEvents.RECEIPT_SPLIT_ITEMS_EDITED, { reconcileAction: 'adjustment' });
    updateDraft((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        newDraftItem({
          name: I18n.t('transactions.receiptSplit.adjustment_name'),
          lineTotal: formatDraftAmount(delta),
          isAdjustment: true,
        }),
      ],
    }));
  }, [updateDraft, delta]);

  const handleTrustItems = useCallback(() => {
    void triggerHaptic('selection');
    void trackEvent(AnalyticsEvents.RECEIPT_SPLIT_ITEMS_EDITED, { reconcileAction: 'trust_items' });
    updateDraft((prev) => {
      const computedTotal =
        itemsSubtotal(prev.items.map((item) => ({ lineTotal: toAmountNumber(item.lineTotal) }))) +
        toAmountNumber(prev.tax) +
        toAmountNumber(prev.service) -
        toAmountNumber(prev.discount);
      return { ...prev, total: formatDraftAmount(computedTotal) };
    });
  }, [updateDraft]);

  // ----- step 2 actions ---------------------------------------------------

  const suggestions = useMemo(() => {
    if (!addingPerson) return [];
    const used = new Set(
      draft.people.map((person) => person.name.trim().toLowerCase()).filter(Boolean),
    );
    const query = personQuery.trim().toLowerCase();
    return recentSplitPersonNames(transactions)
      .filter((name) => !used.has(name.trim().toLowerCase()))
      .filter((name) => (query ? name.toLowerCase().includes(query) : true))
      .slice(0, 6);
  }, [addingPerson, draft.people, personQuery, transactions]);

  const handleAddPerson = useCallback(
    (rawName: string) => {
      const name = rawName.trim();
      if (!name) return;
      const exists = draft.people.some(
        (person) => !person.isSelf && person.name.trim().toLowerCase() === name.toLowerCase(),
      );
      setPersonQuery('');
      setAddingPerson(false);
      Keyboard.dismiss();
      if (exists) return;
      void triggerHaptic('selection');
      const person: DraftPerson = {
        id: `p_${Date.now()}_${draft.people.length}`,
        name,
        isSelf: false,
      };
      updateDraft((prev) => ({ ...prev, people: [...prev.people, person] }));
      setSelectedPersonId(person.id);
    },
    [draft.people, updateDraft],
  );

  const handleRemovePerson = useCallback(
    (personId: string) => {
      if (personId === ME_PERSON_ID) return;
      void triggerHaptic('selection');
      updateDraft((prev) => ({
        ...prev,
        people: prev.people.filter((person) => person.id !== personId),
        items: prev.items.map((item) => ({
          ...item,
          shares: item.shares.filter((share) => share.personId !== personId),
        })),
      }));
      setSelectedPersonId((current) => (current === personId ? ME_PERSON_ID : current));
    },
    [updateDraft],
  );

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

  const handlePortionWeight = useCallback(
    (itemId: string, personId: string, weight: number) => {
      updateDraft((prev) => ({
        ...prev,
        items: prev.items.map((item) => {
          if (item.id !== itemId) return item;
          if (weight <= 0) {
            return { ...item, shares: item.shares.filter((share) => share.personId !== personId) };
          }
          return {
            ...item,
            shares: item.shares.map((share) =>
              share.personId === personId ? { ...share, weight } : share,
            ),
          };
        }),
      }));
    },
    [updateDraft],
  );

  // ----- step 3 / save -----------------------------------------------------

  const conflicts = useMemo(
    () => (isEditMode ? paidConflicts(computation, priorSplits) : []),
    [isEditMode, computation, priorSplits],
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
    const splits = draftToSplitInputs(draft, computation, fallbackPayback, priorSplits);
    const repositoryDraft = draftToRepositoryInput(
      draft,
      launch.mode === 'create' ? launch.source : 'manual',
    );
    const parentInput = {
      type: 'expense' as const,
      amount: toAmountNumber(draft.total),
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
      hasTax: toAmountNumber(draft.tax) > 0,
      hasService: toAmountNumber(draft.service) > 0,
      hasDiscount: toAmountNumber(draft.discount) > 0,
      itemsEdited: itemsEditedRef.current,
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
    priorSplits,
    updateTransactionReceiptSplit,
    createTransactionWithSplits,
    navigation,
  ]);

  // ----- derived UI state ---------------------------------------------------

  const balanced = Math.round(delta * 100) === 0;
  const hasItems = draft.items.length > 0;
  const totalValue = toAmountNumber(draft.total);
  const friendsWithShares = useMemo(
    () => computation.perPerson.some((person) => !person.isSelf && person.total > 0),
    [computation],
  );
  const canLeaveStep1 = hasItems && balanced && totalValue > 0;
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
  const portionsItem = useMemo(
    () => draft.items.find((item) => item.id === portionsItemId) ?? null,
    [draft.items, portionsItemId],
  );
  const personById = useMemo(
    () => new Map(draft.people.map((person) => [person.id, person])),
    [draft.people],
  );

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
            setNumpadTarget(null);
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

  const renderItemsStep = () => (
    <Animated.View key="step-1" entering={FadeIn.duration(250)} className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-6 gap-2"
        keyboardShouldPersistTaps="handled"
      >
        {draft.lowConfidence ? (
          <View className="flex-row items-center gap-2 rounded-2xl bg-warning/10 px-4 py-3">
            <AlertTriangle size={16} color={themeColors.error} />
            <Text variant="caption" tone="warning" className="flex-1">
              {I18n.t('transactions.receiptSplit.low_confidence_banner')}
            </Text>
          </View>
        ) : null}
        {draft.items.length === 0 ? (
          <View className="items-center gap-1 py-10">
            <Text variant="subheading">
              {I18n.t('transactions.receiptSplit.items_empty_title')}
            </Text>
            <Text variant="caption" tone="muted" className="text-center">
              {I18n.t('transactions.receiptSplit.items_empty_message')}
            </Text>
          </View>
        ) : null}
        {draft.items.map((item) => {
          const focused = numpadTarget?.kind === 'item' && numpadTarget.itemId === item.id;
          const singles =
            !item.isAdjustment && Number.isInteger(item.quantity) && item.quantity >= 2;
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
                <View className="flex-1">
                  <TextInput
                    value={item.name}
                    onChangeText={(name) => handleRenameItem(item.id, name)}
                    placeholder={I18n.t('transactions.receiptSplit.item_name_placeholder')}
                    placeholderTextColor={themeColors.mutedForeground}
                    className="text-[15px] text-foreground"
                    style={SINGLE_LINE_TEXT_INPUT_STYLE}
                    onFocus={() => setNumpadTarget(null)}
                  />
                  {item.quantity !== 1 ? (
                    <Text variant="caption" tone="muted">
                      {I18n.t('transactions.receiptSplit.quantity_prefix', {
                        count: item.quantity,
                      })}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openNumpad({ kind: 'item', itemId: item.id })}
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
              {singles ? (
                <Pressable
                  accessibilityRole="button"
                  className="mt-2 self-start rounded-full bg-secondary px-3 py-1"
                  onPress={() => handleSplitSingles(item)}
                >
                  <Text variant="caption" tone="secondary">
                    {I18n.t('transactions.receiptSplit.split_singles')}
                  </Text>
                </Pressable>
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
      </ScrollView>
      {renderReconcileFooter()}
    </Animated.View>
  );

  const renderReconcileFooter = () => {
    const fields: Array<{ field: 'tax' | 'service' | 'discount' | 'total'; label: string }> = [
      { field: 'tax', label: I18n.t('transactions.receiptSplit.tax_label') },
      { field: 'service', label: I18n.t('transactions.receiptSplit.service_label') },
      { field: 'discount', label: I18n.t('transactions.receiptSplit.discount_label') },
      { field: 'total', label: I18n.t('transactions.receiptSplit.total_label') },
    ];
    return (
      <View className="border-t border-border/30 bg-background px-5 pb-2 pt-3">
        <View className="flex-row items-center justify-between pb-2">
          <Text variant="caption" tone="muted">
            {I18n.t('transactions.receiptSplit.subtotal_label')}
          </Text>
          <Text variant="mono">{formatDraftMoney(subtotal)}</Text>
        </View>
        <View className="flex-row gap-2">
          {fields.map(({ field, label }) => {
            const focused = numpadTarget?.kind === 'field' && numpadTarget.field === field;
            return (
              <Pressable
                key={field}
                accessibilityRole="button"
                className={`flex-1 rounded-xl px-2 py-2 ${
                  focused ? 'bg-primary/15' : 'bg-secondary/50'
                }`}
                onPress={() => openNumpad({ kind: 'field', field })}
              >
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {label}
                </Text>
                <Text variant="mono" tone={focused ? 'primary' : 'default'} numberOfLines={1}>
                  {draft[field] || '0.00'}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {!balanced && hasItems ? (
          <View className="mt-2 flex-row items-center gap-2">
            <Text variant="caption" tone="warning" className="flex-1">
              {I18n.t('transactions.receiptSplit.off_by', {
                amount: formatDraftMoney(Math.abs(delta)),
              })}
            </Text>
            <Pressable
              accessibilityRole="button"
              className="rounded-full bg-secondary px-3 py-1.5"
              onPress={handleAddAdjustment}
            >
              <Text variant="caption" tone="secondary">
                {I18n.t('transactions.receiptSplit.add_adjustment')}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              className="rounded-full bg-secondary px-3 py-1.5"
              onPress={handleTrustItems}
            >
              <Text variant="caption" tone="secondary">
                {I18n.t('transactions.receiptSplit.trust_items')}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  const renderAssignStep = () => {
    const unassignedCount = computation.unassignedItemIds.length;
    const unassignedIds = new Set(computation.unassignedItemIds);
    const totalsByPersonId = new Map<string, number>();
    for (const person of computation.perPerson) {
      const match = draft.people.find(
        (candidate) =>
          (candidate.isSelf && person.isSelf) ||
          (!candidate.isSelf &&
            !person.isSelf &&
            candidate.name.trim().toLowerCase() === person.personKey),
      );
      if (match) totalsByPersonId.set(match.id, person.total);
    }
    return (
      <Animated.View key="step-2" entering={FadeIn.duration(250)} className="flex-1">
        <View className="pb-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="px-5 gap-2 items-center"
            keyboardShouldPersistTaps="handled"
          >
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
                  onLongPress={() => handleRemovePerson(person.id)}
                >
                  <Text
                    variant="bodyStrong"
                    className={selected ? 'text-primary-foreground' : undefined}
                  >
                    {personLabel(person)}
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
            <Pressable
              accessibilityRole="button"
              className="flex-row items-center gap-1 rounded-full border border-dashed border-border px-3.5 py-2"
              onPress={() => {
                setNumpadTarget(null);
                setAddingPerson(true);
              }}
            >
              <Plus size={14} color={themeColors.primary} />
              <Text variant="bodyStrong" tone="primary">
                {I18n.t('transactions.editor.split.add_person')}
              </Text>
            </Pressable>
          </ScrollView>
          {addingPerson ? (
            <View className="px-5 pt-2">
              <View className="flex-row items-center gap-2 rounded-2xl bg-secondary/50 px-4 py-2.5">
                <TextInput
                  autoFocus
                  value={personQuery}
                  onChangeText={setPersonQuery}
                  placeholder={I18n.t('transactions.editor.split.person_placeholder')}
                  placeholderTextColor={themeColors.mutedForeground}
                  className="flex-1 text-[15px] text-foreground"
                  style={SINGLE_LINE_TEXT_INPUT_STYLE}
                  onSubmitEditing={() => handleAddPerson(personQuery)}
                  returnKeyType="done"
                />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    setAddingPerson(false);
                    setPersonQuery('');
                  }}
                >
                  <X size={16} color={themeColors.mutedForeground} />
                </Pressable>
              </View>
              {suggestions.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-2 pt-2"
                  keyboardShouldPersistTaps="always"
                >
                  {suggestions.map((name) => (
                    <Pressable
                      key={name}
                      accessibilityRole="button"
                      className="rounded-full bg-secondary/60 px-3 py-1.5"
                      onPress={() => handleAddPerson(name)}
                    >
                      <Text variant="caption">{name}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          ) : null}
        </View>
        <Text variant="caption" tone="muted" className="px-5 pb-2">
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
                onLongPress={() => {
                  if (item.shares.length > 0) setPortionsItemId(item.id);
                }}
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
                  <Pressable
                    accessibilityRole="button"
                    className="flex-row"
                    onPress={() => setPortionsItemId(item.id)}
                  >
                    {item.shares.slice(0, 4).map((draftShare, index) => {
                      const person = personById.get(draftShare.personId);
                      if (!person) return null;
                      return (
                        <View
                          key={draftShare.personId}
                          className="h-7 w-7 items-center justify-center rounded-full border border-background bg-secondary"
                          style={index > 0 ? { marginLeft: -8 } : undefined}
                        >
                          <Text variant="caption">{personInitial(person)}</Text>
                        </View>
                      );
                    })}
                  </Pressable>
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

  const renderSummaryStep = () => (
    <Animated.View key="step-3" entering={FadeIn.duration(250)} className="flex-1">
      <ScrollView className="flex-1" contentContainerClassName="px-5 pb-6 gap-3">
        {computation.perPerson.map((person) => {
          const draftPerson = draft.people.find(
            (candidate) =>
              (candidate.isSelf && person.isSelf) ||
              (!candidate.isSelf &&
                !person.isSelf &&
                candidate.name.trim().toLowerCase() === person.personKey),
          );
          const paybackAccountId = draftPerson
            ? (draft.paybackByPersonId[draftPerson.id] ??
              settings.defaultPaybackAccountId ??
              draft.accountId)
            : null;
          const paybackAccount = accounts.find((account) => account.id === paybackAccountId);
          const itemNameById = new Map(draft.items.map((item) => [item.id, item.name]));
          return (
            <View
              key={person.personKey}
              className="rounded-[22px] border border-border/40 bg-secondary/30 px-4 py-3.5"
            >
              <View className="flex-row items-center justify-between">
                <Text variant="bodyStrong">
                  {person.isSelf
                    ? I18n.t('transactions.receiptSplit.your_share')
                    : person.personName}
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
                {Math.round(person.proration * 100) !== 0 ? (
                  <View className="flex-row items-center justify-between">
                    <Text variant="caption" tone="muted">
                      {I18n.t('transactions.receiptSplit.tax_fees_label')}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {formatDraftMoney(person.proration)}
                    </Text>
                  </View>
                ) : null}
              </View>
              {!person.isSelf && person.total > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  className="mt-3 flex-row items-center justify-between rounded-xl bg-secondary/60 px-3 py-2"
                  onPress={() => draftPerson && setPaybackPickerPersonId(draftPerson.id)}
                >
                  <Text variant="caption" tone="muted">
                    {I18n.t('transactions.receiptSplit.payback_to')}
                  </Text>
                  <Text variant="caption">
                    {paybackAccount?.name ?? I18n.t('ui.select.placeholder')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}

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

  const renderFooter = () => {
    if (numpadTarget) return null;
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
          leading={<ChevronRight size={18} color="#fff" />}
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
      {numpadTarget ? (
        <MiniNumpad
          key={numpadTarget.kind === 'item' ? numpadTarget.itemId : numpadTarget.field}
          initialExpression={numpadExpression}
          onValueChange={handleNumpadChange}
          onConfirm={handleNumpadConfirm}
        />
      ) : null}

      <PortionsSheet
        visible={portionsItem !== null}
        itemName={portionsItem?.name ?? ''}
        rows={(portionsItem?.shares ?? []).map((draftShare) => {
          const person = personById.get(draftShare.personId);
          return {
            personId: draftShare.personId,
            label: person ? personLabel(person) : '',
            weight: draftShare.weight,
          };
        })}
        onChangeWeight={(personId, weight) => {
          if (portionsItemId) handlePortionWeight(portionsItemId, personId, weight);
        }}
        onClose={() => setPortionsItemId(null)}
      />

      <AccountPickerSheet
        visible={paybackPickerPersonId !== null || activeMetaPicker === 'account'}
        onClose={() => {
          setPaybackPickerPersonId(null);
          setActiveMetaPicker(null);
        }}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={
          paybackPickerPersonId
            ? (draft.paybackByPersonId[paybackPickerPersonId] ??
              settings.defaultPaybackAccountId ??
              draft.accountId)
            : draft.accountId
        }
        onSelect={(accountId) => {
          if (paybackPickerPersonId) {
            const personId = paybackPickerPersonId;
            updateDraft((prev) => ({
              ...prev,
              paybackByPersonId: { ...prev.paybackByPersonId, [personId]: accountId },
            }));
          } else {
            updateDraft((prev) => ({ ...prev, accountId }));
          }
          setPaybackPickerPersonId(null);
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
