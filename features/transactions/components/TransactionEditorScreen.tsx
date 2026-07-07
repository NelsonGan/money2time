import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import {
  ArrowLeftRight,
  ArrowRight,
  Calendar,
  Camera,
  ChevronDown,
  ChevronLeft,
  Clock,
  Coins,
  CreditCard,
  FileText,
  Hash,
  Layers,
  Pencil,
  Power,
  Repeat,
  Timer,
  Trash2,
  Type,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
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
import PagerView, { type PagerViewOnPageSelectedEvent } from 'react-native-pager-view';
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
  CurrencyPickerSheet,
  SegmentedToggle,
  Text,
} from '~/components/ui';
import { SentimentIcon } from '~/components/ui/SentimentIcons';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from '~/components/ui/textInputStyles';
import { useApp } from '~/context/AppContext';
import { useSetSplitBillSession } from '~/context/SplitBillSession';
import {
  NUMPAD_HANDLE_HEIGHT,
  NumpadDrawer,
  NumpadPanel,
  ReceiptField,
  type SplitDraft,
  splitsHelpers,
  SummaryRow,
  TransferFxModal,
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
import type { RootStackParamList } from '~/navigation/rootStack';
import { triggerHaptic } from '~/services/haptics';
import { deleteReceiptImage, saveReceiptImage } from '~/services/userAssets';
import type { Category, TransactionSentiment, TransactionType } from '~/types';
import { cn } from '~/utils';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { convert, currencySymbolForCode } from '~/utils/currency';
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
  pager: {
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
  /** Currency the amount was entered in (may differ from the account currency). */
  currency: string | null;
  categoryId: string | null;
  note: string;
  /** Stored receipt relative path (e.g. `receipts/9f3c.jpg`), or null. */
  receiptUri: string | null;
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

function TransactionTypeGlyph({
  type,
  color,
  size = 18,
}: {
  type: TransactionType;
  color: string;
  size?: number;
}) {
  const strokeProps = {
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (type === 'expense') {
    return (
      <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
        <Circle cx={5.25} cy={5.25} r={2.35} {...strokeProps} />
        <Path d="M7.25 7.25 13.5 13.5" {...strokeProps} />
        <Path d="M10.7 13.5h2.8v-2.8" {...strokeProps} />
      </Svg>
    );
  }

  if (type === 'income') {
    return (
      <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
        <Circle cx={5.25} cy={12.75} r={2.35} {...strokeProps} />
        <Path d="M7.25 10.75 13.5 4.5" {...strokeProps} />
        <Path d="M10.7 4.5h2.8v2.8" {...strokeProps} />
      </Svg>
    );
  }

  if (type === 'transfer') {
    return (
      <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
        <Path d="M3 6h10" {...strokeProps} />
        <Path d="m10.5 3.7 2.8 2.3-2.8 2.3" {...strokeProps} />
        <Path d="M15 12H5" {...strokeProps} />
        <Path d="m7.5 9.7-2.8 2.3 2.8 2.3" {...strokeProps} />
      </Svg>
    );
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 18 18" fill="none">
      <Path d="M3.5 5.25h11" {...strokeProps} />
      <Path d="M3.5 12.75h11" {...strokeProps} />
      <Circle cx={6.5} cy={5.25} r={1.55} {...strokeProps} />
      <Circle cx={11.5} cy={12.75} r={1.55} {...strokeProps} />
    </Svg>
  );
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

// How long a bulk-mode save holds the create pipeline off the JS thread. On
// the normal path runAfterInteractions lands the create behind the modal
// dismiss animation, but in bulk mode nothing is animating, so it would fire
// on the very next tick — exactly when the user starts typing the next
// amount. A fixed delay lets the field reset paint and the first numpad taps
// through first.
const BULK_CREATE_SUBMIT_DELAY_MS = 300;

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
  const {
    accounts,
    accountGroups,
    categories,
    settings,
    currentMonthWage,
    rateTable,
    fxCurrencies,
    quickEntryPrefs,
  } = useApp();

  // Bulk create mode: when on, Save keeps the editor open in create mode so the
  // user can add several transactions back-to-back. Persisted in quickEntryPrefs.
  // Only meaningful in create mode (not edit / recurring).
  const showBulkToggle = mode === 'create' && !recurringOptions;
  // Sticky-numpad mode: the amount pad lives in an always-present, pull-down
  // drawer instead of the shared bottom tool zone. Only the normal editor uses
  // it; the recurring editor keeps the tool zone (it also hosts repeat/ends).
  const useStickyNumpad = !recurringOptions;
  const bulkCreateEnabled = showBulkToggle && quickEntryPrefs.bulkCreateEnabled;
  // Bumped after each bulk save so the numpad clears in place (NumpadPanel
  // keeps its own internal expression and won't re-sync from an emptied
  // `amount` prop otherwise). Passed as `resetNonce`, not `key` — remounting
  // ~22 animated keys synchronously in the Save handler is a visible JS hit.
  const [bulkEntryNonce, setBulkEntryNonce] = useState(0);

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
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const setSplitSession = useSetSplitBillSession();
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
  // Currency the amount is entered in. Defaults to the account currency but can
  // be switched on the numpad (e.g. spending EUR from an MYR account).
  const [entryCurrency, setEntryCurrency] = useState<string>(
    initialValues?.currency ?? accountCurrency(initialSingleAccountId),
  );
  const [fromAccountId, setFromAccountId] = useState<string | null>(initialFromSelectionId);
  const [toAccountId, setToAccountId] = useState<string | null>(initialToSelectionId);
  // Cross-currency transfers: amount received in the destination currency. Empty
  // means "auto-convert at the current rate".
  const [transferToAmount, setTransferToAmount] = useState(
    initialValues?.toAmount != null ? String(initialValues.toAmount) : '',
  );
  const [transferFxModalVisible, setTransferFxModalVisible] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(initialCategorySelectionId);
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [sentiment, setSentiment] = useState<TransactionSentiment>(
    initialValues?.sentiment ?? 'neutral',
  );
  // Optional receipt image (relative path within the user-assets store).
  const [receiptUri, setReceiptUri] = useState<string | null>(initialValues?.receiptUri ?? null);
  // The receipt that was persisted when the editor opened. Used so editing the
  // attachment cleans up orphaned files (the prior one on disk) without deleting
  // the originally-saved file until the change is actually committed via Save.
  const persistedReceiptRef = useRef<string | null>(initialValues?.receiptUri ?? null);
  // Mirror of the current receipt + whether it was committed via Save, read by
  // the unmount cleanup so closing without saving doesn't leave an orphan file.
  const receiptUriRef = useRef<string | null>(initialValues?.receiptUri ?? null);
  const receiptCommittedRef = useRef(false);
  const handleReceiptChange = useCallback((nextReceiptUri: string | null) => {
    setReceiptUri((prev) => {
      // Drop an in-session temp (a file saved this session that isn't the
      // originally-persisted one) the moment it's replaced or removed.
      if (prev && prev !== persistedReceiptRef.current && prev !== nextReceiptUri) {
        deleteReceiptImage(prev);
      }
      return nextReceiptUri;
    });
    receiptUriRef.current = nextReceiptUri;
  }, []);
  // Snap / attach a receipt from the numpad toolbar (mirrors ReceiptField).
  const pickReceiptFrom = useCallback(
    async (source: 'camera' | 'library') => {
      try {
        const permission =
          source === 'camera'
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            I18n.t('accounts.logo.permission_title'),
            I18n.t('accounts.logo.permission_message'),
          );
          return;
        }
        const result =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
            : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
        if (result.canceled || !result.assets?.[0]) return;
        handleReceiptChange(saveReceiptImage(result.assets[0].uri));
      } catch {
        Alert.alert(I18n.t('accounts.logo.upload_failed'));
      }
    },
    [handleReceiptChange],
  );
  const handleAddReceipt = useCallback(() => {
    void triggerHaptic('selection');
    Alert.alert(I18n.t('transactions.editor.receipt.label'), undefined, [
      {
        text: I18n.t('transactions.editor.receipt.take_photo'),
        onPress: () => void pickReceiptFrom('camera'),
      },
      {
        text: I18n.t('transactions.editor.receipt.choose_from_library'),
        onPress: () => void pickReceiptFrom('library'),
      },
      { text: I18n.t('common.cancel'), style: 'cancel' },
    ]);
  }, [pickReceiptFrom]);
  // On unmount: if the editor closed without committing a Save, delete a
  // freshly-picked file that never became the persisted attachment (create-mode
  // attach-then-cancel, or a replace that was abandoned). The persisted file is
  // left untouched — its row may still reference it.
  useEffect(
    () => () => {
      if (
        !receiptCommittedRef.current &&
        receiptUriRef.current &&
        receiptUriRef.current !== persistedReceiptRef.current
      ) {
        deleteReceiptImage(receiptUriRef.current);
      }
    },
    [],
  );
  const [amountExpression, setAmountExpression] = useState('');
  // Whether the sticky numpad drawer is pulled open. Starts open so the user
  // can type the amount immediately without tapping the field first.
  const [numpadExpanded, setNumpadExpanded] = useState(true);
  // Currency picker (opened from the numpad toolbar) for expense/income entry.
  const [currencyPickerVisible, setCurrencyPickerVisible] = useState(false);

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
  // Lightweight transient toast for validation failures — the inline field
  // errors can sit hidden behind the numpad, so surface a clear message on top.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    void triggerHaptic('warning');
    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);
  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );
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
  // The amount is entered in `entryCurrency` (selectable on the numpad for
  // expense/income). Transfers always use the from-account's currency.
  const effectiveEntryCurrency = isTransferType ? accountCurrency(fromAccountId) : entryCurrency;
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
      void triggerHaptic('selection');
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

  // Nudge computed for expense semantics regardless of the current type, so the
  // expense pager page shows the same work-time hint even while another type is
  // active (keeps the pages layout-identical).
  const expenseNudgeParts = useMemo(() => {
    if (entryCurrency !== settings.currencyCode) return null;
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
  }, [amount, currentMonthWage?.trueHourlyRate, entryCurrency, settings.currencyCode]);

  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const selectedFromAccount = fromAccountId ? (accountById.get(fromAccountId) ?? null) : null;
  const selectedToAccount = toAccountId ? (accountById.get(toAccountId) ?? null) : null;

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
    // In sticky mode the pad persists, so the live expression is cleared on
    // confirm / bulk-reset instead of when focus leaves the amount field.
    if (useStickyNumpad) return;
    if (activeField !== 'amount') {
      setAmountExpression('');
    }
  }, [activeField, useStickyNumpad]);

  // Sticky numpad stays open no matter which field is active — sheets, the date
  // modal, and even the note keyboard just overlay it.

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

  // Whether the pushed Split Bill route is open. Drives the live session
  // republish (below) so the screen mirrors edits made back here.
  const [splitRouteOpen, setSplitRouteOpen] = useState(false);
  // Set to the latest session publisher so handleOpenSplitBill (defined before
  // the publisher) can push the session synchronously as it navigates.
  const publishSessionRef = useRef<(rows: SplitDraft[], evenly: boolean) => void>(() => {});

  // New split payback rows default to the user's chosen "paid to" account (set
  // on the Settle Up screen), falling back to the first account so the value is
  // never empty on a brand-new setup.
  const defaultPaybackAccountId = settings.defaultPaybackAccountId ?? accounts[0]?.id ?? null;

  const buildInitialSplitRows = useCallback((): SplitDraft[] => {
    const numericAmount = Number(amount);
    const total = Number.isFinite(numericAmount) ? numericAmount : 0;
    const portions = splitsHelpers.distributeEvenly(total, 2);
    // Pre-assign ids so Mark Paid is available even in create mode (the editor
    // gates the action on `row.id` being present).
    return [
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
        paybackAccountId: defaultPaybackAccountId,
      },
    ];
  }, [amount, defaultPaybackAccountId]);

  const numericAmountForGate = Number(amount);
  // Splitting only needs a positive amount — the account/category can be filled
  // in afterwards, and each split row carries its own payback account.
  const canOpenSplitBill =
    !hideSplitMode &&
    type === 'expense' &&
    !recurringOptions &&
    Number.isFinite(numericAmountForGate) &&
    numericAmountForGate > 0;

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
    const hadSplits = splits.length > 0;
    const nextSplits = hadSplits ? splits : buildInitialSplitRows();
    const nextEvenly = hadSplits ? splitEvenly : true;
    splitBillSnapshotRef.current = { splits, amount, splitEvenly, splitMode };
    if (!splitMode) setSplitMode(true);
    if (!hadSplits) {
      setSplits(nextSplits);
      setSplitEvenly(true);
    }
    setSplitRouteOpen(true);
    // Publish synchronously (batched with the navigation) so the pushed screen
    // has data on its very first render.
    publishSessionRef.current(nextSplits, nextEvenly);
    navigation.navigate('SplitBill');
  }, [amount, buildInitialSplitRows, canOpenSplitBill, navigation, splitEvenly, splitMode, splits]);

  const handleDoneSplitBill = useCallback(() => {
    setSplitRouteOpen(false);
    splitBillSnapshotRef.current = null;
    // If user committed an empty configuration, fold split mode back off.
    if (splits.filter((s) => !s.isSelf).length === 0) {
      setSplitMode(false);
      setSplits([]);
    }
  }, [splits]);

  const handleCancelSplitBill = useCallback(() => {
    setSplitRouteOpen(false);
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

  const entryCurrencySymbol = useMemo(
    () => currencySymbolForCode(effectiveEntryCurrency),
    [effectiveEntryCurrency],
  );

  // Publish the editor's live split draft + callbacks for the pushed Split Bill
  // route to consume. The editor only ever writes the session (never reads it),
  // so republishing on every edit can't re-render this screen into a loop.
  const publishSplitSession = useCallback(
    (rows: SplitDraft[], evenly: boolean) => {
      setSplitSession({
        total: Number(amount) || 0,
        defaultAccountId: defaultPaybackAccountId,
        splits: rows,
        onChange: setSplits,
        splitEvenly: evenly,
        onSplitEvenlyChange: setSplitEvenly,
        accounts,
        accountGroups,
        currencySymbol: entryCurrencySymbol,
        formatSettings: { ...settings, currencySymbol: entryCurrencySymbol },
        onMarkPaid: handleSplitMarkPaidLocal,
        onMarkUnpaid: handleSplitMarkUnpaidLocal,
        newlyPaidIds,
        onDone: handleDoneSplitBill,
        onCancel: handleCancelSplitBill,
      });
    },
    [
      defaultPaybackAccountId,
      accounts,
      accountGroups,
      amount,
      entryCurrencySymbol,
      handleCancelSplitBill,
      handleDoneSplitBill,
      handleSplitMarkPaidLocal,
      handleSplitMarkUnpaidLocal,
      newlyPaidIds,
      setSplitSession,
      settings,
    ],
  );

  // Assign during render (not in an effect) so an auto-open-on-mount flow, whose
  // effect runs before any post-render effect, still finds the real publisher.
  publishSessionRef.current = publishSplitSession;

  // Keep the pushed screen in sync with edits made here (amount, splits, etc.).
  useEffect(() => {
    if (splitRouteOpen) publishSplitSession(splits, splitEvenly);
  }, [splitRouteOpen, splits, splitEvenly, publishSplitSession]);

  // Tear the session down once the route closes (and on unmount).
  useEffect(() => {
    if (!splitRouteOpen) setSplitSession(null);
  }, [splitRouteOpen, setSplitSession]);

  useEffect(() => () => setSplitSession(null), [setSplitSession]);

  // Currencies offered on the numpad: the selected account's currency first,
  // then the reporting currency, the user's added currencies, and any other
  // account currencies — de-duplicated.
  const enabledCurrencies = useMemo(() => {
    const acct = accountCurrency(accountId);
    const set = new Set<string>([acct, settings.currencyCode, ...fxCurrencies]);
    for (const account of accounts) {
      if (account.currency) set.add(account.currency);
    }
    return [acct, ...Array.from(set).filter((code) => code !== acct)];
  }, [accountCurrency, accountId, accounts, fxCurrencies, settings.currencyCode]);

  // "Amount is being entered right now": drives the live-expression display and,
  // in sticky mode, the amount row's active highlight.
  const amountLive = useStickyNumpad ? numpadExpanded : activeField === 'amount';

  const amountDisplay = useMemo(() => {
    if (amountLive && amountExpression) {
      return `${entryCurrencySymbol}${amountExpression}`;
    }
    const num = Number(amount);
    if (!amount || !Number.isFinite(num)) return `${entryCurrencySymbol}${formatMoney(0)}`;
    return `${entryCurrencySymbol}${formatMoney(num)}`;
  }, [amountLive, amount, amountExpression, entryCurrencySymbol]);

  // For a cross-currency transfer, the credited amount in the destination
  // currency — shown next to the main amount and editable via TransferFxModal.
  const transferReceivedLabel = useMemo(() => {
    if (
      !isTransferType ||
      !selectedFromAccount ||
      !selectedToAccount ||
      selectedFromAccount.currency === selectedToAccount.currency
    ) {
      return null;
    }
    const fromCur = selectedFromAccount.currency;
    const toCur = selectedToAccount.currency;
    const fromAmount = Number(amount) || 0;
    const received = transferToAmount.trim()
      ? Number(transferToAmount)
      : convert(fromAmount, fromCur, toCur, rateTable).value;
    return `→ ${currencySymbolForCode(toCur)}${Number.isFinite(received) ? received.toFixed(2) : '0.00'}`;
  }, [amount, isTransferType, rateTable, selectedFromAccount, selectedToAccount, transferToAmount]);

  // The main-currency equivalent of the entered amount, shown as a suffix under
  // the amount for any subcurrency entry. For transfers the received amount
  // already covers the destination currency, so only add this when neither side
  // is the main currency (e.g. a same-subcurrency transfer).
  const reportingEquivLabel = useMemo(() => {
    if (isBalanceAdjustmentType) return null;
    if (effectiveEntryCurrency === settings.currencyCode) return null;
    if (isTransferType && selectedToAccount?.currency === settings.currencyCode) return null;
    const num = Number(amount);
    if (!num || !Number.isFinite(num)) return null;
    const { value } = convert(num, effectiveEntryCurrency, settings.currencyCode, rateTable);
    return `≈ ${currencySymbolForCode(settings.currencyCode)}${formatMoney(value)}`;
  }, [
    amount,
    effectiveEntryCurrency,
    isBalanceAdjustmentType,
    isTransferType,
    selectedToAccount,
    rateTable,
    settings.currencyCode,
  ]);

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

  const handleSubmit = (bulkOverride?: boolean) => {
    // Two explicit save actions drive this: "Add" (bulk = false, closes) and
    // "Add" + bulk icon (bulk = true, stays open). Falls back to the persisted
    // pref for the recurring editor's single Save button.
    const bulk = bulkOverride ?? bulkCreateEnabled;
    const numericAmount = normalizeMoneyAmount(Number(amount));
    const amountDraft = amount.trim();
    const normalizedNote = note.trim();
    const fallbackDefaultNote =
      autoNoteFromCategoryRef.current?.trim() || categoryPreview?.name?.trim() || '';
    const resolvedNote = normalizedNote.length > 0 ? normalizedNote : fallbackDefaultNote || null;
    if (!amountDraft || !Number.isFinite(numericAmount)) {
      setFieldErrors({ amount: I18n.t('transactions.editor.error.amount_required') });
      activateField('amount');
      if (useStickyNumpad) setNumpadExpanded(true);
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
          showToast(I18n.t('transactions.editor.error.complete_required'));
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
          showToast(I18n.t('transactions.editor.error.complete_required'));
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
          showToast(I18n.t('transactions.editor.error.complete_required'));
          if (baseErrors.account) activateField('account');
          else if (baseErrors.category) activateField('category');
          return;
        }
        // When the amount is entered in a currency other than the account's,
        // freeze the converted account-currency value so balances stay correct.
        const acctCurrency = accountCurrency(accountId);
        const accountAmount =
          entryCurrency !== acctCurrency
            ? convert(numericAmount, entryCurrency, acctCurrency, rateTable).value
            : null;
        submitPayload = {
          type,
          amount: numericAmount,
          currency: entryCurrency,
          accountAmount,
          date: txDate,
          accountId,
          categoryId,
          fromAccountId: null,
          toAccountId: null,
          note: resolvedNote,
          receiptUri,
          sentiment,
        };
        preparedSubmitPayload = submitPayload;
      }

      // Recurring mode applies to expense/income AND transfer rules. Balance
      // adjustments are never offered as a recurring type, so skip them. When a
      // rule is being saved we hand off to onSubmitRecurring and clear the
      // one-off submitPayload (the recurring route's onSubmit is a no-op).
      if (recurringOptions && !isBalanceAdjustmentType && submitPayload) {
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

      void triggerHaptic('success');
      // Mark the current receipt as committed so the unmount cleanup keeps it.
      receiptCommittedRef.current = true;

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

      // Bulk create mode: keep the editor open and make the reset feel instant.
      // Reset the per-transaction fields (amount / note / receipt / splits) on
      // THIS frame so the numpad clears and refocuses immediately, then hand
      // the create off on a short timer (see BULK_CREATE_SUBMIT_DELAY_MS). The
      // create is itself optimistic (the transaction lands in state
      // synchronously and the SQLite write is deferred), so nothing here waits
      // on the DB. Type / account / category / date / sentiment are kept for
      // the next entry.
      if (bulk) {
        // The captured payload already owns the receipt — detach it from the
        // editor without deleting the file, and reset the commit flag so the
        // next (not-yet-saved) entry starts clean.
        receiptUriRef.current = null;
        receiptCommittedRef.current = false;
        setReceiptUri(null);
        setAmount('');
        setAmountExpression('');
        setNote('');
        setNoteSuggestions([]);
        setError(null);
        setFieldErrors({});
        if (splitMode) {
          setSplitMode(false);
          setSplits([]);
          setNewlyPaidIds(new Set());
        }
        setBulkEntryNonce((n) => n + 1);
        activateField('amount');
        // Re-open the sticky drawer so the next amount is ready to type.
        if (useStickyNumpad) setNumpadExpanded(true);
        if (deferredSubmit) {
          setTimeout(deferredSubmit, BULK_CREATE_SUBMIT_DELAY_MS);
        }
        return;
      }

      // Normal path: close modal immediately, then submit after the dismiss
      // animation.
      onClose();

      // The submission is committed — delete the previously-persisted receipt
      // file if the user replaced or removed it this session (edit mode).
      if (persistedReceiptRef.current && persistedReceiptRef.current !== receiptUri) {
        deleteReceiptImage(persistedReceiptRef.current);
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
  // Label for the below-the-numpad action(s): "Add" on a new entry, "Update"
  // when editing (honours an explicit override either way).
  const saveLabel =
    submitLabelOverride ??
    (mode === 'create'
      ? I18n.t('transactions.editor.title_create')
      : I18n.t('transactions.editor.title_edit'));
  const summaryFlex = windowHeight < 650 ? 0.38 : windowHeight < 750 ? 0.42 : 0.46;
  const isRecurringEditor = Boolean(recurringOptions);
  const showSubtitle = Boolean(subtitle) && isRecurringEditor;
  // The type selector lives in the header as swipeable tabs (create/edit). The
  // recurring editor keeps its titled header + pill row.
  const useTypeTabs = showTypeSelector && !isRecurringEditor;
  const typeTint = useCallback(
    (value: TransactionType) =>
      value === 'expense'
        ? themeColors.error
        : value === 'income'
          ? themeColors.success
          : themeColors.primary,
    [themeColors.error, themeColors.primary, themeColors.success],
  );
  // Type pager: one real page per available type, so a swipe peeks the next
  // type's form (the active page is interactive; the rest are read-only mirrors).
  const activeTypeIndex = Math.max(
    0,
    availableTypeCards.findIndex((c) => c.value === type),
  );
  const pagerRef = useRef<PagerView>(null);
  const pagerPositionRef = useRef(activeTypeIndex);
  const initialTypeIndexRef = useRef(activeTypeIndex);

  const handlePagerSelected = useCallback(
    (event: PagerViewOnPageSelectedEvent) => {
      const position = event.nativeEvent.position;
      pagerPositionRef.current = position;
      const nextType = availableTypeCards[position]?.value;
      if (nextType && nextType !== type) handleTypeChange(nextType);
    },
    [availableTypeCards, handleTypeChange, type],
  );

  // Keep the pager aligned when the type changes elsewhere (tab tap, fallback).
  useEffect(() => {
    if (!useTypeTabs) return;
    if (activeTypeIndex === pagerPositionRef.current) return;
    pagerPositionRef.current = activeTypeIndex;
    pagerRef.current?.setPage(activeTypeIndex);
  }, [useTypeTabs, activeTypeIndex]);

  // Per-type field selection: live values for the active type, the stashed
  // selection for the others (mirrors what handleTypeChange would restore).
  // Category name/icon lookup across ALL categories (preview pages may show a
  // different type's category than the one currently in `categoryPreviewById`).
  const allCategoryPreviewById = useMemo(() => {
    const byId = new Map(categories.map((c) => [c.id, c]));
    const previews = new Map<string, { icon: string; name: string }>();
    categories.forEach((category) => {
      const parent = category.parentId ? byId.get(category.parentId) : null;
      previews.set(category.id, {
        icon: resolveCategoryIcon(category.icon, parent?.icon ?? null),
        name: parent ? `${parent.name} / ${category.name}` : category.name,
      });
    });
    return previews;
  }, [categories]);
  const inlineRecurringFields: ActiveField[] = ['ruleName', 'interval', 'status'];
  const showToolZone =
    activeField !== null &&
    activeField !== 'note' &&
    // In sticky mode the amount pad is its own drawer, not a tool-zone panel.
    !(useStickyNumpad && activeField === 'amount') &&
    !inlineRecurringFields.includes(activeField) &&
    !SHEET_FIELDS.includes(activeField) &&
    !MODAL_FIELDS.includes(activeField);
  const noteSuggestionsVisible = noteSuggestions.length > 0 && activeField === 'note';
  const noteSuggestionsTop = noteFieldFrame ? noteFieldFrame.y + noteFieldFrame.height : null;
  const effectiveSummaryFlex =
    showToolZone && activeField === 'amount' ? Math.min(0.54, summaryFlex + 0.05) : summaryFlex;
  const recurringToolZonePadding =
    isRecurringEditor && showToolZone ? Math.max(520, Math.round(windowHeight * 0.62)) : 0;
  // Sticky drawer geometry + toolbar. A compact button row (split / currency /
  // bulk) rides above the pad; its buttons appear only when relevant.
  const showSplitButton = !hideSplitMode && type === 'expense' && !recurringOptions;
  const showCurrencyButton =
    !isTransferType && !isBalanceAdjustmentType && enabledCurrencies.length > 1;
  const showSentimentButton = useStickyNumpad && type === 'expense';
  // Receipt attach rides at the right end of the numpad toolbar (money-in/out).
  const showReceiptButton = useStickyNumpad && (type === 'expense' || type === 'income');
  const showNumpadToolbar =
    useStickyNumpad &&
    (showSplitButton || showCurrencyButton || showSentimentButton || showReceiptButton);
  const numpadHeaderHeight = showNumpadToolbar ? 48 : 0;
  // Compact 4-row pad with flat, short keys.
  const numpadBodyHeight = Math.round(Math.min(224, Math.max(168, windowHeight * 0.24)));
  // The save action(s) sit in a footer below the pad and own the bottom inset.
  // Trim the home-indicator gap so the buttons don't float too high off the edge.
  const numpadFooterBottomPad = Math.max(safeAreaInsets.bottom - 12, 6);
  const numpadFooterHeight = useStickyNumpad ? 8 + 48 + numpadFooterBottomPad : 0;
  const summaryBottomPadding = isRecurringEditor
    ? showToolZone
      ? recurringToolZonePadding
      : 196
    : useStickyNumpad
      ? // Clear the collapsed drawer's peeking handle.
        NUMPAD_HANDLE_HEIGHT + 24
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
      // Sticky mode: Done just pulls the drawer down so the fields are visible;
      // the user picks the next field themselves.
      if (useStickyNumpad) {
        setNumpadExpanded(false);
        return;
      }
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
    [
      accountId,
      activateField,
      categoryId,
      fromAccountId,
      hideAccountSelector,
      isTransferType,
      useStickyNumpad,
    ],
  );

  // Tapping the amount row pulls the sticky drawer open (and closes any other
  // open field); in the classic layout it just activates the amount tool zone.
  const handleAmountRowPress = useCallback(() => {
    if (useStickyNumpad) {
      void triggerHaptic('selection');
      activateField(null);
      setNumpadExpanded(true);
      return;
    }
    activateField('amount');
  }, [activateField, useStickyNumpad]);

  // Toolbar sentiment: neutral -> happy -> sad -> neutral.
  const cycleSentiment = useCallback(() => {
    void triggerHaptic('selection');
    setSentiment((current) =>
      current === 'neutral' ? 'happy' : current === 'happy' ? 'sad' : 'neutral',
    );
  }, []);

  const handleAccountSelect = useCallback(
    (nextAccountId: string) => {
      setAccountId(nextAccountId);
      // Default the entry currency to the newly chosen account's currency.
      setEntryCurrency(accountCurrency(nextAccountId));
      if (isBalanceAdjustmentType) {
        activateField('amount');
        return;
      }
      activateField(categoryId ? null : 'category');
    },
    [accountCurrency, activateField, categoryId, isBalanceAdjustmentType],
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
    // Note is optional, so just close the picker instead of jumping into it.
    clearActiveField();
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
          <View className="flex-1">
            {!isTransferType && !isBalanceAdjustmentType && enabledCurrencies.length > 1 ? (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  style={{ flexGrow: 0, maxHeight: 52 }}
                  contentContainerStyle={{
                    gap: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    alignItems: 'center',
                  }}
                >
                  {enabledCurrencies.map((code) => {
                    const selected = code === entryCurrency;
                    return (
                      <Pressable
                        key={code}
                        onPress={() => {
                          void triggerHaptic('selection');
                          setEntryCurrency(code);
                        }}
                        className={cn(
                          'px-3.5 py-1.5 rounded-full border',
                          selected
                            ? 'bg-primary/15 border-primary/50'
                            : 'bg-secondary/40 border-transparent',
                        )}
                      >
                        <Text
                          variant="caption"
                          className={selected ? 'text-primary' : 'text-muted-foreground'}
                        >
                          {code}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <View className="mb-1 h-[1px] bg-border/40" />
              </>
            ) : null}
            <View className="flex-1">
              <NumpadPanel
                resetNonce={bulkEntryNonce}
                initialExpression={amount}
                onBackgroundPress={clearActiveField}
                onValueChange={handleAmountValueChange}
                onConfirm={handleAmountConfirm}
              />
            </View>
          </View>
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

  const renderFields = (pageType: TransactionType, isActive: boolean) => {
    const pageIsTransfer = pageType === 'transfer';
    const pageIsBalanceAdj = pageType === 'balance_adjustment';
    const pageSel = isActive
      ? { accountId, fromAccountId, toAccountId, categoryId }
      : fieldSelectionsByTypeRef.current[pageType];
    const pageAccount = pageSel.accountId ? (accountById.get(pageSel.accountId) ?? null) : null;
    const pageFromAccount = pageSel.fromAccountId
      ? (accountById.get(pageSel.fromAccountId) ?? null)
      : null;
    const pageToAccount = pageSel.toAccountId
      ? (accountById.get(pageSel.toAccountId) ?? null)
      : null;
    const pageAccountName = pageAccount?.name ?? null;
    const pageFromAccountName = pageFromAccount?.name ?? null;
    const pageToAccountName = pageToAccount?.name ?? null;
    const pageCategory = pageSel.categoryId
      ? (allCategoryPreviewById.get(pageSel.categoryId) ?? null)
      : null;
    const pageTone = isActive
      ? amountTone
      : pageType === 'expense'
        ? ('error' as const)
        : pageType === 'income'
          ? ('success' as const)
          : ('default' as const);
    const pageNudge = pageType === 'expense' ? expenseNudgeParts : null;
    const pageTransferReceived = isActive ? transferReceivedLabel : null;
    const pageReportingEquiv = isActive ? reportingEquivLabel : null;
    const pageActiveField = isActive ? activeField : null;
    const pageFieldErrors = isActive ? fieldErrors : ({} as typeof fieldErrors);
    const pageRegisterLayout = isActive
      ? registerFieldLayout
      : (_field: NonNullActiveField) => undefined;
    return (
      <ScrollView
        ref={isActive ? editorScrollRef : undefined}
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
                {/* Sticky mode moves the date onto the numpad's date key. */}
                {!pageIsBalanceAdj && !useStickyNumpad ? (
                  <>
                    {/* Date row */}
                    <View onLayout={pageRegisterLayout('date')}>
                      <SummaryRow
                        label={I18n.t('transactions.editor.date')}
                        value={formatDateDisplay(date, activeLocale)}
                        isActive={pageActiveField === 'date'}
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
                <View onLayout={pageRegisterLayout('amount')}>
                  <SummaryRow
                    label={I18n.t('transactions.editor.amount')}
                    isActive={false}
                    onPress={handleAmountRowPress}
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
                      <View style={{ maxWidth: '55%' }} className="items-end">
                        <Text
                          variant="heading"
                          numberOfLines={1}
                          style={{
                            fontSize:
                              amountDisplay.length > 12 ? 14 : amountDisplay.length > 9 ? 18 : 24,
                          }}
                          className={cn(
                            pageTone === 'error'
                              ? 'text-destructive'
                              : pageTone === 'success'
                                ? 'text-success'
                                : 'text-foreground',
                          )}
                        >
                          {amountDisplay}
                        </Text>
                        {pageTransferReceived ? (
                          <Pressable
                            onPress={() => setTransferFxModalVisible(true)}
                            hitSlop={6}
                            className="mt-0.5 flex-row items-center gap-1"
                          >
                            <Text
                              variant="caption"
                              numberOfLines={1}
                              style={{ color: themeColors.primary }}
                            >
                              {pageTransferReceived}
                            </Text>
                            <Pencil size={11} color={themeColors.primary} />
                          </Pressable>
                        ) : null}
                        {pageReportingEquiv ? (
                          <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
                            {pageReportingEquiv}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    {pageNudge ? (
                      <Text
                        variant="caption"
                        tone="muted"
                        className="text-right mt-0.5"
                        style={styles.nudgeLabel}
                      >
                        {pageNudge.before}
                        <Text variant="caption" tone="primary" style={styles.nudgeLabel}>
                          {pageNudge.hours}
                        </Text>
                        {pageNudge.after}
                      </Text>
                    ) : null}
                  </SummaryRow>
                </View>

                {hideAccountSelector ? null : <View className="h-[1px] bg-border/15 mx-4" />}

                {/* Account row(s) */}
                {hideAccountSelector ? null : pageIsTransfer ? (
                  <>
                    <View onLayout={pageRegisterLayout('fromAccount')}>
                      <SummaryRow
                        label={I18n.t('transactions.editor.from')}
                        isActive={pageActiveField === 'fromAccount'}
                        onPress={() => activateField('fromAccount')}
                        valueTone={pageFieldErrors.from_account ? 'error' : 'default'}
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
                            {pageFromAccount ? (
                              <AccountLogo
                                logoId={pageFromAccount.logoId}
                                type={pageFromAccount.type}
                                size={20}
                              />
                            ) : null}
                            <Text
                              variant="body"
                              numberOfLines={1}
                              ellipsizeMode="tail"
                              className={cn(
                                'text-right shrink',
                                pageFromAccountName ? '' : 'text-muted-foreground/60',
                              )}
                            >
                              {pageFromAccountName ?? I18n.t('transactions.editor.choose_account')}
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
                    <View onLayout={pageRegisterLayout('toAccount')}>
                      <SummaryRow
                        label={I18n.t('transactions.editor.to')}
                        isActive={pageActiveField === 'toAccount'}
                        onPress={() => activateField('toAccount')}
                        valueTone={pageFieldErrors.to_account ? 'error' : 'default'}
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
                            {pageToAccount ? (
                              <AccountLogo
                                logoId={pageToAccount.logoId}
                                type={pageToAccount.type}
                                size={20}
                              />
                            ) : null}
                            <Text
                              variant="body"
                              numberOfLines={1}
                              ellipsizeMode="tail"
                              className={cn(
                                'text-right shrink',
                                pageToAccountName ? '' : 'text-muted-foreground/60',
                              )}
                            >
                              {pageToAccountName ?? I18n.t('transactions.editor.choose_account')}
                            </Text>
                          </View>
                        </View>
                      </SummaryRow>
                    </View>
                  </>
                ) : (
                  <View onLayout={pageRegisterLayout('account')}>
                    <SummaryRow
                      label={I18n.t('transactions.editor.account')}
                      isActive={pageActiveField === 'account'}
                      onPress={() => activateField('account')}
                      valueTone={pageFieldErrors.account ? 'error' : 'default'}
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
                          {pageAccount ? (
                            <AccountLogo
                              logoId={pageAccount.logoId}
                              type={pageAccount.type}
                              size={20}
                            />
                          ) : null}
                          <Text
                            variant="body"
                            numberOfLines={1}
                            ellipsizeMode="tail"
                            className={cn(
                              'text-right shrink',
                              pageAccountName ? '' : 'text-muted-foreground/60',
                            )}
                          >
                            {pageAccountName ?? I18n.t('transactions.editor.choose_account')}
                          </Text>
                        </View>
                      </View>
                    </SummaryRow>
                  </View>
                )}

                {/* Category row (hidden for transfers and balance adjustments) */}
                {!pageIsTransfer && !pageIsBalanceAdj ? (
                  <>
                    <View className="h-[1px] bg-border/15 mx-4" />
                    <View onLayout={pageRegisterLayout('category')}>
                      <SummaryRow
                        label={I18n.t('transactions.editor.category')}
                        isActive={pageActiveField === 'category'}
                        onPress={() => activateField('category')}
                        valueTone={pageFieldErrors.category ? 'error' : 'default'}
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
                            {pageCategory ? (
                              <CategoryEmoji icon={pageCategory.icon} size={20} />
                            ) : null}
                            <Text
                              variant="body"
                              numberOfLines={1}
                              ellipsizeMode="tail"
                              className={cn(
                                'text-right shrink',
                                pageCategory ? '' : 'text-muted-foreground/60',
                              )}
                            >
                              {pageCategory?.name ?? I18n.t('transactions.editor.choose_category')}
                            </Text>
                          </View>
                        </View>
                      </SummaryRow>
                    </View>
                  </>
                ) : null}

                {!pageIsBalanceAdj ? (
                  <>
                    <View className="h-[1px] bg-border/15 mx-4" />

                    {/* Note row */}
                    <View onLayout={isActive ? handleNoteFieldLayout : undefined}>
                      <SummaryRow
                        label={I18n.t('transaction_detail.note')}
                        isActive={pageActiveField === 'note'}
                        onPress={focusNoteField}
                        rightElement={null}
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
                            {isActive ? (
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
                            ) : (
                              // Mirror the TextInput's exact metrics so the row
                              // height doesn't jump when a page swaps live/static
                              // mid-swipe.
                              <Text
                                numberOfLines={1}
                                style={[
                                  SINGLE_LINE_TEXT_INPUT_STYLE,
                                  styles.inlineSummaryInput,
                                  {
                                    color: note
                                      ? themeColors.text
                                      : `${themeColors.mutedForeground}99`,
                                  },
                                ]}
                              >
                                {note || I18n.t('transactions.editor.optional')}
                              </Text>
                            )}
                          </View>
                        </View>
                      </SummaryRow>
                    </View>

                    {/* Receipt is added from the numpad's camera button; the row
                      only appears once something is attached (to show it). */}
                    {(pageType === 'expense' || pageType === 'income') && receiptUri && isActive ? (
                      <>
                        <View className="h-[1px] bg-border/15 mx-4" />
                        <ReceiptField receiptUri={receiptUri} onChange={handleReceiptChange} />
                      </>
                    ) : null}

                    {/* Sentiment now cycles from the numpad toolbar. */}
                  </>
                ) : null}
              </View>

              {/* Split Bill now lives in the numpad drawer toolbar. */}

              {/* Recurring options (traditional form inputs, secondary) */}
              {recurringOptions ? (
                <View className="mt-3 rounded-[20px] bg-card/60 border border-border/25 overflow-hidden">
                  {/* Rule name */}
                  <View>
                    <SummaryRow
                      label={I18n.t('transactions.editor.rule_name')}
                      isActive={pageActiveField === 'ruleName'}
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
                          {pageFieldErrors.rule_name ? (
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
                  <View onLayout={pageRegisterLayout('repeat')}>
                    <SummaryRow
                      label={I18n.t('transactions.editor.repeat')}
                      isActive={pageActiveField === 'repeat'}
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
                      isActive={pageActiveField === 'interval'}
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
                  <View onLayout={pageRegisterLayout('ends')}>
                    <SummaryRow
                      label={I18n.t('transactions.editor.ends')}
                      isActive={pageActiveField === 'ends'}
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
                      <View onLayout={pageRegisterLayout('endDate')}>
                        <SummaryRow
                          label={I18n.t('transactions.editor.end_date')}
                          isActive={pageActiveField === 'endDate'}
                          valueTone={pageFieldErrors.end_date ? 'error' : 'default'}
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
                                pageFieldErrors.end_date ? 'text-destructive' : '',
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
                      isActive={pageActiveField === 'status'}
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
            {isActive && noteSuggestionsVisible && noteSuggestionsTop !== null ? (
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
                      <Text variant="body" numberOfLines={1} style={{ color: themeColors.text }}>
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
    );
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
            className="px-5 pb-2 flex-row items-center"
            style={{ paddingTop: topInset + (windowHeight < 700 ? 8 : 16) }}
            onStartShouldSetResponder={shouldHandleBackgroundPress}
            onResponderRelease={clearActiveField}
          >
            {/* Left slot: back button, plus the title when not in tab mode.
                Equal flex with the right slot keeps the centered tabs truly
                centered regardless of how wide the actions are. */}
            <View className="flex-1 flex-row items-center gap-3">
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
              {!useTypeTabs ? (
                <View>
                  <Text variant="subheading">{title}</Text>
                  {showSubtitle ? (
                    <Text variant="caption" tone="muted">
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>

            {useTypeTabs ? (
              <View className="flex-row items-center justify-center gap-4">
                {availableTypeCards.map((item) => {
                  const active = type === item.value;
                  return (
                    <Pressable
                      key={item.value}
                      onPress={() => handleTypeChange(item.value)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      className="relative pb-1"
                    >
                      <View className="flex-row items-center gap-1">
                        <TransactionTypeGlyph
                          type={item.value}
                          size={13}
                          color={active ? typeTint(item.value) : themeColors.textMuted}
                        />
                        <Text
                          variant="caption"
                          className={cn(
                            'font-semibold',
                            active ? 'text-foreground' : 'text-muted-foreground',
                          )}
                        >
                          {item.label}
                        </Text>
                      </View>
                      <View
                        className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                        style={{ backgroundColor: active ? typeTint(item.value) : 'transparent' }}
                      />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {/* Right slot: in sticky mode the save action lives below the numpad,
                so here we keep only Delete (edit) and the recurring Save. */}
            <View className="flex-1 flex-row items-center justify-end gap-2">
              {mode === 'edit' && onDelete ? (
                // Match the back button exactly (size + secondary circle) so the
                // header reads symmetric — back left / delete right — with the
                // centered tabs between. The coral glyph keeps the delete intent.
                <Pressable
                  onPress={onDelete}
                  accessibilityRole="button"
                  accessibilityLabel={deleteLabel}
                  className="h-8 w-8 items-center justify-center rounded-full bg-secondary"
                >
                  <Trash2 size={14} color={themeColors.coral} />
                </Pressable>
              ) : null}
              {!useStickyNumpad ? (
                <Button size="sm" haptic="none" onPress={() => handleSubmit()}>
                  <Text>{submitLabel}</Text>
                </Button>
              ) : null}
            </View>
          </View>

          {showTypeSelector && !useTypeTabs ? (
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

          {useTypeTabs ? (
            <View style={summaryContainerStyle}>
              <PagerView
                ref={pagerRef}
                style={styles.pager}
                initialPage={initialTypeIndexRef.current}
                onPageSelected={handlePagerSelected}
              >
                {availableTypeCards.map((card) => (
                  <View key={card.value} style={styles.pager}>
                    {renderFields(card.value, card.value === type)}
                  </View>
                ))}
              </PagerView>
            </View>
          ) : (
            <View style={summaryContainerStyle}>{renderFields(type, true)}</View>
          )}

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
      {useStickyNumpad ? (
        <NumpadDrawer
          expanded={numpadExpanded}
          onExpandedChange={setNumpadExpanded}
          headerHeight={numpadHeaderHeight}
          numpadHeight={numpadBodyHeight}
          footerHeight={numpadFooterHeight}
          resetNonce={bulkEntryNonce}
          initialExpression={amount}
          onValueChange={handleAmountValueChange}
          onConfirm={handleAmountConfirm}
          onDatePress={() => activateField('date')}
          dateLabel={formatDateDisplay(date, activeLocale)}
          header={
            showNumpadToolbar ? (
              <View
                className="flex-row items-center gap-2 px-4"
                style={{ height: numpadHeaderHeight }}
              >
                {showSplitButton ? (
                  <Pressable
                    onPress={handleOpenSplitBill}
                    disabled={!canOpenSplitBill}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('transactions.editor.split.button_label')}
                    className={cn(
                      'h-9 flex-row items-center gap-1.5 rounded-full border px-3 active:opacity-70',
                      splitMode && splits.some((s) => !s.isSelf)
                        ? 'bg-primary/15 border-primary/40'
                        : 'bg-secondary/60 border-border/30',
                    )}
                    style={{ opacity: canOpenSplitBill ? 1 : 0.4 }}
                  >
                    <Text className="text-[14px]">🤝</Text>
                    <Text variant="caption" numberOfLines={1}>
                      {I18n.t('transactions.editor.split.button_short')}
                    </Text>
                    {splitBillsUnpaidCount > 0 ? (
                      <View className="h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1">
                        <Text className="text-white text-[10px] font-bold leading-[13px]">
                          {splitBillsUnpaidCount}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                ) : null}
                {showCurrencyButton ? (
                  <Pressable
                    onPress={() => {
                      void triggerHaptic('selection');
                      setCurrencyPickerVisible(true);
                    }}
                    accessibilityRole="button"
                    className="h-9 flex-row items-center gap-1.5 rounded-full border border-border/30 bg-secondary/60 px-3 active:opacity-70"
                  >
                    <Coins size={14} color={themeColors.textMuted} />
                    <Text variant="caption">{entryCurrency}</Text>
                    <ChevronDown size={12} color={themeColors.textMuted} />
                  </Pressable>
                ) : null}
                {showSentimentButton ? (
                  <Pressable
                    onPress={cycleSentiment}
                    accessibilityRole="button"
                    accessibilityLabel={I18n.t('transactions.editor.expense_sentiment')}
                    className="h-9 w-9 items-center justify-center rounded-full border border-border/30 bg-secondary/60 active:opacity-70"
                  >
                    <SentimentIcon sentiment={sentiment} size={22} />
                  </Pressable>
                ) : null}
                {showReceiptButton ? (
                  <>
                    <View className="flex-1" />
                    <Pressable
                      onPress={handleAddReceipt}
                      accessibilityRole="button"
                      accessibilityLabel={I18n.t('transactions.editor.receipt.label')}
                      className={cn(
                        'h-9 w-9 items-center justify-center rounded-full border active:opacity-70',
                        receiptUri
                          ? 'border-primary/40 bg-primary/15'
                          : 'border-border/30 bg-secondary/60',
                      )}
                    >
                      <Camera
                        size={16}
                        color={receiptUri ? themeColors.primary : themeColors.textMuted}
                      />
                    </Pressable>
                  </>
                ) : null}
              </View>
            ) : null
          }
          footer={
            <View
              className="flex-row gap-2.5 px-4 pt-2"
              style={{ paddingBottom: numpadFooterBottomPad }}
            >
              <Pressable
                onPress={() => handleSubmit(false)}
                accessibilityRole="button"
                className="h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl bg-primary active:opacity-90"
              >
                <Text variant="bodyStrong" className="text-primary-foreground">
                  {saveLabel}
                </Text>
              </Pressable>
              {showBulkToggle ? (
                <Pressable
                  onPress={() => handleSubmit(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`${saveLabel} · ${I18n.t('transactions.editor.bulk_mode')}`}
                  className="h-12 flex-1 flex-row items-center justify-center gap-1.5 rounded-2xl border border-primary/50 bg-primary/12 active:opacity-80"
                >
                  <Layers size={16} color={themeColors.primary} />
                  <Text variant="bodyStrong" className="text-primary">
                    {saveLabel}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          }
        />
      ) : null}
      {isTransferType && selectedFromAccount && selectedToAccount ? (
        <TransferFxModal
          visible={transferFxModalVisible}
          fromCurrency={selectedFromAccount.currency}
          toCurrency={selectedToAccount.currency}
          fromAmount={Number(amount) || 0}
          rateTable={rateTable}
          toAmount={transferToAmount}
          onClose={() => setTransferFxModalVisible(false)}
          onApply={setTransferToAmount}
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
      <CurrencyPickerSheet
        visible={currencyPickerVisible}
        onClose={() => setCurrencyPickerVisible(false)}
        selectedCode={entryCurrency}
        restrictToCodes={enabledCurrencies}
        title={I18n.t('transactions.editor.amount')}
        onSelect={(code) => {
          void triggerHaptic('selection');
          setEntryCurrency(code);
          setCurrencyPickerVisible(false);
        }}
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
      {toast ? (
        <Animated.View
          entering={FadeIn.duration(140)}
          exiting={FadeOut.duration(160)}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 20,
            right: 20,
            top: topInset + 56,
            alignItems: 'center',
            zIndex: 50,
          }}
        >
          <View className="max-w-full rounded-2xl bg-destructive px-4 py-2.5 shadow-lg">
            <Text variant="bodyStrong" numberOfLines={2} className="text-center text-white">
              {toast}
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  );
}
