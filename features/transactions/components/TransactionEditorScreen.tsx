import {
  ArrowLeftRight,
  ArrowRight,
  Calendar,
  ChevronLeft,
  Clock,
  CreditCard,
  FileText,
  Hash,
  Power,
  Repeat,
  Timer,
  Trash2,
  Type,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InteractionManager,
  Keyboard,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  AccountPanel,
  CategoryPanel,
  DatePanel,
  NumpadPanel,
  SummaryRow,
} from '~/features/transactions/components/editor';
import { formatMoney } from '~/features/transactions/components/editor/calculatorEngine';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionType } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { getErrorMessage } from '~/utils/errorHandling';
import { amountToHoursByRate, dayKeyFromIsoLocal, formatHours } from '~/utils/formatters';

type ActiveField =
  | 'amount'
  | 'date'
  | 'account'
  | 'fromAccount'
  | 'toAccount'
  | 'category'
  | 'note'
  | 'ruleName'
  | 'repeat'
  | 'interval'
  | 'ends'
  | 'endDate'
  | 'status'
  | null;

const TYPE_CARDS: {
  value: TransactionType;
  label: string;
  emoji: string;
  bgClass: string;
  borderClass: string;
}[] = [
  {
    value: 'expense',
    label: I18n.t('transactions.filters.spent'),
    emoji: '💸',
    bgClass: 'bg-destructive/8',
    borderClass: 'border-destructive/50',
  },
  {
    value: 'income',
    label: I18n.t('transactions.filters.earned'),
    emoji: '💰',
    bgClass: 'bg-success/10',
    borderClass: 'border-success/50',
  },
  {
    value: 'transfer',
    label: I18n.t('transactions.filters.moved'),
    emoji: '↔️',
    bgClass: 'bg-primary/10',
    borderClass: 'border-primary/50',
  },
  {
    value: 'balance_adjustment',
    label: I18n.t('transactions.filters.adjustment'),
    emoji: '⚖️',
    bgClass: 'bg-primary/10',
    borderClass: 'border-primary/50',
  },
];

interface TransactionEditorInitialValues {
  type: TransactionType;
  amount: string;
  date: string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  note: string;
}

interface TransactionEditorScreenProps {
  mode: 'create' | 'edit';
  onClose: () => void;
  onSubmit: (input: CreateTransactionInput) => void;
  onDelete?: () => void;
  initialValues?: Partial<TransactionEditorInitialValues>;
  titleOverride?: string;
  subtitleOverride?: string;
  submitLabelOverride?: string;
  deleteLabel?: string;
  restrictTypeOptions?: TransactionType[];
  hideAccountSelector?: boolean;
  hideSubcategories?: boolean;
  initialAccountId?: string;
  recurringOptions?: {
    initialName?: string;
    initialPattern?: 'daily' | 'weekly' | 'monthly' | 'yearly';
    initialInterval?: number;
    initialEndDate?: string | null;
    initialIsActive?: boolean;
    onSubmitRecurring: (payload: {
      transaction: CreateTransactionInput;
      recurring: {
        name: string;
        pattern: 'daily' | 'weekly' | 'monthly' | 'yearly';
        interval: number;
        endDate: string | null;
        isActive: boolean;
      };
    }) => void;
  };
}

function toDateInput(d: Date) {
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}

