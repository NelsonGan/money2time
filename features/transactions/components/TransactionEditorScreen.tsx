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
  type GestureResponderEvent,
  InteractionManager,
  Keyboard,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import {
  initialWindowMetrics,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { DatePickerModal } from '~/components/datePicker';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import {
  AccountLogo,
  AccountPickerSheet,
  Button,
  CategoryEmoji,
  CategoryPickerSheet,
  SegmentedToggle,
  Text,
} from '~/components/ui';
import { SentimentIcon } from '~/components/ui/SentimentIcons';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { useApp } from '~/context/AppContext';
import {
  NumpadPanel,
  SplitBillModal,
  type SplitDraft,
  splitsHelpers,
  SummaryRow,
} from '~/features/transactions/components/editor';
import {
  evaluateExpression,
  formatMoney,
} from '~/features/transactions/components/editor/calculatorEngine';
import { usePressScale } from '~/hooks/usePressScale';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { CreateTransactionInput } from '~/lib/repositories/transactionsRepository';
import {
  getDistinctNotesSuggestions,
  getLatestTransactionFieldsByNote,
} from '~/lib/repositories/transactionsRepository';
import { triggerHaptic } from '~/services/haptics';
import type { Category, TransactionSentiment, TransactionType } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { convert, currencySymbolForCode, resolveRate } from '~/utils/currency';
import { getErrorMessage } from '~/utils/errorHandling';
import {
  amountToHoursByRate,
  dayKeyFromIsoLocal,
  formatHours,
  normalizeMoneyAmount,
} from '~/utils/formatters';
import { newId } from '~/utils/id';

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

type NonNullActiveField = Exclude<ActiveField, null>;
type RecurrenceStatusValue = 'active' | 'paused';
type TypeCardOption = {
  value: TransactionType;
  label: string;
  bgClass: string;
  borderClass: string;
};

const TOOL_ZONE_FIELDS: readonly NonNullActiveField[] = ['amount', 'repeat', 'ends'];

// These fields render as a modal sheet over the editor — no inline tool zone.
const SHEET_FIELDS: readonly NonNullActiveField[] = [
  'account',
  'fromAccount',
  'toAccount',
  'category',
];

// These fields open a popup modal calendar — no inline tool zone.
const MODAL_FIELDS: readonly NonNullActiveField[] = ['date', 'endDate'];

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
  },
  summaryContainer: {
    flexGrow: 1,
  },
  nudgeLabel: {
    fontSize: 11,
  },
  trailingSpacer: {
    width: 14,
  },
  inlineSummaryInput: {
    fontSize: 16,
    textAlign: 'right',
    // Without a right pad, iOS clips trailing spaces flush against the input
    // edge — typing "uber " looks identical to "uber" until the next
    // character lands. A small inset gives the cursor and trailing
    // whitespace visible breathing room.
    paddingRight: 2,
  },
  summaryDismissLayout: {
    flexDirection: 'row',
    flexGrow: 1,
    alignItems: 'stretch',
  },
  summaryDismissGutter: {
    width: 16,
  },
  summaryDismissColumn: {
    flex: 1,
    flexGrow: 1,
    position: 'relative',
  },
  summaryDismissFiller: {
    flex: 1,
    minHeight: 1,
  },
  noteSuggestionsDropdown: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 30,
  },
});

interface TransactionEditorInitialValues {
  type: TransactionType;
  amount: string;
  date: string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  /** Received amount for a cross-currency transfer (destination currency). */
  toAmount: number | null;
  categoryId: string | null;
  note: string;
  sentiment: TransactionSentiment;
}

interface TransactionEditorScreenProps {
  mode: 'create' | 'edit';
  onClose: () => void;
  onSubmit: (input: CreateTransactionInput) => void;
  onSubmitWithSplits?: (input: CreateTransactionInput, splits: SplitDraft[]) => void;
  onSubmitReady?: (input: CreateTransactionInput) => void;
  onDelete?: () => void;
  initialValues?: Partial<TransactionEditorInitialValues>;
  initialSplits?: SplitDraft[];
  titleOverride?: string;
  subtitleOverride?: string;
  submitLabelOverride?: string;
  deleteLabel?: string;
  restrictTypeOptions?: TransactionType[];
  hideAccountSelector?: boolean;
  hideSubcategories?: boolean;
  hideSplitMode?: boolean;
  /** Open the Split Bill modal once on mount (used when the activity list
   *  routes the user here from a transaction with unpaid friends). */
  openSplitBillOnMount?: boolean;
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

interface TypeFieldSelection {
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
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
  item: TypeCardOption;
  selected: boolean;
  onPress: () => void;
}) {
  const themeColors = useThemeColors();
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.94 });
  const iconColor = selected
    ? item.value === 'expense'
      ? themeColors.error
      : item.value === 'income'
        ? themeColors.success
        : themeColors.primary
    : themeColors.textMuted;
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
        <TransactionTypeGlyph type={item.value} color={iconColor} />
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

function TransactionTypeGlyph({ type, color }: { type: TransactionType; color: string }) {
  const strokeProps = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (type === 'expense') {
    return (
      <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
        <Circle cx={5.25} cy={5.25} r={2.35} {...strokeProps} />
        <Path d="M7.25 7.25 13.5 13.5" {...strokeProps} />
        <Path d="M10.7 13.5h2.8v-2.8" {...strokeProps} />
      </Svg>
    );
  }

  if (type === 'income') {
    return (
      <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
        <Circle cx={5.25} cy={12.75} r={2.35} {...strokeProps} />
        <Path d="M7.25 10.75 13.5 4.5" {...strokeProps} />
        <Path d="M10.7 4.5h2.8v2.8" {...strokeProps} />
      </Svg>
    );
  }

  if (type === 'transfer') {
    return (
      <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
        <Path d="M3 6h10" {...strokeProps} />
        <Path d="m10.5 3.7 2.8 2.3-2.8 2.3" {...strokeProps} />
        <Path d="M15 12H5" {...strokeProps} />
        <Path d="m7.5 9.7-2.8 2.3 2.8 2.3" {...strokeProps} />
      </Svg>
    );
  }

  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
      <Path d="M3.5 5.25h11" {...strokeProps} />
      <Path d="M3.5 12.75h11" {...strokeProps} />
      <Circle cx={6.5} cy={5.25} r={1.55} {...strokeProps} />
      <Circle cx={11.5} cy={12.75} r={1.55} {...strokeProps} />
    </Svg>
  );
}

/** Human-friendly rate for the transfer pair line (more digits for tiny rates). */
function formatTransferRate(rate: number): string {
  if (rate >= 100) return rate.toFixed(2);
  if (rate >= 1) return rate.toFixed(4);
  return rate.toPrecision(4);
}