function parseDateInput(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function toUtcIsoFromLocalDateInput(value: string, mode: 'start' | 'end' = 'start') {
  const parsed = parseDateInput(value);
  if (!parsed) return null;
  const hours = mode === 'end' ? 23 : 0;
  const minutes = mode === 'end' ? 59 : 0;
  const seconds = mode === 'end' ? 59 : 0;
  const milliseconds = mode === 'end' ? 999 : 0;
  const localDate = new Date(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    hours,
    minutes,
    seconds,
    milliseconds,
  );
  if (Number.isNaN(localDate.getTime())) return null;
  return localDate.toISOString();
}

function TypePill({
  item,
  selected,
  onPress,
}: {
  item: (typeof TYPE_CARDS)[0];
  selected: boolean;
  onPress: () => void;
}) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.94 });
  return (
    <Animated.View style={animatedStyle} className="flex-1">
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          onPress();
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className={cn(
          'rounded-full border py-2 items-center flex-row justify-center gap-1.5',
          selected ? `${item.bgClass} ${item.borderClass}` : 'bg-card border-border/30',
        )}
      >
        <Text className="text-[14px]">{item.emoji}</Text>
        <Text
          variant="caption"
          className={cn(selected ? 'text-foreground' : 'text-muted-foreground')}
        >
          {item.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

function formatDateDisplay(dateStr: string) {
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;

  const now = new Date();
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: parsed.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function TransactionEditorScreen({
  mode,
  onClose,
  onSubmit,
  onDelete,
  initialValues,
  titleOverride,
  subtitleOverride,
  submitLabelOverride,
  deleteLabel = I18n.t('transactions.editor.delete_transaction'),
  restrictTypeOptions,
  hideAccountSelector = false,
  hideSubcategories = false,
  initialAccountId,
  recurringOptions,
}: TransactionEditorScreenProps) {
  const { accounts, accountGroups, categories, settings, currentMonthWage } = useApp();
  const themeColors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();

  const initialType = initialValues?.type ?? 'expense';
  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState(initialValues?.amount ?? '');
  const [date, setDate] = useState(initialValues?.date ?? toDateInput(new Date()));
  const [accountId, setAccountId] = useState<string | null>(
    initialValues?.accountId ??
      initialAccountId ??
      (mode === 'create' ? null : (accounts[0]?.id ?? null)),
  );
  const [fromAccountId, setFromAccountId] = useState<string | null>(
    initialValues?.fromAccountId ?? (mode === 'create' ? null : (accounts[0]?.id ?? null)),
  );
  const [toAccountId, setToAccountId] = useState<string | null>(
    initialValues?.toAccountId ??
      (mode === 'create' ? null : (accounts[1]?.id ?? accounts[0]?.id ?? null)),
  );
  const [categoryId, setCategoryId] = useState<string | null>(initialValues?.categoryId ?? null);
  const [note, setNote] = useState(initialValues?.note ?? '');

  const [recurrenceName, setRecurrenceName] = useState(recurringOptions?.initialName ?? '');
  const [recurrencePattern, setRecurrencePattern] = useState<
    'daily' | 'weekly' | 'monthly' | 'yearly'
  >(recurringOptions?.initialPattern ?? 'monthly');
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    String(recurringOptions?.initialInterval ?? 1),
  );
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(
    recurringOptions?.initialEndDate ? dayKeyFromIsoLocal(recurringOptions.initialEndDate) : '',
  );
  const [recurrenceEndMode, setRecurrenceEndMode] = useState<'never' | 'on_date'>(
    recurringOptions?.initialEndDate ? 'on_date' : 'never',
  );
  const [recurrenceIsActive, setRecurrenceIsActive] = useState(
    recurringOptions?.initialIsActive ?? true,
  );

  const [activeField, setActiveField] = useState<ActiveField>('amount');
  const [fieldErrors, setFieldErrors] = useState<
    Partial<
      Record<
        | 'rule_name'
        | 'amount'
        | 'account'
        | 'category'
        | 'from_account'
        | 'to_account'
        | 'end_date',
        string
      >
    >
  >({});
  const [error, setError] = useState<string | null>(null);
  const autoNoteFromCategoryRef = useRef<string | null>(null);
  const noteInputRef = useRef<TextInput>(null);
  const recurrenceNameRef = useRef<TextInput>(null);
  const recurrenceIntervalRef = useRef<TextInput>(null);
  const recurrenceEndDateRef = useRef<TextInput>(null);
  const patternLabels: Record<string, string> = {
    daily: I18n.t('transactions.editor.daily'),
    weekly: I18n.t('transactions.editor.weekly'),
    monthly: I18n.t('transactions.editor.monthly'),
    yearly: I18n.t('transactions.editor.yearly'),
  };
  const blurNativeInputs = useCallback(() => {
    noteInputRef.current?.blur();
    recurrenceNameRef.current?.blur();
    recurrenceIntervalRef.current?.blur();
    recurrenceEndDateRef.current?.blur();
  }, []);
  const isNativeKeyboardField = useCallback(
    (field: ActiveField) =>
      field === 'note' || field === 'ruleName' || field === 'interval' || field === 'endDate',
    [],
  );
  const activateField = useCallback(
    (field: ActiveField) => {
      if (!field || !isNativeKeyboardField(field)) {
        blurNativeInputs();
        Keyboard.dismiss();
      }
      setActiveField(field);
    },
    [blurNativeInputs, isNativeKeyboardField],
  );

  const mapActiveFieldForType = useCallback(
    (field: ActiveField, nextType: TransactionType): ActiveField => {
      if (!field) return null;
      if (nextType === 'transfer') {
        if (field === 'account' || field === 'category') return 'fromAccount';
        return field;
      }
      if (nextType === 'balance_adjustment') {
        if (field === 'fromAccount' || field === 'toAccount' || field === 'category')
          return 'account';
        if (field === 'note' || field === 'date') return 'amount';
        return field;
      }
      if (field === 'fromAccount' || field === 'toAccount') return 'account';
      return field;
    },
    [],
  );

  const availableTypeCards = useMemo(() => {
    const allowedTypes: TransactionType[] =
      restrictTypeOptions && restrictTypeOptions.length > 0
        ? restrictTypeOptions
        : ['expense', 'income', 'transfer'];
    return TYPE_CARDS.filter((item) => allowedTypes.includes(item.value));
  }, [restrictTypeOptions]);
  const isTransferType = type === 'transfer';
  const isBalanceAdjustmentType = type === 'balance_adjustment';
  const showTypeSelector = availableTypeCards.length > 1;

  const handleTypeChange = useCallback(
    (nextType: TransactionType) => {
      if (nextType === type) return;
      const previousType = type;

      setType(nextType);
      setCategoryId(null);
      autoNoteFromCategoryRef.current = null;
      setActiveField((current) => mapActiveFieldForType(current, nextType));

      if (nextType === 'transfer') {
        if (previousType === 'income' || previousType === 'expense') {
          setFromAccountId(accountId);
          setToAccountId(null);
          setAccountId(null);
        } else if (mode === 'create') {
          setAccountId(null);
          setFromAccountId(null);
          setToAccountId(null);
        }
      } else if (previousType === 'transfer') {
        setAccountId(fromAccountId);
        setFromAccountId(null);
        setToAccountId(null);
      }

      setFieldErrors((previous) => {
        if (
          !previous.account &&
          !previous.from_account &&
          !previous.to_account &&
          !previous.category
        ) {
          return previous;
        }
        const next = { ...previous };
        delete next.account;
        delete next.from_account;
        delete next.to_account;
        delete next.category;
        return next;
      });
    },
    [accountId, fromAccountId, mapActiveFieldForType, mode, type],
  );

  useEffect(() => {
    if (availableTypeCards.some((item) => item.value === type)) return;
    const fallbackType = availableTypeCards[0]?.value ?? 'expense';
    handleTypeChange(fallbackType);
  }, [availableTypeCards, handleTypeChange, type]);

  const typedCategories = useMemo(
    () =>
      type === 'expense' || type === 'income'
        ? categories.filter((category) => category.type === type)
        : [],
    [categories, type],
  );
  const topLevelCategories = useMemo(
    () => typedCategories.filter((category) => !category.parentId),
    [typedCategories],
  );
  const childCategoriesByParent = useMemo(() => {
    if (hideSubcategories) return new Map<string, typeof typedCategories>();
    const map = new Map<string, typeof typedCategories>();
    typedCategories
      .filter((item) => !!item.parentId)
      .forEach((item) => {
        const key = item.parentId as string;
        if (!map.has(key)) map.set(key, []);
        map.get(key)?.push(item);
      });
    return map;
  }, [hideSubcategories, typedCategories]);

  const categoryPreview = useMemo(() => {
    if (!categoryId) return null;
    const parent = topLevelCategories.find((item) => item.id === categoryId);
    if (parent) return { icon: resolveCategoryIcon(parent.icon), name: parent.name };
    for (const [parentId, children] of childCategoriesByParent.entries()) {
      const found = children.find((child) => child.id === categoryId);
      if (!found) continue;
      const parentNode = topLevelCategories.find((item) => item.id === parentId);
      return {
        icon: resolveCategoryIcon(found.icon, parentNode?.icon ?? null),
        name: parentNode ? `${parentNode.name} / ${found.name}` : found.name,
      };
    }
    return null;
  }, [categoryId, childCategoriesByParent, topLevelCategories]);

  const nudgeMessage = useMemo(() => {
    if (type !== 'expense') return null;
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) return null;
    const rate = currentMonthWage?.trueHourlyRate ?? 0;
    if (rate <= 0) return null;
    const hours = amountToHoursByRate(numericAmount, rate, settings.hourRounding);
    if (hours < 0.25)
      return I18n.t('transactions.editor.nudge.small', { hours: formatHours(hours) });
    if (hours < 1) return I18n.t('transactions.editor.nudge.pause', { hours: formatHours(hours) });
    return I18n.t('transactions.editor.nudge.large', { hours: formatHours(hours) });
  }, [amount, currentMonthWage?.trueHourlyRate, settings.hourRounding, type]);

  const accountName = useMemo(() => {
    if (!accountId) return null;
    return accounts.find((a) => a.id === accountId)?.name ?? null;
  }, [accountId, accounts]);

  const fromAccountName = useMemo(() => {
    if (!fromAccountId) return null;
    return accounts.find((a) => a.id === fromAccountId)?.name ?? null;
  }, [fromAccountId, accounts]);

  const toAccountName = useMemo(() => {
    if (!toAccountId) return null;
    return accounts.find((a) => a.id === toAccountId)?.name ?? null;
  }, [toAccountId, accounts]);

  useEffect(() => {
    Keyboard.dismiss();
  }, []);

  const amountDisplay = useMemo(() => {
    const num = Number(amount);
    if (!amount || !Number.isFinite(num)) return `${settings.currencySymbol}0.00`;
    return `${settings.currencySymbol}${formatMoney(num)}`;
  }, [amount, settings.currencySymbol]);

  const amountTone = useMemo(() => {
    if (isBalanceAdjustmentType) {
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount === 0) return 'default' as const;
      return numericAmount > 0 ? ('success' as const) : ('error' as const);
    }
    if (type === 'expense') return 'error' as const;
    if (type === 'income') return 'success' as const;
    return 'default' as const;
  }, [amount, isBalanceAdjustmentType, type]);

  const handleSubmit = () => {
    const numericAmount = Number(amount);
    const amountDraft = amount.trim();
    if (!amountDraft || !Number.isFinite(numericAmount)) {
      setFieldErrors({ amount: I18n.t('transactions.editor.error.amount_required') });
      activateField('amount');
      return;
    }

    const txDate = toUtcIsoFromLocalDateInput(date) ?? new Date().toISOString();

    try {
      // Build the submission payload; validate per type.
      let submitPayload: CreateTransactionInput | null = null;
      let recurringSubmit: (() => void) | null = null;

      if (isBalanceAdjustmentType) {
        if (!accountId) {
          setError(I18n.t('transactions.editor.error.complete_required'));
          setFieldErrors({ account: I18n.t('transactions.editor.error.required') });
          activateField('account');
          return;
        }
        submitPayload = {
          type,
          amount: numericAmount,
          currency: settings.currencySymbol,
          date: txDate,
          accountId,
          categoryId: null,
          fromAccountId: null,
          toAccountId: null,
          note: note.trim() || null,
        };
      } else if (isTransferType) {
        const transferErrors: typeof fieldErrors = {};
        if (!fromAccountId)
          transferErrors.from_account = I18n.t('transactions.editor.error.required');
        if (!toAccountId) transferErrors.to_account = I18n.t('transactions.editor.error.required');
        if (fromAccountId && toAccountId && fromAccountId === toAccountId) {
          transferErrors.to_account = I18n.t('transactions.editor.error.must_be_different_account');
        }
        if (Object.keys(transferErrors).length > 0) {
          setError(I18n.t('transactions.editor.error.complete_required'));
          setFieldErrors(transferErrors);
          if (transferErrors.from_account) activateField('fromAccount');
          else if (transferErrors.to_account) activateField('toAccount');
          return;
        }
        submitPayload = {
          type,
          amount: numericAmount,
          currency: settings.currencySymbol,
          date: txDate,
          fromAccountId,
          toAccountId,
          accountId: null,
          categoryId: null,
          note: note.trim() || null,
        };
      } else {
        const baseErrors: typeof fieldErrors = {};
        if (!hideAccountSelector && !accountId)
          baseErrors.account = I18n.t('transactions.editor.error.required');
        if (!categoryId) baseErrors.category = I18n.t('transactions.editor.error.required');
        if (Object.keys(baseErrors).length > 0) {
          setError(I18n.t('transactions.editor.error.complete_required'));
          setFieldErrors(baseErrors);
          if (baseErrors.account) activateField('account');
          else if (baseErrors.category) activateField('category');
          return;
        }
        submitPayload = {
          type,
          amount: numericAmount,
          currency: settings.currencySymbol,
          date: txDate,
          accountId,
          categoryId,
          fromAccountId: null,
          toAccountId: null,
          note: note.trim() || null,
        };
        if (recurringOptions) {
          const normalizedName = recurrenceName.trim();
          if (!normalizedName) {
            setError(I18n.t('transactions.editor.error.enter_rule_name'));
            setFieldErrors({ rule_name: I18n.t('transactions.editor.error.required') });
            return;
          }
          const interval = Math.max(1, Math.trunc(Number(recurrenceInterval) || 1));
          const endDateDraft = recurrenceEndDate.trim();
          const endDateIsoValue = toUtcIsoFromLocalDateInput(endDateDraft, 'end');
          const endDateIso = recurrenceEndMode === 'on_date' ? endDateIsoValue : null;
          if (recurrenceEndMode === 'on_date' && (!endDateDraft || !endDateIsoValue)) {
            setError(I18n.t('transactions.editor.error.valid_end_date'));
            setFieldErrors({ end_date: I18n.t('transactions.editor.error.required') });
            return;
          }
          const capturedPayload = submitPayload;
          recurringSubmit = () => {
            recurringOptions.onSubmitRecurring({
              transaction: capturedPayload,
              recurring: {
                name: normalizedName,
                pattern: recurrencePattern,
                interval,
                endDate: endDateIso,
                isActive: recurrenceIsActive,
              },
            });
          };
          submitPayload = null; // handled by recurringSubmit
        }
      }

      // Close modal immediately, then submit after the dismiss animation
      void triggerHaptic('success');
      onClose();

      const deferredSubmit = submitPayload ? () => onSubmit(submitPayload) : recurringSubmit;

      if (deferredSubmit) {
        InteractionManager.runAfterInteractions(deferredSubmit);
      }
    } catch (submitError) {
      setError(getErrorMessage(submitError, I18n.t('errors.generic_operation_failed')));
    }
  };

  const title =
    titleOverride ??
    (mode === 'create'
      ? I18n.t('transactions.editor.title_create')
      : I18n.t('transactions.editor.title_edit'));
  const subtitle = subtitleOverride ?? null;
  const submitLabel = submitLabelOverride ?? I18n.t('common.save');
  const summaryFlex = windowHeight < 700 ? 0.38 : 0.44;
  const isRecurringEditor = Boolean(recurringOptions);
  const showSubtitle = Boolean(subtitle) && isRecurringEditor;
  const inlineRecurringFields: ActiveField[] = ['ruleName', 'interval', 'endDate', 'status'];
  const showToolZone =
    activeField !== null && activeField !== 'note' && !inlineRecurringFields.includes(activeField);
  const summaryBottomPadding = isRecurringEditor ? 196 : showToolZone ? 92 : 16;

  useEffect(() => {
    if (!activeField || isNativeKeyboardField(activeField)) return;
    blurNativeInputs();
    Keyboard.dismiss();
  }, [activeField, blurNativeInputs, isNativeKeyboardField]);

  const focusNoteField = useCallback(() => {
    activateField('note');
    requestAnimationFrame(() => noteInputRef.current?.focus());
  }, [activateField]);

  const handleDateSelect = useCallback(
    (nextDate: string) => {
      setDate(nextDate);
      activateField('amount');
    },
    [activateField],
  );

  const handleAmountValueChange = useCallback((val: string) => {
    setAmount(val);
  }, []);

  const handleAmountConfirm = useCallback(
    (val: string) => {
      setAmount(val);
      if (hideAccountSelector) {
        activateField('category');
      } else {
        activateField(isTransferType ? 'fromAccount' : 'account');
      }
    },
    [activateField, hideAccountSelector, isTransferType],
  );

  const handleAccountSelect = useCallback(
    (nextAccountId: string) => {
      setAccountId(nextAccountId);
      if (isBalanceAdjustmentType) {
        activateField('amount');
        return;
      }
      activateField('category');
    },
    [activateField, isBalanceAdjustmentType],
  );

  const handleFromAccountSelect = useCallback(
    (nextAccountId: string) => {
      setFromAccountId(nextAccountId);
      activateField('toAccount');
    },
    [activateField],
  );

  const handleToAccountSelect = useCallback(
    (nextAccountId: string) => {
      setToAccountId(nextAccountId);
      focusNoteField();
    },
    [focusNoteField],
  );

  const handleSwapTransferAccounts = useCallback(() => {
    void triggerHaptic('selection');
    setFromAccountId(toAccountId);
    setToAccountId(fromAccountId);
    setFieldErrors((previous) => {
      if (!previous.from_account && !previous.to_account) return previous;
      const next = { ...previous };
      delete next.from_account;
      delete next.to_account;
      return next;
    });
  }, [fromAccountId, toAccountId]);

  const categoryNoteLabel = useCallback(
    (targetCategoryId: string) => {
      const parent = topLevelCategories.find((item) => item.id === targetCategoryId);
      if (parent) return parent.name;
      for (const [parentId, children] of childCategoriesByParent.entries()) {
        const child = children.find((item) => item.id === targetCategoryId);
        if (!child) continue;
        const parentNode = topLevelCategories.find((item) => item.id === parentId);
        return parentNode ? `${parentNode.name} / ${child.name}` : child.name;
      }
      return null;
    },
    [childCategoriesByParent, topLevelCategories],
  );

  const handleNoteChange = useCallback((nextNote: string) => {
    setNote(nextNote);
    if (!autoNoteFromCategoryRef.current) return;
    if (nextNote.trim() !== autoNoteFromCategoryRef.current) {
      autoNoteFromCategoryRef.current = null;
    }
  }, []);

  const shouldSelectAutoNoteOnFocus =
    autoNoteFromCategoryRef.current !== null && note.trim() === autoNoteFromCategoryRef.current;

  const handleCategorySelect = (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    if (mode === 'create') {
      const nextDefaultNote = categoryNoteLabel(nextCategoryId);
      if (nextDefaultNote) {
        setNote((previous) => {
          const previousTrimmed = previous.trim();
          const canAutofill =
            previousTrimmed.length === 0 ||
            (autoNoteFromCategoryRef.current !== null &&
              previousTrimmed === autoNoteFromCategoryRef.current);
          if (!canAutofill) {
            autoNoteFromCategoryRef.current = null;
            return previous;
          }
          autoNoteFromCategoryRef.current = nextDefaultNote;
          return nextDefaultNote;
        });
      }
    }
    focusNoteField();
  };

  const categoryPanelParents = useMemo(
    () =>
      topLevelCategories.map((item) => ({
        id: item.id,
        name: item.name,
        icon: resolveCategoryIcon(item.icon),
      })),
    [topLevelCategories],
  );
  const categoryPanelChildren = useMemo(
    () =>
      new Map(
        Array.from(childCategoriesByParent.entries()).map(([key, items]) => [
          key,
          items.map((item) => {
            const parentNode = topLevelCategories.find((parent) => parent.id === key);
            return {
              id: item.id,
              name: item.name,
              icon: resolveCategoryIcon(item.icon, parentNode?.icon ?? null),
            };
          }),
        ]),
      ),
    [childCategoriesByParent, topLevelCategories],
  );

  const renderToolPanel = () => {
    switch (activeField) {
      case 'amount':
        return (
          <NumpadPanel
            initialExpression={amount}
            currencySymbol={settings.currencySymbol}
            trueHourlyRate={currentMonthWage?.trueHourlyRate ?? 0}
            hourRounding={settings.hourRounding}
            onValueChange={handleAmountValueChange}
            onConfirm={handleAmountConfirm}
            compact={windowHeight < 700}
          />
        );
      case 'date':
        return <DatePanel value={date} onSelect={handleDateSelect} />;
      case 'account':
        return (
          <AccountPanel
            accounts={accounts}
            accountGroups={accountGroups}
            selectedId={accountId}
            onSelect={handleAccountSelect}
          />
        );
      case 'fromAccount':
        return (
          <AccountPanel
            accounts={accounts}
            accountGroups={accountGroups}
            selectedId={fromAccountId}
            disabledId={toAccountId}
            onSelect={handleFromAccountSelect}
          />
        );
      case 'toAccount':
        return (
          <AccountPanel
            accounts={accounts}
            accountGroups={accountGroups}
            selectedId={toAccountId}
            disabledId={fromAccountId}
            onSelect={handleToAccountSelect}
          />
        );
      case 'category':
        return (
          <CategoryPanel
            parents={categoryPanelParents}
            childByParent={categoryPanelChildren}
            selectedCategoryId={categoryId}
            onSelect={handleCategorySelect}
          />
        );
      case 'repeat':
        return (
          <View className="flex-1 px-5 pt-3">
            <Text variant="caption" tone="muted" className="mb-3">
              {I18n.t('transactions.editor.repeat')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => {
                    void triggerHaptic('selection');
                    setRecurrencePattern(p);
                  }}
                  className={cn(
                    'w-[48%] rounded-2xl border px-3.5 py-3.5',
                    recurrencePattern === p
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/40 bg-card',
                  )}
                >
                  <Text
                    className={cn(recurrencePattern === p ? 'text-primary' : 'text-foreground')}
                  >
                    {patternLabels[p]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      case 'ends':
        return (
          <View className="flex-1 px-5 pt-3">
            <Text variant="caption" tone="muted" className="mb-3">
              {I18n.t('transactions.editor.ends')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {[
                { value: 'never' as const, label: I18n.t('transactions.editor.never') },
                { value: 'on_date' as const, label: I18n.t('transactions.editor.on_date') },
              ].map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => {
                    void triggerHaptic('selection');
                    if (opt.value === 'never') {
                      setRecurrenceEndMode('never');
                      setRecurrenceEndDate('');
                    } else {
                      setRecurrenceEndMode('on_date');
                      if (!recurrenceEndDate) setRecurrenceEndDate(date);
                    }
                  }}
                  className={cn(
                    'w-[48%] rounded-2xl border px-3.5 py-3.5',
                    recurrenceEndMode === opt.value
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border/40 bg-card',
                  )}
                >
                  <Text
                    className={cn(
                      recurrenceEndMode === opt.value ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      <View className="px-5 pt-4 pb-2 flex-row items-start justify-between">
        <View className="flex-row items-center gap-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.back')}
            onPress={() => {
              void triggerHaptic('selection');
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-secondary items-center justify-center"
          >
            <ChevronLeft size={14} color={themeColors.textSoft} />
          </Pressable>
          <View>
            <Text variant="subheading">{title}</Text>
            {showSubtitle ? (
              <Text variant="caption" tone="muted">
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        {mode === 'edit' && onDelete ? (
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={onDelete}
              accessibilityRole="button"
              accessibilityLabel={deleteLabel}
              className="h-10 w-10 items-center justify-center rounded-full bg-destructive/12"
            >
              <Trash2 size={14} color={themeColors.coral} />
            </Pressable>
            <Button size="sm" onPress={handleSubmit}>
              <Text>{submitLabel}</Text>
            </Button>
          </View>
        ) : (
          <Button size="sm" onPress={handleSubmit}>
            <Text>{submitLabel}</Text>
          </Button>
        )}
      </View>

      <View style={{ flex: showToolZone ? summaryFlex : 1 }}>
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: summaryBottomPadding }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type selector pills */}
          {showTypeSelector ? (
            <View className="flex-row gap-2 mt-2 mb-3">
              {availableTypeCards.map((item) => (
                <TypePill
                  key={item.value}
                  item={item}
                  selected={type === item.value}
                  onPress={() => handleTypeChange(item.value)}
                />
              ))}
            </View>
          ) : null}

          {/* Summary rows */}
          <View className="rounded-[20px] bg-card/60 border border-border/25 overflow-hidden">
            {!isBalanceAdjustmentType ? (
              <>
                {/* Date row */}
                <View>
                  <SummaryRow
                    label={I18n.t('transactions.editor.date')}
                    value={formatDateDisplay(date)}
                    isActive={activeField === 'date'}
                    onPress={() => activateField('date')}
                    rightElement={null}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                          <Calendar size={13} color={themeColors.textMuted} />
                        </View>
                        <Text variant="caption" tone="muted">
                          {I18n.t('transactions.editor.date')}
                        </Text>
                      </View>
                      <Text variant="body">{formatDateDisplay(date)}</Text>
                    </View>
                  </SummaryRow>
                </View>

                <View className="h-[1px] bg-border/15 mx-4" />
              </>
            ) : null}

            {/* Amount row */}
            <View>
              <SummaryRow
                label={I18n.t('transactions.editor.amount')}
                isActive={activeField === 'amount'}
                onPress={() => activateField('amount')}
                rightElement={null}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-2">
                    <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                      <Hash size={13} color={themeColors.textMuted} />
                    </View>
                    <Text variant="caption" tone="muted">
                      {I18n.t('transactions.editor.amount')}
                    </Text>
                  </View>
                  <View>
                    <Text
                      variant="heading"
                      className={cn(
                        amountTone === 'error'
                          ? 'text-destructive'
                          : amountTone === 'success'
                            ? 'text-success'
                            : 'text-foreground',
                      )}
                    >
                      {amountDisplay}
                    </Text>
                  </View>
                </View>
                {nudgeMessage ? (
                  <Text
                    variant="label"
                    tone="muted"
                    className="text-right mt-0.5"
                    style={{ fontSize: 11 }}
                  >
                    {nudgeMessage}
                  </Text>
                ) : null}
              </SummaryRow>
            </View>

            {!hideAccountSelector && <View className="h-[1px] bg-border/15 mx-4" />}

            {/* Account row(s) */}
            {!hideAccountSelector &&
              (isTransferType ? (
                <>
                  <View>
                    <SummaryRow
                      label={I18n.t('transactions.editor.from')}
                      isActive={activeField === 'fromAccount'}
                      onPress={() => activateField('fromAccount')}
                      valueTone={fieldErrors.from_account ? 'error' : 'default'}
                      rightElement={null}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2 flex-1 min-w-0">
                          <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                            <CreditCard size={13} color={themeColors.textMuted} />
                          </View>
                          <Text variant="caption" tone="muted">
                            {I18n.t('transactions.editor.from')}
                          </Text>
                        </View>
                        <Text
                          variant="body"
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          className={cn(
                            'max-w-[58%] text-right',
                            fromAccountName ? '' : 'text-muted-foreground/60',
                          )}
                        >
                          {fromAccountName ?? I18n.t('transactions.editor.choose_account')}
                        </Text>
                      </View>
                    </SummaryRow>
                  </View>
                  <View className="px-4 py-1">
                    <View className="flex-row items-center">
                      <View className="h-[1px] flex-1 bg-border/15" />
                      <Pressable
                        onPress={handleSwapTransferAccounts}
                        accessibilityRole="button"
                        accessibilityLabel={I18n.t('transactions.editor.swap_accounts')}
                        className="mx-2.5 h-8 w-8 rounded-full border border-primary/35 bg-primary/10 items-center justify-center active:opacity-85"
                      >
                        <ArrowLeftRight size={14} color={themeColors.primary} />
                      </Pressable>
                      <View className="h-[1px] flex-1 bg-border/15" />
                    </View>
                  </View>
                  <View>
                    <SummaryRow
                      label={I18n.t('transactions.editor.to')}
                      isActive={activeField === 'toAccount'}
                      onPress={() => activateField('toAccount')}
                      valueTone={fieldErrors.to_account ? 'error' : 'default'}
                      rightElement={null}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2 flex-1 min-w-0">
                          <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                            <ArrowRight size={13} color={themeColors.textMuted} />
                          </View>
                          <Text variant="caption" tone="muted">
                            {I18n.t('transactions.editor.to')}
                          </Text>
                        </View>
                        <Text
                          variant="body"
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          className={cn(
                            'max-w-[58%] text-right',
                            toAccountName ? '' : 'text-muted-foreground/60',
                          )}
                        >
                          {toAccountName ?? I18n.t('transactions.editor.choose_account')}
                        </Text>
                      </View>
                    </SummaryRow>
                  </View>
                </>
              ) : (
                <View>
                  <SummaryRow
                    label={I18n.t('transactions.editor.account')}
                    isActive={activeField === 'account'}
                    onPress={() => activateField('account')}
                    valueTone={fieldErrors.account ? 'error' : 'default'}
                    rightElement={null}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2 flex-1 min-w-0">
                        <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                          <CreditCard size={13} color={themeColors.textMuted} />
                        </View>
                        <Text variant="caption" tone="muted">
                          {I18n.t('transactions.editor.account')}
                        </Text>
                      </View>
                      <Text
                        variant="body"
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        className={cn(
                          'max-w-[58%] text-right',
                          accountName ? '' : 'text-muted-foreground/60',
                        )}
                      >
                        {accountName ?? I18n.t('transactions.editor.choose_account')}
                      </Text>
                    </View>
                  </SummaryRow>
                </View>
              ))}

            {/* Category row (hidden for transfers and balance adjustments) */}
            {!isTransferType && !isBalanceAdjustmentType ? (
              <>
                <View className="h-[1px] bg-border/15 mx-4" />
                <View>
                  <SummaryRow
                    label={I18n.t('transactions.editor.category')}
                    isActive={activeField === 'category'}
                    onPress={() => activateField('category')}
                    valueTone={fieldErrors.category ? 'error' : 'default'}
                    rightElement={null}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2 flex-1 min-w-0">
                        {categoryPreview ? (
                          <Text className="text-[18px] w-7 text-center">
                            {categoryPreview.icon}
                          </Text>
                        ) : (
                          <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                            <Hash size={13} color={themeColors.textMuted} />
                          </View>
                        )}
                        <Text variant="caption" tone="muted">
                          {I18n.t('transactions.editor.category')}
                        </Text>
                      </View>
                      <Text
                        variant="body"
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        className={cn(
                          'max-w-[58%] text-right',
                          categoryPreview ? '' : 'text-muted-foreground/60',
                        )}
                      >
                        {categoryPreview?.name ?? I18n.t('transactions.editor.choose_category')}
                      </Text>
                    </View>
                  </SummaryRow>
                </View>
              </>
            ) : null}

            {!isBalanceAdjustmentType ? (
              <>
                <View className="h-[1px] bg-border/15 mx-4" />

                {/* Note row */}
                <View>
                  <SummaryRow
                    label={I18n.t('transaction_detail.note')}
                    isActive={activeField === 'note'}
                    onPress={focusNoteField}
                    rightElement={<View style={{ width: 14 }} />}
                  >
                    <View className="flex-row items-center justify-between">
                      <View className="flex-row items-center gap-2">
                        <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                          <FileText size={13} color={themeColors.textMuted} />
                        </View>
                        <Text variant="caption" tone="muted">
                          {I18n.t('transaction_detail.note')}
                        </Text>
                      </View>
                      <View className="max-w-[66%] min-w-[40%]">
                        <TextInput
                          ref={noteInputRef}
                          value={note}
                          onChangeText={handleNoteChange}
                          placeholder={I18n.t('transactions.editor.optional')}
                          placeholderTextColor={themeColors.textMuted}
                          selectTextOnFocus={shouldSelectAutoNoteOnFocus}
                          returnKeyType="done"
                          onFocus={() => setActiveField('note')}
                          onBlur={() => setActiveField((prev) => (prev === 'note' ? null : prev))}
                          style={{
                            color: themeColors.text,
                            fontSize: 14,
                            textAlign: 'right',
                            paddingVertical: 0,
                          }}
                        />
                      </View>
                    </View>
                  </SummaryRow>
                </View>
              </>
            ) : null}
          </View>

          {/* Recurring options (traditional form inputs, secondary) */}
          {recurringOptions ? (
            <View className="mt-3 rounded-[20px] bg-card/60 border border-border/25 overflow-hidden">
              {/* Rule name */}
              <View>
                <SummaryRow
                  label={I18n.t('transactions.editor.rule_name')}
                  isActive={activeField === 'ruleName'}
                  onPress={() => {
                    activateField('ruleName');
                    requestAnimationFrame(() => recurrenceNameRef.current?.focus());
                  }}
                  rightElement={<View style={{ width: 14 }} />}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                        <Type size={13} color={themeColors.textMuted} />
                      </View>
                      <Text variant="caption" tone="muted">
                        {I18n.t('transactions.editor.rule_name')}
                      </Text>
                      {fieldErrors.rule_name ? (
                        <Text variant="label" tone="error">
                          {' '}
                          *
                        </Text>
                      ) : null}
                    </View>
                    <View className="max-w-[55%] min-w-[30%]">
                      <TextInput
                        ref={recurrenceNameRef}
                        value={recurrenceName}
                        onChangeText={setRecurrenceName}
                        placeholder={I18n.t('transactions.editor.rule_name_placeholder')}
                        placeholderTextColor={themeColors.textMuted}
                        returnKeyType="done"
                        onFocus={() => setActiveField('ruleName')}
                        onBlur={() => setActiveField((prev) => (prev === 'ruleName' ? null : prev))}
                        style={{
                          color: themeColors.text,
                          fontSize: 14,
                          textAlign: 'right',
                          paddingVertical: 0,
                        }}
                      />
                    </View>
                  </View>
                </SummaryRow>
              </View>

              <View className="h-[1px] bg-border/15 mx-4" />

              {/* Repeat pattern */}
              <View>
                <SummaryRow
                  label={I18n.t('transactions.editor.repeat')}
                  isActive={activeField === 'repeat'}
                  onPress={() => activateField('repeat')}
                  rightElement={null}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                        <Repeat size={13} color={themeColors.textMuted} />
                      </View>
                      <Text variant="caption" tone="muted">
                        {I18n.t('transactions.editor.repeat')}
                      </Text>
                    </View>
                    <Text variant="body">{patternLabels[recurrencePattern]}</Text>
                  </View>
                </SummaryRow>
              </View>

              <View className="h-[1px] bg-border/15 mx-4" />

              {/* Every N interval */}
              <View>
                <SummaryRow
                  label={I18n.t('transactions.editor.every_interval')}
                  isActive={activeField === 'interval'}
                  onPress={() => {
                    activateField('interval');
                    requestAnimationFrame(() => recurrenceIntervalRef.current?.focus());
                  }}
                  rightElement={<View style={{ width: 14 }} />}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                        <Timer size={13} color={themeColors.textMuted} />
                      </View>
                      <Text variant="caption" tone="muted">
                        {I18n.t('transactions.editor.every_interval')}
                      </Text>
                    </View>
                    <View className="min-w-[40px]">
                      <TextInput
                        ref={recurrenceIntervalRef}
                        value={recurrenceInterval}
                        onChangeText={setRecurrenceInterval}
                        placeholder="1"
                        placeholderTextColor={themeColors.textMuted}
                        keyboardType="number-pad"
                        returnKeyType="done"
                        onFocus={() => setActiveField('interval')}
                        onBlur={() => setActiveField((prev) => (prev === 'interval' ? null : prev))}
                        style={{
                          color: themeColors.text,
                          fontSize: 14,
                          textAlign: 'right',
                          paddingVertical: 0,
                        }}
                      />
                    </View>
                  </View>
                </SummaryRow>
              </View>

              <View className="h-[1px] bg-border/15 mx-4" />

              {/* Ends */}
              <View>
                <SummaryRow
                  label={I18n.t('transactions.editor.ends')}
                  isActive={activeField === 'ends'}
                  onPress={() => activateField('ends')}
                  rightElement={null}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                        <Clock size={13} color={themeColors.textMuted} />
                      </View>
                      <Text variant="caption" tone="muted">
                        {I18n.t('transactions.editor.ends')}
                      </Text>
                    </View>
                    <Text variant="body">
                      {recurrenceEndMode === 'never'
                        ? I18n.t('transactions.editor.never')
                        : recurrenceEndDate || I18n.t('transactions.editor.on_date')}
                    </Text>
                  </View>
                </SummaryRow>
              </View>

              {recurrenceEndMode === 'on_date' ? (
                <>
                  <View className="h-[1px] bg-border/15 mx-4" />
                  <View>
                    <SummaryRow
                      label={I18n.t('transactions.editor.end_date')}
                      isActive={activeField === 'endDate'}
                      onPress={() => {
                        activateField('endDate');
                        requestAnimationFrame(() => recurrenceEndDateRef.current?.focus());
                      }}
                      rightElement={<View style={{ width: 14 }} />}
                    >
                      <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center gap-2">
                          <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                            <Calendar size={13} color={themeColors.textMuted} />
                          </View>
                          <Text variant="caption" tone="muted">
                            {I18n.t('transactions.editor.end_date')}
                          </Text>
                        </View>
                        <View className="min-w-[30%]">
                          <TextInput
                            ref={recurrenceEndDateRef}
                            value={recurrenceEndDate}
                            onChangeText={setRecurrenceEndDate}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={themeColors.textMuted}
                            returnKeyType="done"
                            onFocus={() => setActiveField('endDate')}
                            onBlur={() =>
                              setActiveField((prev) => (prev === 'endDate' ? null : prev))
                            }
                            style={{
                              color: fieldErrors.end_date ? themeColors.coral : themeColors.text,
                              fontSize: 14,
                              textAlign: 'right',
                              paddingVertical: 0,
                            }}
                          />
                        </View>
                      </View>
                    </SummaryRow>
                  </View>
                </>
              ) : null}

              <View className="h-[1px] bg-border/15 mx-4" />

              {/* Status */}
              <View>
                <SummaryRow
                  label={I18n.t('transactions.editor.status')}
                  isActive={activeField === 'status'}
                  onPress={() => {
                    activateField('status');
                    setRecurrenceIsActive((prev) => !prev);
                    void triggerHaptic('selection');
                  }}
                  rightElement={null}
                >
                  <View className="flex-row items-center justify-between">
                    <View className="flex-row items-center gap-2">
                      <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                        <Power size={13} color={themeColors.textMuted} />
                      </View>
                      <Text variant="caption" tone="muted">
                        {I18n.t('transactions.editor.status')}
                      </Text>
                    </View>
                    <Text
                      variant="body"
                      className={recurrenceIsActive ? 'text-success' : 'text-muted-foreground'}
                    >
                      {recurrenceIsActive
                        ? I18n.t('transactions.editor.active')
                        : I18n.t('transactions.editor.paused')}
                    </Text>
                  </View>
                </SummaryRow>
              </View>
            </View>
          ) : null}

          {/* Error message */}
          {error ? (
            <View className="mt-2 px-2">
              <Text variant="caption" tone="error">
                {error}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </View>

      {showToolZone ? (
        <View
          style={{ flex: 1 - summaryFlex }}
          className="border-t-2 border-border/50 bg-secondary/30"
        >
          <View className="items-center pt-1.5 pb-1">
            <View className="h-[3.5px] w-10 rounded-full bg-border/60" />
          </View>
          <Animated.View
            key={activeField}
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(120)}
            className="flex-1"
          >
            {renderToolPanel()}
          </Animated.View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