function formatDateDisplay(dateStr: string, locale: string) {
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateStr;

  const now = new Date();
  return parsed.toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: parsed.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function splitHoursHighlightText(templateKey: string, hours: string) {
  const hoursMarker = '__hours__';
  const resolved = String(I18n.t(templateKey, { hours: hoursMarker }));
  const [before, ...afterParts] = resolved.split(hoursMarker);
  return {
    before,
    hours,
    after: afterParts.join(hoursMarker),
  };
}

export function TransactionEditorScreen({
  mode,
  onClose,
  onSubmit,
  onSubmitWithSplits,
  onSubmitReady,
  onDelete,
  initialValues,
  initialSplits,
  titleOverride,
  subtitleOverride,
  submitLabelOverride,
  deleteLabel = I18n.t('transactions.editor.delete_transaction'),
  restrictTypeOptions,
  hideAccountSelector = false,
  hideSubcategories = false,
  hideSplitMode = false,
  openSplitBillOnMount = false,
  initialAccountId,
  recurringOptions,
}: TransactionEditorScreenProps) {
  const { accounts, accountGroups, categories, settings, currentMonthWage, rateTable } = useApp();

  // Resolve an account's native currency (code), falling back to the reporting
  // currency. Used so transactions store the currency of the account they touch.
  const accountCurrency = useCallback(
    (id: string | null | undefined): string => {
      if (!id) return settings.currencyCode;
      return accounts.find((a) => a.id === id)?.currency ?? settings.currencyCode;
    },
    [accounts, settings.currencyCode],
  );
  const themeColors = useThemeColors();
  const { height: windowHeight } = useWindowDimensions();
  const safeAreaInsets = useSafeAreaInsets();
  // This screen is presented as a transparentModal. When opened via a widget
  // deep link on a cold launch, the modal mounts before safe-area insets are
  // measured, so SafeAreaView's `top` edge can resolve to 0 and tuck the
  // header under the status bar / Dynamic Island. Use every synchronous source
  // available so at least one is non-zero: initialWindowMetrics (populated at
  // module init), StatusBar.currentHeight (Android only, always synchronous),
  // and the live context insets as a final fallback.
  const topInset = Math.max(
    safeAreaInsets.top,
    initialWindowMetrics?.insets.top ?? 0,
    Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
  );
  const activeLocale = settings.locale ?? I18n.locale ?? 'en';

  const initialType = initialValues?.type ?? 'expense';
  const initialSingleAccountId =
    initialValues?.accountId ??
    initialAccountId ??
    (mode === 'create' ? null : (accounts[0]?.id ?? null));
  const initialFromSelectionId =
    initialValues?.fromAccountId ?? (mode === 'create' ? null : (accounts[0]?.id ?? null));
  const initialToSelectionId =
    initialValues?.toAccountId ??
    (mode === 'create' ? null : (accounts[1]?.id ?? accounts[0]?.id ?? null));
  const initialCategorySelectionId = initialValues?.categoryId ?? null;
  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState(initialValues?.amount ?? '');
  const [date, setDate] = useState(initialValues?.date ?? toDateInput(new Date()));
  const [accountId, setAccountId] = useState<string | null>(initialSingleAccountId);
  const [fromAccountId, setFromAccountId] = useState<string | null>(initialFromSelectionId);
  const [toAccountId, setToAccountId] = useState<string | null>(initialToSelectionId);
  // Cross-currency transfers: amount received in the destination currency. Empty
  // means "auto-convert at the current rate".
  const [transferToAmount, setTransferToAmount] = useState(
    initialValues?.toAmount != null ? String(initialValues.toAmount) : '',
  );
  const [categoryId, setCategoryId] = useState<string | null>(initialCategorySelectionId);
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [sentiment, setSentiment] = useState<TransactionSentiment>(
    initialValues?.sentiment ?? 'neutral',
  );
  const [amountExpression, setAmountExpression] = useState('');

  const hasInitialSplits = !!initialSplits && initialSplits.length > 0;
  const [splitMode, setSplitMode] = useState(hasInitialSplits);
  const [splits, setSplits] = useState<SplitDraft[]>(initialSplits ?? []);
  const [splitEvenly, setSplitEvenly] = useState(!hasInitialSplits);

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
  const recurrenceStatusValue: RecurrenceStatusValue = recurrenceIsActive ? 'active' : 'paused';

  const [activeField, setActiveField] = useState<ActiveField>('amount');
  const initialActiveFieldRef = useRef<ActiveField>('amount');
  const hasLeftInitialActiveFieldRef = useRef(false);
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
  const editorScrollRef = useRef<ScrollView>(null);
  const fieldOffsetsRef = useRef<Partial<Record<NonNullActiveField, number>>>({});
  const noteInputRef = useRef<TextInput>(null);
  const noteBlurFrameRef = useRef<number | null>(null);
  const noteSuggestionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [noteSuggestions, setNoteSuggestions] = useState<string[]>([]);
  const [noteFieldFrame, setNoteFieldFrame] = useState<{ y: number; height: number } | null>(null);
  const recurrenceNameRef = useRef<TextInput>(null);
  const recurrenceIntervalRef = useRef<TextInput>(null);
  const hasSavedTypeSelectionRef = useRef<Record<TransactionType, boolean>>({
    expense: initialType === 'expense',
    income: initialType === 'income',
    transfer: initialType === 'transfer',
    balance_adjustment: initialType === 'balance_adjustment',
  });
  const fieldSelectionsByTypeRef = useRef<Record<TransactionType, TypeFieldSelection>>({
    expense: {
      accountId: initialType === 'expense' ? initialSingleAccountId : null,
      fromAccountId: null,
      toAccountId: null,
      categoryId: initialType === 'expense' ? initialCategorySelectionId : null,
    },
    income: {
      accountId: initialType === 'income' ? initialSingleAccountId : null,
      fromAccountId: null,
      toAccountId: null,
      categoryId: initialType === 'income' ? initialCategorySelectionId : null,
    },
    transfer: {
      accountId: null,
      fromAccountId: initialType === 'transfer' ? initialFromSelectionId : null,
      toAccountId: initialType === 'transfer' ? initialToSelectionId : null,
      categoryId: null,
    },
    balance_adjustment: {
      accountId: initialType === 'balance_adjustment' ? initialSingleAccountId : null,
      fromAccountId: null,
      toAccountId: null,
      categoryId: null,
    },
  });
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
  }, []);
  const isNativeKeyboardField = useCallback(
    (field: ActiveField) => field === 'note' || field === 'ruleName' || field === 'interval',
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
  const clearActiveField = useCallback(() => {
    activateField(null);
  }, [activateField]);
  const shouldHandleBackgroundPress = useCallback(
    (event: GestureResponderEvent) => activeField !== null && event.target === event.currentTarget,
    [activeField],
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
    const typeCards: TypeCardOption[] = [
      {
        value: 'expense',
        label: I18n.t('transactions.filters.spent'),
        bgClass: 'bg-destructive/8',
        borderClass: 'border-destructive/50',
      },
      {
        value: 'income',
        label: I18n.t('transactions.filters.earned'),
        bgClass: 'bg-success/10',
        borderClass: 'border-success/50',
      },
      {
        value: 'transfer',
        label: I18n.t('transactions.filters.moved'),
        bgClass: 'bg-primary/10',
        borderClass: 'border-primary/50',
      },
      {
        value: 'balance_adjustment',
        label: I18n.t('transactions.filters.adjustment'),
        bgClass: 'bg-primary/10',
        borderClass: 'border-primary/50',
      },
    ];
    const allowedTypes: TransactionType[] =
      restrictTypeOptions && restrictTypeOptions.length > 0
        ? restrictTypeOptions
        : ['expense', 'income', 'transfer'];
    return typeCards.filter((item) => allowedTypes.includes(item.value));
  }, [restrictTypeOptions]);
  const isTransferType = type === 'transfer';
  const isBalanceAdjustmentType = type === 'balance_adjustment';
  const showTypeSelector = availableTypeCards.length > 1;

  useEffect(() => {
    fieldSelectionsByTypeRef.current[type] = {
      accountId: type === 'transfer' ? null : accountId,
      fromAccountId: type === 'transfer' ? fromAccountId : null,
      toAccountId: type === 'transfer' ? toAccountId : null,
      categoryId: type === 'expense' || type === 'income' ? categoryId : null,
    };
    hasSavedTypeSelectionRef.current[type] = true;
  }, [accountId, categoryId, fromAccountId, toAccountId, type]);

  const handleTypeChange = useCallback(
    (nextType: TransactionType) => {
      if (nextType === type) return;
      const previousType = type;
      fieldSelectionsByTypeRef.current[previousType] = {
        accountId: previousType === 'transfer' ? null : accountId,
        fromAccountId: previousType === 'transfer' ? fromAccountId : null,
        toAccountId: previousType === 'transfer' ? toAccountId : null,
        categoryId: previousType === 'expense' || previousType === 'income' ? categoryId : null,
      };
      hasSavedTypeSelectionRef.current[previousType] = true;
      const nextSelection = fieldSelectionsByTypeRef.current[nextType];
      const hasSavedNextSelection = hasSavedTypeSelectionRef.current[nextType];

      setType(nextType);
      autoNoteFromCategoryRef.current = null;
      setActiveField((current) => mapActiveFieldForType(current, nextType));

      if (nextType === 'transfer') {
        const fallbackFromAccountId = hasSavedNextSelection
          ? nextSelection.fromAccountId
          : previousType === 'transfer'
            ? fromAccountId
            : accountId;
        setAccountId(null);
        setCategoryId(null);
        setFromAccountId(fallbackFromAccountId);
        setToAccountId(hasSavedNextSelection ? nextSelection.toAccountId : null);
      } else {
        const fallbackAccountId = hasSavedNextSelection
          ? nextSelection.accountId
          : previousType === 'transfer'
            ? fromAccountId
            : accountId;
        setAccountId(fallbackAccountId);
        setCategoryId(
          nextType === 'expense' || nextType === 'income'
            ? hasSavedNextSelection
              ? nextSelection.categoryId
              : null
            : null,
        );
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
    [accountId, categoryId, fromAccountId, mapActiveFieldForType, toAccountId, type],
  );

  useEffect(() => {
    if (availableTypeCards.some((item) => item.value === type)) return;
    const fallbackType = availableTypeCards[0]?.value ?? 'expense';
    handleTypeChange(fallbackType);
  }, [availableTypeCards, handleTypeChange, type]);

  const { topLevelCategories, topLevelCategoryById, childCategoriesByParent } = useMemo(() => {
    const topLevel: Category[] = [];
    const topLevelById = new Map<string, Category>();
    const childrenByParent = new Map<string, Category[]>();

    if (type !== 'expense' && type !== 'income') {
      return {
        topLevelCategories: topLevel,
        topLevelCategoryById: topLevelById,
        childCategoriesByParent: childrenByParent,
      };
    }

    categories.forEach((category) => {
      if (category.type !== type) return;
      if (!category.parentId) {
        topLevel.push(category);
        topLevelById.set(category.id, category);
        return;
      }
      if (hideSubcategories) return;
      const existing = childrenByParent.get(category.parentId);
      if (existing) {
        existing.push(category);
      } else {
        childrenByParent.set(category.parentId, [category]);
      }
    });

    return {
      topLevelCategories: topLevel,
      topLevelCategoryById: topLevelById,
      childCategoriesByParent: childrenByParent,
    };
  }, [categories, hideSubcategories, type]);

  const categoryPreviewById = useMemo(() => {
    const previews = new Map<string, { icon: string; name: string }>();
    topLevelCategories.forEach((category) => {
      previews.set(category.id, {
        icon: resolveCategoryIcon(category.icon),
        name: category.name,
      });
    });
    childCategoriesByParent.forEach((children, parentId) => {
      const parentNode = topLevelCategoryById.get(parentId);
      children.forEach((child) => {
        previews.set(child.id, {
          icon: resolveCategoryIcon(child.icon, parentNode?.icon ?? null),
          name: parentNode ? `${parentNode.name} / ${child.name}` : child.name,
        });
      });
    });
    return previews;
  }, [childCategoriesByParent, topLevelCategories, topLevelCategoryById]);
  const categoryPreview = useMemo(
    () => (categoryId ? (categoryPreviewById.get(categoryId) ?? null) : null),
    [categoryId, categoryPreviewById],
  );

  const nudgeMessageParts = useMemo(() => {
    if (type !== 'expense') return null;
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) return null;
    const rate = currentMonthWage?.trueHourlyRate ?? 0;
    if (rate <= 0) return null;
    const hours = amountToHoursByRate(numericAmount, rate);
    const formattedHours = formatHours(hours);
    if (hours < 0.25)
      return splitHoursHighlightText('transactions.editor.nudge.small', formattedHours);
    if (hours < 1)
      return splitHoursHighlightText('transactions.editor.nudge.pause', formattedHours);
    return splitHoursHighlightText('transactions.editor.nudge.large', formattedHours);
  }, [amount, currentMonthWage?.trueHourlyRate, type]);

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const selectedAccount = accountId ? (accountById.get(accountId) ?? null) : null;
  const selectedFromAccount = fromAccountId ? (accountById.get(fromAccountId) ?? null) : null;
  const selectedToAccount = toAccountId ? (accountById.get(toAccountId) ?? null) : null;
  const accountName = selectedAccount?.name ?? null;
  const fromAccountName = selectedFromAccount?.name ?? null;
  const toAccountName = selectedToAccount?.name ?? null;

  useEffect(() => {
    Keyboard.dismiss();
  }, []);

  // Sync amount field when the parent transaction's amount changes externally
  // (e.g. after a Mark Paid commit reduces it). Only the amount string is mirrored.
  useEffect(() => {
    if (initialValues?.amount === undefined) return;
    setAmount(initialValues.amount);
  }, [initialValues?.amount]);

  useEffect(() => {
    if (activeField !== 'amount') {
      setAmountExpression('');
    }
  }, [activeField]);

  // When the parent amount changes (user typing in the amount field), keep
  // the split rows in sync so the modal's sum bar doesn't show "unaccounted".
  // - Split-evenly: redistribute the new total across all UNPAID rows.
  // - Manual: Me absorbs the delta (autoBalanceSelf), friends keep their amounts.
  // Paid rows are "settled" in either mode and keep their stored amount.
  useEffect(() => {
    if (!splitMode) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return;
    if (splits.length === 0) return;
    const next = splitEvenly
      ? splitsHelpers.distributeEvenlyAcrossUnpaid(splits, numericAmount)
      : splitsHelpers.autoBalanceSelf(splits, numericAmount);
    const isEqual =
      next.length === splits.length && next.every((row, i) => row.amount === splits[i]?.amount);
    if (!isEqual) setSplits(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, splitMode, splitEvenly]);

  // When type leaves expense, force-disable splitMode so a saved transfer/income doesn't carry splits.
  useEffect(() => {
    if (type !== 'expense' && splitMode) {
      setSplitMode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  // Sync the editor's splits state with externally-updated initialSplits
  // (happens when user taps Mark Paid / Undo and AppContext refreshes the
  // parent transaction). Preserve any in-flight name/amount edits per row.
  useEffect(() => {
    if (!initialSplits) return;
    setSplits((current) => {
      if (current.length === 0) return initialSplits;
      const currentById = new Map(current.filter((s) => s.id).map((s) => [s.id!, s]));
      return initialSplits.map((incoming) => {
        if (!incoming.id) return incoming;
        const existing = currentById.get(incoming.id);
        if (!existing) return incoming;
        // Keep user's edits to mutable fields; refresh paid state from incoming.
        return {
          ...existing,
          paid: incoming.paid,
          paybackAccountId: incoming.paid ? incoming.paybackAccountId : existing.paybackAccountId,
        };
      });
    });
  }, [initialSplits]);

  const [splitBillModalVisible, setSplitBillModalVisible] = useState(false);

  const ensureSplitsInitialized = useCallback(() => {
    if (splits.length > 0) return;
    const numericAmount = Number(amount);
    const total = Number.isFinite(numericAmount) ? numericAmount : 0;
    const portions = splitsHelpers.distributeEvenly(total, 2);
    // Pre-assign ids so Mark Paid is available even in create mode (the modal
    // gates the action on `row.id` being present).
    setSplits([
      {
        id: newId(),
        personName: I18n.t('transactions.editor.split.me_label'),
        amount: (portions[0] ?? 0).toFixed(2),
        isSelf: true,
        paybackAccountId: null,
      },
      {
        id: newId(),
        personName: '',
        amount: (portions[1] ?? 0).toFixed(2),
        isSelf: false,
        paybackAccountId: accountId,
      },
    ]);
    setSplitEvenly(true);
  }, [accountId, amount, splits.length]);

  const numericAmountForGate = Number(amount);
  const canOpenSplitBill =
    !hideSplitMode &&
    type === 'expense' &&
    !recurringOptions &&
    Number.isFinite(numericAmountForGate) &&
    numericAmountForGate > 0 &&
    !!accountId &&
    !!categoryId;

  // Snapshot taken when the modal opens so the user can discard everything
  // (edits + Mark Paid + new rows + split-evenly toggle) by tapping back.
  // Only "Done" commits the staged changes back into the editor's state.
  const splitBillSnapshotRef = useRef<{
    splits: SplitDraft[];
    amount: string;
    splitEvenly: boolean;
    splitMode: boolean;
  } | null>(null);

  const handleOpenSplitBill = useCallback(() => {
    if (!canOpenSplitBill) return;
    void triggerHaptic('selection');
    Keyboard.dismiss();
    splitBillSnapshotRef.current = { splits, amount, splitEvenly, splitMode };
    if (!splitMode) setSplitMode(true);
    ensureSplitsInitialized();
    setSplitBillModalVisible(true);
  }, [amount, canOpenSplitBill, ensureSplitsInitialized, splitEvenly, splitMode, splits]);

  const handleDoneSplitBill = useCallback(() => {
    setSplitBillModalVisible(false);
    splitBillSnapshotRef.current = null;
    // If user committed an empty configuration, fold split mode back off.
    if (splits.filter((s) => !s.isSelf).length === 0) {
      setSplitMode(false);
      setSplits([]);
    }
  }, [splits]);

  const handleCancelSplitBill = useCallback(() => {
    setSplitBillModalVisible(false);
    const snapshot = splitBillSnapshotRef.current;
    splitBillSnapshotRef.current = null;
    if (!snapshot) return;
    setSplits(snapshot.splits);
    setAmount(snapshot.amount);
    setSplitEvenly(snapshot.splitEvenly);
    setSplitMode(snapshot.splitMode);
  }, []);

  // One-shot auto-open: if the caller (e.g. activity list tap) asked us to
  // jump straight into the Split Bill modal AND the gating fields are ready,
  // open it once. Re-fires only if the prop flips back to true.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!openSplitBillOnMount) {
      autoOpenedRef.current = false;
      return;
    }
    if (autoOpenedRef.current) return;
    if (!canOpenSplitBill) return;
    autoOpenedRef.current = true;
    handleOpenSplitBill();
  }, [openSplitBillOnMount, canOpenSplitBill, handleOpenSplitBill]);

  // Show a red notification badge on the Split Bills button with the count of
  // friends who still owe. Same affordance as the row tint in the activity list.
  const splitBillsUnpaidCount = splitMode ? splits.filter((s) => !s.isSelf && !s.paid).length : 0;

  // Mark Paid / Undo only stage the change locally. They adjust the editor's
  // amount field and flip the row's paid badge. Nothing is persisted until the
  // user taps Save in the editor — the Save flow diffs splits against the
  // persisted state and applies markSplitPaid / markSplitUnpaid then.
  // `newlyPaidIds` tracks splits the user marked paid during this editor
  // session (across modal opens/closes); it resets when the editor unmounts
  // after Save. Drives whether the modal shows an Undo affordance.
  const [newlyPaidIds, setNewlyPaidIds] = useState<Set<string>>(new Set());

  const adjustAmountBy = useCallback((delta: number) => {
    if (!Number.isFinite(delta) || delta === 0) return;
    setAmount((current) => {
      const num = Number(current);
      if (!Number.isFinite(num)) return current;
      return (Math.round((num + delta) * 100) / 100).toFixed(2);
    });
  }, []);

  const handleSplitMarkPaidLocal = useCallback(
    (splitId: string) => {
      const target = splits.find((s) => s.id === splitId);
      if (!target || target.isSelf || target.paid) return;
      const splitAmount = Number(target.amount);
      setSplits((current) =>
        current.map((s) =>
          s.id === splitId
            ? { ...s, paid: { paidAt: new Date().toISOString(), paidTransactionId: null } }
            : s,
        ),
      );
      setNewlyPaidIds((s) => {
        if (s.has(splitId)) return s;
        const next = new Set(s);
        next.add(splitId);
        return next;
      });
      adjustAmountBy(-splitAmount);
    },
    [adjustAmountBy, splits],
  );

  const handleSplitMarkUnpaidLocal = useCallback(
    (splitId: string) => {
      const target = splits.find((s) => s.id === splitId);
      if (!target || !target.paid) return;
      const splitAmount = Number(target.amount);
      setSplits((current) =>
        current.map((s) => (s.id === splitId ? { ...s, paid: undefined } : s)),
      );
      adjustAmountBy(splitAmount);
    },
    [adjustAmountBy, splits],
  );

  // Amount is always entered in the native currency of the account being
  // touched (the from-account for transfers), so the keypad shows that symbol
  // rather than the reporting-currency symbol.
  const entryCurrencySymbol = useMemo(
    () => currencySymbolForCode(accountCurrency(isTransferType ? fromAccountId : accountId)),
    [accountCurrency, accountId, fromAccountId, isTransferType],
  );

  const amountDisplay = useMemo(() => {
    if (activeField === 'amount' && amountExpression) {
      return `${entryCurrencySymbol}${amountExpression}`;
    }
    const num = Number(amount);
    if (!amount || !Number.isFinite(num)) return `${entryCurrencySymbol}${formatMoney(0)}`;
    return `${entryCurrencySymbol}${formatMoney(num)}`;
  }, [activeField, amount, amountExpression, entryCurrencySymbol]);

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
    const numericAmount = normalizeMoneyAmount(Number(amount));
    const amountDraft = amount.trim();
    const normalizedNote = note.trim();
    const fallbackDefaultNote =
      autoNoteFromCategoryRef.current?.trim() || categoryPreview?.name?.trim() || '';
    const resolvedNote = normalizedNote.length > 0 ? normalizedNote : fallbackDefaultNote || null;
    if (!amountDraft || !Number.isFinite(numericAmount)) {
      setFieldErrors({ amount: I18n.t('transactions.editor.error.amount_required') });
      activateField('amount');
      return;
    }

    const txDate = toUtcIsoFromLocalDateInput(date) ?? new Date().toISOString();

    try {
      // Build the submission payload; validate per type.
      let submitPayload: CreateTransactionInput | null = null;
      let preparedSubmitPayload: CreateTransactionInput | null = null;
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
          currency: accountCurrency(accountId),
          date: txDate,
          accountId,
          categoryId: null,
          fromAccountId: null,
          toAccountId: null,
          note: resolvedNote,
          sentiment: 'neutral',
        };
        preparedSubmitPayload = submitPayload;
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
        const fromCurrency = accountCurrency(fromAccountId);
        const toCurrency = accountCurrency(toAccountId);
        // Cross-currency transfer: credit the destination in its own currency.
        // Prefer the user-entered received amount; otherwise convert at the
        // latest cached rate (manual rates configurable in Exchange Rates).
        const crossCurrency = fromCurrency !== toCurrency;
        const enteredToAmount = transferToAmount.trim() ? Number(transferToAmount) : null;
        const computedToAmount =
          enteredToAmount !== null && Number.isFinite(enteredToAmount) && enteredToAmount > 0
            ? enteredToAmount
            : convert(numericAmount, fromCurrency, toCurrency, rateTable).value;
        submitPayload = {
          type,
          amount: numericAmount,
          currency: fromCurrency,
          toAmount: crossCurrency ? computedToAmount : null,
          date: txDate,
          fromAccountId,
          toAccountId,
          accountId: null,
          categoryId: null,
          note: resolvedNote,
          sentiment: 'neutral',
        };
        preparedSubmitPayload = submitPayload;
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
          currency: accountCurrency(accountId),
          date: txDate,
          accountId,
          categoryId,
          fromAccountId: null,
          toAccountId: null,
          note: resolvedNote,
          sentiment,
        };
        preparedSubmitPayload = submitPayload;
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
          preparedSubmitPayload = capturedPayload;
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

      if (preparedSubmitPayload) {
        onSubmitReady?.(preparedSubmitPayload);
      }

      const useSplitsPath =
        splitMode &&
        type === 'expense' &&
        !recurringOptions &&
        splits.filter((s) => !s.isSelf).length > 0;

      if (useSplitsPath && submitPayload) {
        // Sum only UNPAID splits (Me + outstanding friends). Paid splits are
        // settled — their amounts have already been deducted from the parent
        // expense via Mark Paid, so they should not be counted here.
        const sumOfUnpaidSplits = splits.reduce(
          (acc, s) => (s.paid ? acc : acc + (Number(s.amount) || 0)),
          0,
        );
        if (Math.abs(sumOfUnpaidSplits - submitPayload.amount) > 0.005) {
          setError(
            sumOfUnpaidSplits > submitPayload.amount
              ? I18n.t('transactions.editor.split.sum_over', {
                  diff: `${entryCurrencySymbol}${(sumOfUnpaidSplits - submitPayload.amount).toFixed(2)}`,
                })
              : I18n.t('transactions.editor.split.sum_mismatch', {
                  diff: `${entryCurrencySymbol}${(submitPayload.amount - sumOfUnpaidSplits).toFixed(2)}`,
                }),
          );
          setFieldErrors({ amount: I18n.t('transactions.editor.error.required') });
          return;
        }
      }

      // Close modal immediately, then submit after the dismiss animation
      void triggerHaptic('success');
      onClose();

      let deferredSubmit: (() => void) | null = null;
      if (useSplitsPath && submitPayload && onSubmitWithSplits) {
        const capturedPayload = submitPayload;
        const capturedSplits = splits;
        deferredSubmit = () => onSubmitWithSplits(capturedPayload, capturedSplits);
      } else if (submitPayload) {
        const capturedPayload = submitPayload;
        deferredSubmit = () => onSubmit(capturedPayload);
      } else {
        deferredSubmit = recurringSubmit;
      }

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
  const summaryFlex = windowHeight < 650 ? 0.38 : windowHeight < 750 ? 0.42 : 0.46;
  const isRecurringEditor = Boolean(recurringOptions);
  const showSubtitle = Boolean(subtitle) && isRecurringEditor;
  const inlineRecurringFields: ActiveField[] = ['ruleName', 'interval', 'status'];
  const showToolZone =
    activeField !== null &&
    activeField !== 'note' &&
    !inlineRecurringFields.includes(activeField) &&
    !SHEET_FIELDS.includes(activeField) &&
    !MODAL_FIELDS.includes(activeField);
  const noteSuggestionsVisible = noteSuggestions.length > 0 && activeField === 'note';
  const noteSuggestionsTop = noteFieldFrame ? noteFieldFrame.y + noteFieldFrame.height : null;
  const effectiveSummaryFlex =
    showToolZone && activeField === 'amount' ? Math.min(0.54, summaryFlex + 0.05) : summaryFlex;
  const recurringToolZonePadding =
    isRecurringEditor && showToolZone ? Math.max(520, Math.round(windowHeight * 0.62)) : 0;
  const summaryBottomPadding = isRecurringEditor
    ? showToolZone
      ? recurringToolZonePadding
      : 196
    : showToolZone
      ? 92
      : 16;
  const summaryContainerStyle = useMemo(
    () => ({ flex: showToolZone ? effectiveSummaryFlex : 1 }),
    [effectiveSummaryFlex, showToolZone],
  );
  const scrollContentStyle = useMemo(
    () => [styles.summaryContainer, { paddingBottom: summaryBottomPadding, flexGrow: 1 }],
    [summaryBottomPadding],
  );
  const toolZoneContainerStyle = useMemo(
    () => ({ flex: 1 - effectiveSummaryFlex }),
    [effectiveSummaryFlex],
  );

  const scrollFieldIntoView = useCallback((field: NonNullActiveField) => {
    const y = fieldOffsetsRef.current[field];
    if (typeof y !== 'number') return;

    const targetY = Math.max(0, y - 24);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        editorScrollRef.current?.scrollTo({ y: targetY, animated: true });
      });
    });
  }, []);

  const registerFieldLayout = useCallback(
    (field: NonNullActiveField) => (event: LayoutChangeEvent) => {
      fieldOffsetsRef.current[field] = event.nativeEvent.layout.y;
      const shouldSkipInitialAutoScroll =
        !hasLeftInitialActiveFieldRef.current && field === initialActiveFieldRef.current;
      if (
        !shouldSkipInitialAutoScroll &&
        activeField === field &&
        showToolZone &&
        TOOL_ZONE_FIELDS.includes(field)
      ) {
        scrollFieldIntoView(field);
      }
    },
    [activeField, scrollFieldIntoView, showToolZone],
  );

  useEffect(() => {
    if (!activeField || isNativeKeyboardField(activeField)) return;
    blurNativeInputs();
    Keyboard.dismiss();
  }, [activeField, blurNativeInputs, isNativeKeyboardField]);

  useEffect(() => {
    if (hasLeftInitialActiveFieldRef.current) return;
    if (activeField === initialActiveFieldRef.current) return;
    hasLeftInitialActiveFieldRef.current = true;
  }, [activeField]);

  useEffect(() => {
    if (!activeField || !showToolZone) return;
    if (!TOOL_ZONE_FIELDS.includes(activeField)) return;
    if (!hasLeftInitialActiveFieldRef.current && activeField === initialActiveFieldRef.current) {
      return;
    }
    scrollFieldIntoView(activeField);
  }, [activeField, scrollFieldIntoView, showToolZone]);

  const focusNoteField = useCallback(() => {
    activateField('note');
    requestAnimationFrame(() => noteInputRef.current?.focus());
  }, [activateField]);

  const handleNoteFocus = useCallback(() => {
    if (noteBlurFrameRef.current !== null) {
      cancelAnimationFrame(noteBlurFrameRef.current);
      noteBlurFrameRef.current = null;
    }
    setActiveField('note');
  }, []);

  const handleNoteBlur = useCallback(() => {
    if (noteBlurFrameRef.current !== null) {
      cancelAnimationFrame(noteBlurFrameRef.current);
    }
    noteBlurFrameRef.current = requestAnimationFrame(() => {
      noteBlurFrameRef.current = null;
      if (noteInputRef.current?.isFocused()) return;
      setActiveField((prev) => (prev === 'note' ? null : prev));
    });
  }, []);

  const focusRecurrenceIntervalField = useCallback(() => {
    activateField('interval');
    requestAnimationFrame(() => recurrenceIntervalRef.current?.focus());
  }, [activateField]);

  const focusRecurrenceEndDateField = useCallback(() => {
    activateField('endDate');
  }, [activateField]);

  const handleRecurrenceEndDateSelect = useCallback(
    (nextDate: string) => {
      setRecurrenceEndDate(nextDate);
      activateField('status');
    },
    [activateField],
  );
  const handleRecurrenceStatusChange = useCallback(
    (nextStatus: RecurrenceStatusValue) => {
      setRecurrenceIsActive(nextStatus === 'active');
      activateField('status');
    },
    [activateField],
  );
  const recurrenceStatusOptions = useMemo(
    () => [
      { value: 'active' as const, label: I18n.t('transactions.editor.active') },
      { value: 'paused' as const, label: I18n.t('transactions.editor.paused') },
    ],
    [],
  );

  const handleDateSelect = useCallback(
    (nextDate: string) => {
      setDate(nextDate);
      activateField('amount');
    },
    [activateField],
  );

  const handleAmountValueChange = useCallback((expr: string) => {
    setAmountExpression(expr);
    if (!expr) {
      setAmount('');
    } else {
      const evaluated = evaluateExpression(expr);
      setAmount(Number.isFinite(evaluated) ? formatMoney(evaluated) : '');
    }
  }, []);

  const handleAmountConfirm = useCallback(
    (val: string) => {
      setAmount(formatMoney(Number(val)));
      setAmountExpression('');
      // Only auto-jump if the next field is empty — don't yank focus when the
      // user is just touching up the amount on an already-filled transaction.
      if (hideAccountSelector) {
        activateField(categoryId ? null : 'category');
      } else if (isTransferType) {
        activateField(fromAccountId ? null : 'fromAccount');
      } else {
        activateField(accountId ? null : 'account');
      }
    },
    [accountId, activateField, categoryId, fromAccountId, hideAccountSelector, isTransferType],
  );

  const handleAccountSelect = useCallback(
    (nextAccountId: string) => {
      setAccountId(nextAccountId);
      if (isBalanceAdjustmentType) {
        activateField('amount');
        return;
      }
      activateField(categoryId ? null : 'category');
    },
    [activateField, categoryId, isBalanceAdjustmentType],
  );

  const handleFromAccountSelect = useCallback(
    (nextAccountId: string) => {
      setFromAccountId(nextAccountId);
      activateField(toAccountId ? null : 'toAccount');
    },
    [activateField, toAccountId],
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
    (targetCategoryId: string) => categoryPreviewById.get(targetCategoryId)?.name ?? null,
    [categoryPreviewById],
  );

  const handleNoteChange = useCallback((nextNote: string) => {
    setNote(nextNote);
    if (noteSuggestionsTimerRef.current) clearTimeout(noteSuggestionsTimerRef.current);
    if (!nextNote.trim()) {
      setNoteSuggestions([]);
      return;
    }
    noteSuggestionsTimerRef.current = setTimeout(() => {
      setNoteSuggestions(getDistinctNotesSuggestions(nextNote.trim()));
    }, 150);
  }, []);

  useEffect(
    () => () => {
      if (noteSuggestionsTimerRef.current) clearTimeout(noteSuggestionsTimerRef.current);
      if (noteBlurFrameRef.current !== null) cancelAnimationFrame(noteBlurFrameRef.current);
    },
    [],
  );

  const handleNoteFieldLayout = useCallback((event: LayoutChangeEvent) => {
    const { y, height } = event.nativeEvent.layout;
    setNoteFieldFrame((previous) =>
      previous && previous.y === y && previous.height === height ? previous : { y, height },
    );
  }, []);

  const handleCategorySelect = (nextCategoryId: string) => {
    setCategoryId(nextCategoryId);
    if (mode === 'create') {
      autoNoteFromCategoryRef.current = categoryNoteLabel(nextCategoryId);
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
  const categoryPanelChildren = useMemo(() => {
    const panelChildrenByParent = new Map<string, { id: string; name: string; icon: string }[]>();
    childCategoriesByParent.forEach((items, parentId) => {
      const parentNode = topLevelCategoryById.get(parentId);
      const panelChildren = items.map((item) => ({
        id: item.id,
        name: item.name,
        icon: resolveCategoryIcon(item.icon, parentNode?.icon ?? null),
      }));
      panelChildrenByParent.set(parentId, panelChildren);
    });
    return panelChildrenByParent;
  }, [childCategoriesByParent, topLevelCategoryById]);

  const renderToolPanel = () => {
    switch (activeField) {
      case 'amount':
        return (
          <NumpadPanel
            initialExpression={amount}
            onBackgroundPress={clearActiveField}
            onValueChange={handleAmountValueChange}
            onConfirm={handleAmountConfirm}
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
                    focusRecurrenceIntervalField();
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
            <Pressable
              accessible={false}
              onPress={clearActiveField}
              style={styles.summaryDismissFiller}
            />
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
                      activateField('status');
                    } else {
                      setRecurrenceEndMode('on_date');
                      if (!recurrenceEndDate) setRecurrenceEndDate(date);
                      focusRecurrenceEndDateField();
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
            <Pressable
              accessible={false}
              onPress={clearActiveField}
              style={styles.summaryDismissFiller}
            />
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={[]}>
      <View
        style={styles.screenContainer}
        onStartShouldSetResponder={shouldHandleBackgroundPress}
        onResponderRelease={clearActiveField}
      >
        <TabletContentContainer style={{ flex: 1 }}>
          <View
            className="px-5 pb-2 flex-row items-start justify-between"
            style={{ paddingTop: topInset + (windowHeight < 700 ? 8 : 16) }}
            onStartShouldSetResponder={shouldHandleBackgroundPress}
            onResponderRelease={clearActiveField}
          >
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
              {!hideSplitMode && type === 'expense' && !recurringOptions ? (
                <View className="relative">
                  {splitBillsUnpaidCount > 0 ? (
                    <View
                      pointerEvents="none"
                      className="absolute z-10 -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive border-2 border-background items-center justify-center"
                    >
                      <Text className="text-white text-[10px] font-bold leading-[12px]">
                        {splitBillsUnpaidCount}
                      </Text>
                    </View>
                  ) : null}
                  <Pressable
                    onPress={handleOpenSplitBill}
                    disabled={!canOpenSplitBill}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('transactions.editor.split.button_label')}
                    className={cn(
                      'flex-row items-center gap-1.5 px-2.5 h-8 rounded-full',
                      splitMode && splits.some((s) => !s.isSelf)
                        ? 'bg-primary/15'
                        : 'bg-secondary/60',
                    )}
                    style={{ opacity: canOpenSplitBill ? 1 : 0.4 }}
                  >
                    <Text className="text-[14px]">🤝</Text>
                    <Text variant="caption" className="text-[12px]">
                      {I18n.t('transactions.editor.split.button_label')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
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
                <Button size="sm" haptic="none" onPress={handleSubmit}>
                  <Text>{submitLabel}</Text>
                </Button>
              </View>
            ) : (
              <Button size="sm" haptic="none" onPress={handleSubmit}>
                <Text>{submitLabel}</Text>
              </Button>
            )}
          </View>

          {showTypeSelector ? (
            <View
              className="px-4 pb-2"
              onStartShouldSetResponder={shouldHandleBackgroundPress}
              onResponderRelease={clearActiveField}
            >
              <View className="flex-row gap-2 mt-1">
                {availableTypeCards.map((item) => (
                  <TypePill
                    key={item.value}
                    item={item}
                    selected={type === item.value}
                    onPress={() => handleTypeChange(item.value)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <View style={summaryContainerStyle}>
            <ScrollView
              ref={editorScrollRef}
              className="flex-1"
              contentContainerStyle={scrollContentStyle}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={clearActiveField}
            >
              <View style={styles.summaryDismissLayout}>
                <Pressable
                  accessible={false}
                  onPress={clearActiveField}
                  style={styles.summaryDismissGutter}
                />
                <View style={styles.summaryDismissColumn}>
                  <Pressable accessible={false} onPress={clearActiveField}>
                    {/* Summary rows */}
                    <View
                      className="bg-card/60 border border-border/25 overflow-hidden"
                      style={{
                        borderRadius: 20,
                      }}
                    >
                      {!isBalanceAdjustmentType ? (
                        <>
                          {/* Date row */}
                          <View onLayout={registerFieldLayout('date')}>
                            <SummaryRow
                              label={I18n.t('transactions.editor.date')}
                              value={formatDateDisplay(date, activeLocale)}
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
                                <Text variant="body">{formatDateDisplay(date, activeLocale)}</Text>
                              </View>
                            </SummaryRow>
                          </View>

                          <View className="h-[1px] bg-border/15 mx-4" />
                        </>
                      ) : null}

                      {/* Amount row */}
                      <View onLayout={registerFieldLayout('amount')}>
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
                            <View style={{ maxWidth: '55%' }}>
                              <Text
                                variant="heading"
                                numberOfLines={1}
                                style={{
                                  fontSize:
                                    amountDisplay.length > 12
                                      ? 14
                                      : amountDisplay.length > 9
                                        ? 18
                                        : 24,
                                }}
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
                          {nudgeMessageParts ? (
                            <Text
                              variant="caption"
                              tone="muted"
                              className="text-right mt-0.5"
                              style={styles.nudgeLabel}
                            >
                              {nudgeMessageParts.before}
                              <Text variant="caption" tone="primary" style={styles.nudgeLabel}>
                                {nudgeMessageParts.hours}
                              </Text>
                              {nudgeMessageParts.after}
                            </Text>
                          ) : null}
                        </SummaryRow>
                      </View>

                      {hideAccountSelector ? null : <View className="h-[1px] bg-border/15 mx-4" />}

                      {/* Account row(s) */}
                      {hideAccountSelector ? null : isTransferType ? (
                        <>
                          <View onLayout={registerFieldLayout('fromAccount')}>
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
                                <View className="flex-row items-center justify-end gap-1.5 max-w-[58%]">
                                  {selectedFromAccount ? (
                                    <AccountLogo
                                      logoId={selectedFromAccount.logoId}
                                      type={selectedFromAccount.type}
                                      size={20}
                                    />
                                  ) : null}
                                  <Text
                                    variant="body"
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                    className={cn(
                                      'text-right shrink',
                                      fromAccountName ? '' : 'text-muted-foreground/60',
                                    )}
                                  >
                                    {fromAccountName ??
                                      I18n.t('transactions.editor.choose_account')}
                                  </Text>
                                </View>
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
                          <View onLayout={registerFieldLayout('toAccount')}>
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
                                <View className="flex-row items-center justify-end gap-1.5 max-w-[58%]">
                                  {selectedToAccount ? (
                                    <AccountLogo
                                      logoId={selectedToAccount.logoId}
                                      type={selectedToAccount.type}
                                      size={20}
                                    />
                                  ) : null}
                                  <Text
                                    variant="body"
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                    className={cn(
                                      'text-right shrink',
                                      toAccountName ? '' : 'text-muted-foreground/60',
                                    )}
                                  >
                                    {toAccountName ?? I18n.t('transactions.editor.choose_account')}
                                  </Text>
                                </View>
                              </View>
                            </SummaryRow>
                          </View>
                          {selectedFromAccount &&
                          selectedToAccount &&
                          selectedFromAccount.currency !== selectedToAccount.currency ? (
                            <View className="mt-2 rounded-2xl border border-border/30 bg-secondary/30 p-3 gap-1.5">
                              <Text variant="caption" tone="muted">
                                {I18n.t('transactions.editor.received_amount', {
                                  currency: selectedToAccount.currency,
                                })}
                              </Text>
                              <View className="flex-row items-center gap-2">
                                <Text variant="body" tone="muted">
                                  {currencySymbolForCode(selectedToAccount.currency)}
                                </Text>
                                <TextInput
                                  value={transferToAmount}
                                  onChangeText={setTransferToAmount}
                                  keyboardType="decimal-pad"
                                  placeholder={String(
                                    convert(
                                      Number(amount) || 0,
                                      selectedFromAccount.currency,
                                      selectedToAccount.currency,
                                      rateTable,
                                    ).value || '',
                                  )}
                                  placeholderTextColor={themeColors.textMuted}
                                  style={{ flex: 1, color: themeColors.text, paddingVertical: 4 }}
                                />
                              </View>
                              {(() => {
                                const pairRate = resolveRate(
                                  selectedFromAccount.currency,
                                  selectedToAccount.currency,
                                  rateTable,
                                );
                                return pairRate ? (
                                  <Text variant="caption" tone="muted">
                                    {`1 ${selectedFromAccount.currency} = ${formatTransferRate(pairRate)} ${selectedToAccount.currency}`}
                                  </Text>
                                ) : null;
                              })()}
                              <Text variant="caption" tone="muted">
                                {I18n.t('transactions.editor.transfer_rate_hint', {
                                  from: selectedFromAccount.currency,
                                  to: selectedToAccount.currency,
                                })}
                              </Text>
                            </View>
                          ) : null}
                        </>
                      ) : (
                        <View onLayout={registerFieldLayout('account')}>
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
                              <View className="flex-row items-center justify-end gap-1.5 max-w-[58%]">
                                {selectedAccount ? (
                                  <AccountLogo
                                    logoId={selectedAccount.logoId}
                                    type={selectedAccount.type}
                                    size={20}
                                  />
                                ) : null}
                                <Text
                                  variant="body"
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                  className={cn(
                                    'text-right shrink',
                                    accountName ? '' : 'text-muted-foreground/60',
                                  )}
                                >
                                  {accountName ?? I18n.t('transactions.editor.choose_account')}
                                </Text>
                              </View>
                            </View>
                          </SummaryRow>
                        </View>
                      )}

                      {/* Category row (hidden for transfers and balance adjustments) */}
                      {!isTransferType && !isBalanceAdjustmentType ? (
                        <>
                          <View className="h-[1px] bg-border/15 mx-4" />
                          <View onLayout={registerFieldLayout('category')}>
                            <SummaryRow
                              label={I18n.t('transactions.editor.category')}
                              isActive={activeField === 'category'}
                              onPress={() => activateField('category')}
                              valueTone={fieldErrors.category ? 'error' : 'default'}
                              rightElement={null}
                            >
                              <View className="flex-row items-center justify-between">
                                <View className="flex-row items-center gap-2 flex-1 min-w-0">
                                  <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                                    <Hash size={13} color={themeColors.textMuted} />
                                  </View>
                                  <Text variant="caption" tone="muted">
                                    {I18n.t('transactions.editor.category')}
                                  </Text>
                                </View>
                                <View className="flex-row items-center justify-end gap-1.5 max-w-[58%]">
                                  {categoryPreview ? (
                                    <CategoryEmoji icon={categoryPreview.icon} size={20} />
                                  ) : null}
                                  <Text
                                    variant="body"
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                    className={cn(
                                      'text-right shrink',
                                      categoryPreview ? '' : 'text-muted-foreground/60',
                                    )}
                                  >
                                    {categoryPreview?.name ??
                                      I18n.t('transactions.editor.choose_category')}
                                  </Text>
                                </View>
                              </View>
                            </SummaryRow>
                          </View>
                        </>
                      ) : null}

                      {!isBalanceAdjustmentType ? (
                        <>
                          <View className="h-[1px] bg-border/15 mx-4" />

                          {/* Note row */}
                          <View onLayout={handleNoteFieldLayout}>
                            <SummaryRow
                              label={I18n.t('transaction_detail.note')}
                              isActive={activeField === 'note'}
                              onPress={focusNoteField}
                              rightElement={<View style={styles.trailingSpacer} />}
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
                                    placeholderTextColor={`${themeColors.mutedForeground}99`}
                                    returnKeyType="done"
                                    onFocus={handleNoteFocus}
                                    onBlur={handleNoteBlur}
                                    autoCorrect={false}
                                    autoComplete="off"
                                    spellCheck={false}
                                    style={[
                                      SINGLE_LINE_TEXT_INPUT_STYLE,
                                      styles.inlineSummaryInput,
                                      { color: themeColors.text },
                                    ]}
                                  />
                                </View>
                              </View>
                            </SummaryRow>
                          </View>

                          {/* Sentiment picker */}
                          {type === 'expense' ? (
                            <View className="items-center py-2.5">
                              <View className="flex-row items-center gap-5">
                                {(['sad', 'neutral', 'happy'] as const).map((s) => {
                                  const isActive = sentiment === s;
                                  return (
                                    <Pressable
                                      key={s}
                                      onPress={() => {
                                        setSentiment(s);
                                        void triggerHaptic('selection');
                                      }}
                                      className="items-center justify-center"
                                      style={{ opacity: isActive ? 1 : 0.3 }}
                                    >
                                      <SentimentIcon sentiment={s} size={36} />
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                          ) : null}
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
                            rightElement={<View style={styles.trailingSpacer} />}
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
                                  placeholderTextColor={`${themeColors.muted}99`}
                                  returnKeyType="done"
                                  onFocus={() => setActiveField('ruleName')}
                                  onBlur={() =>
                                    setActiveField((prev) => (prev === 'ruleName' ? null : prev))
                                  }
                                  style={[
                                    SINGLE_LINE_TEXT_INPUT_STYLE,
                                    styles.inlineSummaryInput,
                                    { color: themeColors.text },
                                  ]}
                                />
                              </View>
                            </View>
                          </SummaryRow>
                        </View>

                        <View className="h-[1px] bg-border/15 mx-4" />

                        {/* Repeat pattern */}
                        <View onLayout={registerFieldLayout('repeat')}>
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
                            rightElement={<View style={styles.trailingSpacer} />}
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
                                  placeholderTextColor={`${themeColors.muted}99`}
                                  keyboardType="number-pad"
                                  returnKeyType="done"
                                  onFocus={() => setActiveField('interval')}
                                  onBlur={() =>
                                    setActiveField((prev) => (prev === 'interval' ? null : prev))
                                  }
                                  style={[
                                    SINGLE_LINE_TEXT_INPUT_STYLE,
                                    styles.inlineSummaryInput,
                                    { color: themeColors.text },
                                  ]}
                                />
                              </View>
                            </View>
                          </SummaryRow>
                        </View>

                        <View className="h-[1px] bg-border/15 mx-4" />

                        {/* Ends */}
                        <View onLayout={registerFieldLayout('ends')}>
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
                            <View onLayout={registerFieldLayout('endDate')}>
                              <SummaryRow
                                label={I18n.t('transactions.editor.end_date')}
                                isActive={activeField === 'endDate'}
                                valueTone={fieldErrors.end_date ? 'error' : 'default'}
                                onPress={() => {
                                  activateField('endDate');
                                }}
                                rightElement={null}
                              >
                                <View className="flex-row items-center justify-between">
                                  <View className="flex-row items-center gap-2 flex-1 min-w-0">
                                    <View className="w-7 h-7 rounded-full bg-secondary/60 items-center justify-center">
                                      <Calendar size={13} color={themeColors.textMuted} />
                                    </View>
                                    <Text variant="caption" tone="muted">
                                      {I18n.t('transactions.editor.end_date')}
                                    </Text>
                                  </View>
                                  <Text
                                    variant="body"
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                    className={cn(
                                      'max-w-[58%] text-right',
                                      recurrenceEndDate ? '' : 'text-muted-foreground/60',
                                      fieldErrors.end_date ? 'text-destructive' : '',
                                    )}
                                  >
                                    {recurrenceEndDate
                                      ? formatDateDisplay(recurrenceEndDate, activeLocale)
                                      : I18n.t('transactions.editor.on_date')}
                                  </Text>
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
                              <SegmentedToggle
                                value={recurrenceStatusValue}
                                onChange={handleRecurrenceStatusChange}
                                options={recurrenceStatusOptions}
                                size="compact"
                                className="w-[138px]"
                              />
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
                  </Pressable>

                  {/* Note suggestions dropdown — outside Pressable so taps aren't intercepted */}
                  {noteSuggestionsVisible && noteSuggestionsTop !== null ? (
                    <Animated.View
                      entering={FadeIn.duration(120)}
                      exiting={FadeOut.duration(120)}
                      style={[
                        styles.noteSuggestionsDropdown,
                        {
                          top: noteSuggestionsTop,
                          borderWidth: 1,
                          borderColor: `${themeColors.border}25`,
                          borderTopLeftRadius: 0,
                          borderTopRightRadius: 0,
                          borderBottomLeftRadius: 18,
                          borderBottomRightRadius: 18,
                          backgroundColor: themeColors.card,
                          overflow: 'hidden',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 6 },
                          shadowOpacity: 0.08,
                          shadowRadius: 12,
                          elevation: 6,
                        },
                      ]}
                    >
                      {noteSuggestions.map((suggestion, index) => (
                        <React.Fragment key={suggestion}>
                          {index > 0 ? <View className="h-[1px] bg-border/15 mx-4" /> : null}
                          <Pressable
                            style={{ paddingHorizontal: 16, paddingVertical: 11 }}
                            onPress={() => {
                              handleNoteChange(suggestion);
                              setNoteSuggestions([]);
                              noteInputRef.current?.blur();
                              if (mode === 'create') {
                                const fields = getLatestTransactionFieldsByNote(suggestion);
                                if (fields) {
                                  if (!categoryId && fields.categoryId) {
                                    setCategoryId(fields.categoryId);
                                  }
                                  if (!accountId && fields.accountId) {
                                    setAccountId(fields.accountId);
                                  }
                                  if (!amount && fields.amount != null) {
                                    setAmount(String(fields.amount));
                                  }
                                }
                              }
                            }}
                          >
                            <Text
                              variant="body"
                              numberOfLines={1}
                              style={{ color: themeColors.text }}
                            >
                              {suggestion}
                            </Text>
                          </Pressable>
                        </React.Fragment>
                      ))}
                    </Animated.View>
                  ) : null}

                  <Pressable
                    accessible={false}
                    onPress={clearActiveField}
                    style={styles.summaryDismissFiller}
                  />
                </View>
                <Pressable
                  accessible={false}
                  onPress={clearActiveField}
                  style={styles.summaryDismissGutter}
                />
              </View>
            </ScrollView>
          </View>

          {showToolZone ? (
            <View
              style={toolZoneContainerStyle}
              className="border-t-2 border-border/50 bg-secondary/30"
              onStartShouldSetResponder={shouldHandleBackgroundPress}
              onResponderRelease={clearActiveField}
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
        </TabletContentContainer>
      </View>
      {!hideSplitMode ? (
        <SplitBillModal
          visible={splitBillModalVisible}
          onCancel={handleCancelSplitBill}
          onDone={handleDoneSplitBill}
          total={Number(amount) || 0}
          defaultAccountId={accountId}
          splits={splits}
          onChange={setSplits}
          splitEvenly={splitEvenly}
          onSplitEvenlyChange={setSplitEvenly}
          accounts={accounts}
          accountGroups={accountGroups}
          currencySymbol={entryCurrencySymbol}
          formatSettings={{ ...settings, currencySymbol: entryCurrencySymbol }}
          onMarkPaid={handleSplitMarkPaidLocal}
          onMarkUnpaid={handleSplitMarkUnpaidLocal}
          newlyPaidIds={newlyPaidIds}
        />
      ) : null}
      <AccountPickerSheet
        visible={activeField === 'account'}
        onClose={clearActiveField}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={accountId}
        onSelect={handleAccountSelect}
      />
      <AccountPickerSheet
        visible={activeField === 'fromAccount'}
        onClose={clearActiveField}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={fromAccountId}
        disabledId={toAccountId}
        onSelect={handleFromAccountSelect}
      />
      <AccountPickerSheet
        visible={activeField === 'toAccount'}
        onClose={clearActiveField}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={toAccountId}
        disabledId={fromAccountId}
        onSelect={handleToAccountSelect}
      />
      <CategoryPickerSheet
        visible={activeField === 'category'}
        onClose={clearActiveField}
        parents={categoryPanelParents}
        childByParent={categoryPanelChildren}
        allowParentSelection
        selectedCategoryId={categoryId}
        onSelect={handleCategorySelect}
      />
      <DatePickerModal
        visible={activeField === 'date'}
        value={date}
        onSelect={handleDateSelect}
        onClose={clearActiveField}
      />
      <DatePickerModal
        visible={activeField === 'endDate'}
        value={recurrenceEndDate || date}
        title={I18n.t('transactions.editor.end_date')}
        onSelect={handleRecurrenceEndDateSelect}
        onClose={clearActiveField}
      />
    </SafeAreaView>
  );
}
