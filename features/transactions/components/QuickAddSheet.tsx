import { useFocusEffect } from '@react-navigation/native';
import { Calendar, Check, ChevronDown, History, Maximize2, Settings2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { DatePickerModal } from '~/components/datePicker';
import {
  AccountLogo,
  AccountPickerSheet,
  CategoryEmoji,
  type CategoryPickerOption,
  CategoryPickerSheet,
  CurrencyPickerSheet,
  Text,
} from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import {
  type CreateTransactionInput,
  getDistinctNotesSuggestions,
  getLatestTransactionFieldsByNote,
} from '~/lib/repositories/transactionsRepository';
import { triggerHaptic } from '~/services/haptics';
import type {
  Account,
  AccountGroup,
  Category,
  QuickEntryPrefs,
  RateTable,
  Transaction,
  TransactionType,
  UserSettings,
} from '~/types';
import { resolveCategoryIcon } from '~/utils/categoryIcons';
import { convert, currencySymbolForCode, resolvePinnedCurrency } from '~/utils/currency';
import { FONT } from '~/utils/fonts';
import {
  amountToHoursByRate,
  dayKeyFromDateLocal,
  formatHours,
  normalizeMoneyAmount,
} from '~/utils/formatters';

import { findFallbackCategory, pickDefaultAccountId } from '../lib/entryDefaults';
import { matchCategoryByKeywords } from '../utils/categoryKeywords';
import { categorizeFromHistory } from '../utils/historyCategorizer';
import { parseQuickInput, replaceNoteInQuickInput } from '../utils/parseQuickInput';

interface QuickAddSheetProps {
  settings: UserSettings;
  accounts: Account[];
  accountGroups: AccountGroup[];
  categories: Category[];
  transactions: Transaction[];
  isSimpleMode: boolean;
  simpleWalletId: string | null;
  initialAccountId?: string;
  initialType?: TransactionType;
  initialDate?: string;
  initialAmount?: string;
  initialNote?: string;
  initialCategoryId?: string | null;
  trueHourlyRate: number;
  quickEntryPrefs: QuickEntryPrefs;
  /** Currencies the amount can be entered in (main + sub + account currencies). */
  enabledCurrencies?: string[];
  /** Rate table for converting a foreign entry to the reporting currency. */
  rateTable?: RateTable;
  /** Persist the chosen quick-entry currency so it carries to the next open. */
  onChangeEntryCurrency?: (code: string) => void;
  onClose: () => void;
  onSubmit: (input: CreateTransactionInput) => void;
  onExpandToDetailed?: (values: ExpandToDetailedValues) => void;
  onOpenQuickEntrySettings?: () => void;
}

export interface ExpandToDetailedValues {
  type: TransactionType;
  amount: string;
  date: string;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  note: string;
}

type SheetType = Extract<TransactionType, 'expense' | 'income'>;

const SHEET_TYPES: SheetType[] = ['expense', 'income'];

const SLIDE_DURATION = 240;
const BACKDROP_DURATION = 220;
// Faster close used when submitting — gives instant feedback after pressing send.
const SUBMIT_CLOSE_DURATION = 140;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropFill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  kav: {
    width: '100%',
  },
  cardWrap: {
    paddingHorizontal: 12,
  },
  card: {
    width: '100%',
    borderRadius: 24,
    overflow: 'hidden',
  },
  voiceBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 8,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
  },
  voiceBannerIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceBannerText: {
    flex: 1,
    gap: 1,
  },
  voiceBannerTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  voiceBannerBody: {
    fontSize: 11,
    lineHeight: 14,
  },
  voiceBannerCta: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  voiceBannerCtaLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  voiceBannerClose: {
    padding: 4,
    marginLeft: -2,
  },
  primaryInput: {
    fontSize: 14,
    lineHeight: 20,
    minHeight: 60,
    maxHeight: 80,
    // Zero ALL padding (not just vertical). Android's native TextInput adds
    // default horizontal padding, which pushed the caret and typed text to the
    // right of the placeholder <Text> overlay (which has none) — the caret
    // looked misaligned with the placeholder. padding:0 lines them up.
    padding: 0,
    textAlignVertical: 'top',
    // Match the placeholder overlay exactly so the caret and typed text sit on
    // the same baseline as the placeholder. Without an explicit fontFamily the
    // input falls back to the system font (Roboto) while the placeholder uses
    // Work Sans on Android, and includeFontPadding adds extra top padding to
    // the input but not the <Text> overlay — together that left the blinking
    // caret visibly offset from the placeholder.
    fontFamily: FONT.regular,
    includeFontPadding: false,
  },
  inputColumn: {
    position: 'relative',
    minHeight: 60,
  },
  placeholderOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  placeholderLine: {
    fontSize: 14,
    lineHeight: 20,
    includeFontPadding: false,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    marginTop: 10,
    columnGap: 6,
    minHeight: 22,
  },
  summarySegment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 18,
  },
  summarySegmentFlexible: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 18,
    flexShrink: 1,
    minWidth: 0,
  },
  summaryIcon: {
    fontSize: 13,
    lineHeight: 18,
    width: 16,
    textAlign: 'center',
  },
  summaryText: {
    fontSize: 12,
    lineHeight: 18,
  },
  summaryTextFlexible: {
    flexShrink: 1,
  },
  summarySep: {
    fontSize: 11,
    color: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 2,
  },
  timeSentence: {
    fontSize: 10.5,
    fontStyle: 'italic',
    flexShrink: 1,
  },
  suggestionInline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 20,
  },
  amountSentenceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  reportingEquiv: {
    fontSize: 12,
    lineHeight: 18,
    flexShrink: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTypePill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  headerTypeLabel: {
    fontSize: 14,
    letterSpacing: 0.1,
  },
  headerIconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
  },
  headerCurrencyButton: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
  },
  headerCurrencyLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  submitButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  suggestionStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 8,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    height: 20,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 180,
  },
  suggestionChipText: {
    fontSize: 11,
    lineHeight: 14,
  },
});

const HEADER_EXPENSE_COLOR = '#E25A6A';
const HEADER_INCOME_COLOR = '#16A34A';

function selectedTypeColor(option: SheetType): string {
  return option === 'expense' ? HEADER_EXPENSE_COLOR : HEADER_INCOME_COLOR;
}

function formatMoneyOnly(amount: number, currencySymbol: string): string {
  const normalized = normalizeMoneyAmount(Math.abs(amount));
  return `${currencySymbol}${normalized.toFixed(2)}`;
}

function formatTimeEquivalent(amount: number, trueHourlyRate: number): string | null {
  if (trueHourlyRate <= 0) return null;
  const normalized = normalizeMoneyAmount(Math.abs(amount));
  return formatHours(amountToHoursByRate(normalized, trueHourlyRate));
}

function formatDateChipLabel(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return String(Number(match[3]));
}

function lastUsedAccountId(transactions: Transaction[]): string | null {
  for (const txn of transactions) {
    if (txn.type === 'expense' || txn.type === 'income') {
      if (txn.accountId) return txn.accountId;
    } else if (txn.type === 'transfer') {
      if (txn.fromAccountId) return txn.fromAccountId;
    }
  }
  return null;
}

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

export function QuickAddSheet({
  settings,
  accounts,
  accountGroups,
  categories,
  transactions,
  isSimpleMode,
  simpleWalletId,
  initialAccountId,
  initialType,
  initialDate,
  initialAmount,
  initialNote,
  initialCategoryId,
  trueHourlyRate,
  quickEntryPrefs,
  enabledCurrencies,
  rateTable,
  onChangeEntryCurrency,
  onClose,
  onSubmit,
  onExpandToDetailed,
  onOpenQuickEntrySettings,
}: QuickAddSheetProps) {
  const themeColors = useThemeColors();
  const inputRef = useRef<TextInput | null>(null);

  const defaultType: SheetType = useMemo(() => {
    if (initialType === 'income') return 'income';
    return 'expense';
  }, [initialType]);

  const seedText = useMemo(() => {
    const amountPart = initialAmount?.trim() ?? '';
    const notePart = initialNote?.trim() ?? '';
    if (amountPart && notePart) return `${amountPart} ${notePart}`;
    return amountPart || notePart;
  }, [initialAmount, initialNote]);

  const [type, setType] = useState<SheetType>(defaultType);
  const [text, setText] = useState(seedText);
  const [settledText, setSettledText] = useState(seedText);
  const [date, setDate] = useState<string>(initialDate ?? dayKeyFromDateLocal(new Date()));
  const [manualCategoryByType, setManualCategoryByType] = useState<
    Partial<Record<SheetType, string | null>>
  >(() => (initialCategoryId ? { [defaultType]: initialCategoryId } : {}));

  const defaultAccountId = useMemo(() => {
    if (isSimpleMode && simpleWalletId) return simpleWalletId;
    // Priority: caller-supplied initial > user's saved default > last-used > first by sort order.
    if (initialAccountId && accounts.some((a) => a.id === initialAccountId)) {
      return initialAccountId;
    }
    if (
      quickEntryPrefs.defaultAccountId &&
      accounts.some((a) => a.id === quickEntryPrefs.defaultAccountId)
    ) {
      return quickEntryPrefs.defaultAccountId;
    }
    const lastUsed = lastUsedAccountId(transactions);
    return pickDefaultAccountId(accounts, lastUsed);
  }, [
    accounts,
    initialAccountId,
    isSimpleMode,
    quickEntryPrefs.defaultAccountId,
    simpleWalletId,
    transactions,
  ]);

  const [accountId, setAccountId] = useState<string | null>(defaultAccountId);

  useEffect(() => {
    if (accountId === null && defaultAccountId !== null) {
      setAccountId(defaultAccountId);
    }
  }, [accountId, defaultAccountId]);

  const [activePicker, setActivePicker] = useState<'date' | 'category' | 'account' | null>(null);
  const [noteSuggestions, setNoteSuggestions] = useState<string[]>([]);
  const suggestionsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualNoteAnchorRef = useRef<string | null>(null);

  const slide = useSharedValue(60);
  const backdropOpacity = useSharedValue(0);
  const [renderSheet, setRenderSheet] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    slide.value = withTiming(0, { duration: SLIDE_DURATION, easing: Easing.out(Easing.cubic) });
    backdropOpacity.value = withTiming(1, { duration: BACKDROP_DURATION });
  }, [backdropOpacity, slide]);

  useEffect(() => {
    const focusInput = () => inputRef.current?.focus();
    focusInput();
    const t1 = setTimeout(focusInput, 60);
    const t2 = setTimeout(focusInput, 180);
    const t3 = setTimeout(focusInput, 360);
    const t4 = setTimeout(focusInput, 600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  // When the user returns from a pushed screen (e.g. Quick Entry Settings),
  // re-arm the sheet. `closingRef` is set when the settings button is tapped
  // to guard against double-taps during navigation, and the keyboard is
  // dismissed — both must be reset on focus return or the sheet stays inert.
  useFocusEffect(
    useCallback(() => {
      // Skip re-arming when a close animation is already in flight —
      // `closeTimerRef` is set the moment closeWithAnimation runs and only
      // cleared after onClose fires. A transient focus loss/regain during
      // that window would otherwise clear closingRef while the unmount
      // timer is still pending, exposing the sheet to a double-submit.
      if (closeTimerRef.current !== null) return;
      closingRef.current = false;
      setIsClosing(false);
      const focusInput = () => inputRef.current?.focus();
      focusInput();
      const t1 = setTimeout(focusInput, 80);
      const t2 = setTimeout(focusInput, 240);
      const t3 = setTimeout(focusInput, 480);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }, []),
  );

  useEffect(() => {
    const timer = setTimeout(() => setSettledText(text), 400);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(
    () => () => {
      if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current);
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const closeWithAnimation = useCallback(
    (fast = false) => {
      if (closingRef.current) return;
      closingRef.current = true;
      setIsClosing(true);
      Keyboard.dismiss();
      const slideDuration = fast ? SUBMIT_CLOSE_DURATION : SLIDE_DURATION;
      const backdropDuration = fast ? SUBMIT_CLOSE_DURATION : BACKDROP_DURATION;
      backdropOpacity.value = withTiming(0, { duration: backdropDuration });
      slide.value = withTiming(80, {
        duration: slideDuration,
        easing: Easing.in(Easing.cubic),
      });
      // Schedule unmount/onClose on the JS thread directly instead of waiting
      // for the worklet completion callback to bridge back via runOnJS. The
      // worklet's runOnJS hop can be queued behind a busy JS thread (e.g. the
      // optimistic transaction insert re-rendering screens behind us), making
      // the close feel sticky. A plain setTimeout fires on the same JS timer
      // queue as everything else and is more predictable. The timer ref is
      // cleared in the cleanup effect so it never fires after unmount.
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        setRenderSheet(false);
        onClose();
      }, slideDuration);
    },
    [backdropOpacity, slide, onClose],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: slide.value * 6 }],
    opacity: slide.value > 60 ? 0.2 : 1,
  }));
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));
  // Lift the sheet by the keyboard height directly. Using KeyboardAvoidingView
  // here races on first open: its padding depends on the view's measured
  // onLayout, which on Android lands after autoFocus has already triggered the
  // keyboard — so the first show computes padding against a zero frame and the
  // keyboard covers the sheet.
  const keyboard = useReanimatedKeyboardAnimation();
  const keyboardAvoidStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: keyboard.height.value }],
  }));

  const parsedLive = useMemo(() => parseQuickInput(text), [text]);
  const parsedSettled = useMemo(() => parseQuickInput(settledText), [settledText]);

  // Clear manual category override once the user types over the description
  // anchored when they last picked a category.
  useEffect(() => {
    const anchor = manualNoteAnchorRef.current;
    if (anchor === null) return;
    if (parsedLive.note.trim() !== anchor) {
      manualNoteAnchorRef.current = null;
      setManualCategoryByType((prev) => {
        if (prev[type] == null) return prev;
        return { ...prev, [type]: null };
      });
    }
  }, [parsedLive.note, type]);

  useEffect(() => {
    const prefix = parsedLive.note.trim();
    if (suggestionsTimerRef.current) clearTimeout(suggestionsTimerRef.current);
    if (prefix.length < 2) {
      setNoteSuggestions([]);
      return;
    }
    suggestionsTimerRef.current = setTimeout(() => {
      try {
        const next = getDistinctNotesSuggestions(prefix).filter(
          (note) => note.toLowerCase() !== prefix.toLowerCase(),
        );
        setNoteSuggestions(next);
      } catch {
        setNoteSuggestions([]);
      }
    }, 150);
  }, [parsedLive.note]);

  const candidateCategories = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type],
  );
  const categoryPickerOptions = useMemo(
    () => buildCategoryPickerOptions(candidateCategories),
    [candidateCategories],
  );

  const userDefaultCategoryId =
    type === 'expense'
      ? quickEntryPrefs.defaultExpenseCategoryId
      : quickEntryPrefs.defaultIncomeCategoryId;

  const fallbackCategory = useMemo(() => {
    if (userDefaultCategoryId) {
      const match = candidateCategories.find((c) => c.id === userDefaultCategoryId);
      if (match) return match;
    }
    return findFallbackCategory(categories, type);
  }, [candidateCategories, categories, type, userDefaultCategoryId]);

  const historyInference = useMemo(() => {
    // Skip the O(n) categorizer while closing — the optimistic transaction
    // insert in createTransaction triggers a re-render here (transactions prop
    // changes) mid close, and we don't need a fresh inference at that point.
    if (isClosing) return null;
    const note = parsedSettled.note.trim();
    if (!note) return null;
    return categorizeFromHistory(note, transactions, { type });
  }, [isClosing, parsedSettled.note, transactions, type]);

  const inferredCategoryId = useMemo(() => {
    // History match wins when available — it's the most personalized signal.
    // It's gated on the *settled* note (debounced) because the underlying
    // O(n) transaction scan is expensive.
    if (historyInference) {
      const exists = candidateCategories.find((c) => c.id === historyInference.categoryId);
      if (exists) return exists.id;
    }
    // Keyword match runs on the *live* note — the compiled-regex cache makes
    // each match sub-millisecond, so there's no debounce reason to wait. This
    // is what eliminates the "Other → Transport" flash when typing "uber 30":
    // by the time the live keystroke renders, the keyword match has already
    // resolved the right bucket.
    const liveNote = parsedLive.note.trim();
    if (!liveNote) return null;
    const keywordMatch = matchCategoryByKeywords(
      liveNote,
      candidateCategories,
      quickEntryPrefs.categoryMap,
    );
    if (keywordMatch) return keywordMatch.categoryId;
    return null;
  }, [candidateCategories, historyInference, parsedLive.note, quickEntryPrefs.categoryMap]);

  const inferredAccountId = useMemo(() => {
    if (!historyInference?.accountId) return null;
    return accounts.some((a) => a.id === historyInference.accountId)
      ? historyInference.accountId
      : null;
  }, [accounts, historyInference]);

  const effectiveAccountId = accountId ?? inferredAccountId ?? defaultAccountId;

  const manualCategoryId = manualCategoryByType[type] ?? null;
  const activeCategoryId = manualCategoryId ?? inferredCategoryId ?? fallbackCategory?.id ?? null;
  const activeCategory = useMemo(
    () => categories.find((category) => category.id === activeCategoryId) ?? null,
    [activeCategoryId, categories],
  );
  const activeCategoryParent = useMemo(
    () =>
      activeCategory?.parentId
        ? (categories.find((category) => category.id === activeCategory.parentId) ?? null)
        : null,
    [activeCategory, categories],
  );
  const activeCategoryIcon = resolveCategoryIcon(
    activeCategory?.icon,
    activeCategoryParent?.icon,
    'price-tag',
  );
  const activeCategoryLabel = activeCategory
    ? activeCategoryParent
      ? `${activeCategoryParent.name} • ${activeCategory.name}`
      : activeCategory.name
    : I18n.t('transactions.editor.category');

  const accountsById = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((account) => map.set(account.id, account));
    return map;
  }, [accounts]);

  const selectedAccount = accountsById.get(effectiveAccountId ?? '') ?? null;

  // The amount is recorded in the native currency of the account it lands in
  // (the simple wallet in simple mode) unless the user has pinned a quick-entry
  // currency — that pinned choice wins so foreign-currency entries persist
  // across opens. createTransaction freezes the account-currency equivalent.
  const entryAccount = isSimpleMode
    ? (accountsById.get(simpleWalletId ?? '') ?? null)
    : selectedAccount;
  const accountCurrency = entryAccount?.currency ?? settings.currencyCode;
  const currencyChoices = useMemo(
    () =>
      enabledCurrencies && enabledCurrencies.length > 0 ? enabledCurrencies : [accountCurrency],
    [enabledCurrencies, accountCurrency],
  );
  const pinnedCurrency = resolvePinnedCurrency(quickEntryPrefs.defaultCurrency, currencyChoices);
  const entryCurrency = pinnedCurrency ?? accountCurrency;
  const entryCurrencySymbol = currencySymbolForCode(entryCurrency);
  const canPickCurrency = !!onChangeEntryCurrency && currencyChoices.length > 1;
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  const submitDisabled = useMemo(() => {
    if (!parsedLive.amount || parsedLive.amount <= 0) return true;
    if (isSimpleMode) return !simpleWalletId;
    return !effectiveAccountId;
  }, [effectiveAccountId, isSimpleMode, parsedLive.amount, simpleWalletId]);

  const handleSubmit = useCallback(() => {
    if (submitDisabled || !parsedLive.amount) return;
    // Guard against racing close paths — if the sheet is already exiting
    // (expand/settings button just navigated away), don't fire another submit
    // and create a phantom transaction during the unmount.
    if (closingRef.current) return;
    void triggerHaptic('success');

    const noteTrimmed = parsedLive.note.trim();
    const fallbackNote = activeCategory?.name?.trim() ?? null;
    const submission: CreateTransactionInput = {
      type,
      amount: parsedLive.amount,
      currency: entryCurrency,
      date,
      note: noteTrimmed.length > 0 ? noteTrimmed : fallbackNote,
      sentiment: 'neutral',
      accountId: isSimpleMode ? simpleWalletId : effectiveAccountId,
      categoryId: activeCategoryId,
    };
    // Start the close animation IMMEDIATELY so the user gets instant feedback.
    // Defer the (potentially heavy) onSubmit to the next macrotask so it runs
    // alongside the close animation, not blocking either the animation kickoff
    // or the keyboard's "send" dismissal.
    closeWithAnimation(true);
    setTimeout(() => onSubmit(submission), 0);
  }, [
    effectiveAccountId,
    activeCategory,
    activeCategoryId,
    closeWithAnimation,
    date,
    isSimpleMode,
    onSubmit,
    parsedLive.amount,
    parsedLive.note,
    entryCurrency,
    simpleWalletId,
    submitDisabled,
    type,
  ]);

  const handleTypeChange = useCallback(
    (next: SheetType) => {
      if (next === type) return;
      void triggerHaptic('selection');
      setType(next);
    },
    [type],
  );

  const handleSuggestionPress = useCallback(
    (suggestion: string) => {
      void triggerHaptic('selection');
      const nextText = replaceNoteInQuickInput(text, suggestion);
      setText(nextText);
      setSettledText(nextText);
      setNoteSuggestions([]);
      let fields: ReturnType<typeof getLatestTransactionFieldsByNote> = null;
      try {
        fields = getLatestTransactionFieldsByNote(suggestion);
      } catch {
        fields = null;
      }
      if (fields) {
        if (fields.categoryId) {
          manualNoteAnchorRef.current = suggestion.trim();
          setManualCategoryByType((prev) => ({ ...prev, [type]: fields!.categoryId }));
        }
        if (fields.accountId) {
          setAccountId(fields.accountId);
        }
      }
    },
    [text, type],
  );

  const refocusInput = useCallback(() => {
    const focus = () => inputRef.current?.focus();
    setTimeout(focus, 80);
    setTimeout(focus, 250);
    setTimeout(focus, 500);
  }, []);

  const openPicker = useCallback((which: 'date' | 'category' | 'account') => {
    void triggerHaptic('selection');
    Keyboard.dismiss();
    setActivePicker(which);
  }, []);

  const closePicker = useCallback(() => {
    setActivePicker(null);
    refocusInput();
  }, [refocusInput]);

  const handleCategorySelect = useCallback(
    (id: string) => {
      manualNoteAnchorRef.current = parseQuickInput(text).note.trim();
      setManualCategoryByType((prev) => ({ ...prev, [type]: id }));
      closePicker();
    },
    [closePicker, text, type],
  );

  const handleDateSelect = useCallback(
    (next: string) => {
      setDate(next);
      closePicker();
    },
    [closePicker],
  );

  const handleAccountSelect = useCallback(
    (id: string) => {
      setAccountId(id);
      closePicker();
    },
    [closePicker],
  );

  const inputAccentColor = type === 'expense' ? themeColors.error : themeColors.success;

  const handleExpand = useCallback(() => {
    if (!onExpandToDetailed) return;
    void triggerHaptic('selection');
    if (closingRef.current) return;
    closingRef.current = true;
    Keyboard.dismiss();
    const values: ExpandToDetailedValues = {
      type,
      amount: parsedLive.amount && parsedLive.amount > 0 ? parsedLive.amount.toString() : '',
      date,
      accountId: effectiveAccountId,
      fromAccountId: null,
      toAccountId: null,
      // Only carry a category the user explicitly picked — don't auto-select
      // the inferred/default one, so the full editor opens like the + FAB.
      categoryId: manualCategoryId ?? null,
      note: parsedLive.note.trim(),
    };
    onExpandToDetailed(values);
  }, [
    effectiveAccountId,
    manualCategoryId,
    date,
    onExpandToDetailed,
    parsedLive.amount,
    parsedLive.note,
    type,
  ]);

  const handleOpenCurrencyPicker = useCallback(() => {
    void triggerHaptic('selection');
    Keyboard.dismiss();
    setShowCurrencyPicker(true);
  }, []);

  const handleSelectCurrency = useCallback(
    (code: string) => {
      setShowCurrencyPicker(false);
      onChangeEntryCurrency?.(code);
      refocusInput();
    },
    [onChangeEntryCurrency, refocusInput],
  );

  const handleOpenSettings = useCallback(() => {
    if (!onOpenQuickEntrySettings) return;
    void triggerHaptic('selection');
    if (closingRef.current) return;
    closingRef.current = true;
    Keyboard.dismiss();
    onOpenQuickEntrySettings();
  }, [onOpenQuickEntrySettings]);

  if (!renderSheet) return null;

  const showAmountChip = parsedLive.amount !== null && parsedLive.amount > 0;
  const displayAmount = parsedLive.amount ?? 0;
  // For a foreign entry currency the worktime estimate would be meaningless
  // (the hourly rate is in the reporting currency), so we mirror the full
  // editor: hide the time sentence and show the reporting-currency equivalent.
  const isForeignEntry = entryCurrency !== settings.currencyCode;
  const reportingEquivLabel =
    isForeignEntry && rateTable
      ? `≈ ${formatMoneyOnly(
          convert(displayAmount, entryCurrency, settings.currencyCode, rateTable).value,
          currencySymbolForCode(settings.currencyCode),
        )}`
      : null;
  const timeEquivalent = isForeignEntry
    ? null
    : formatTimeEquivalent(displayAmount, trueHourlyRate);
  const cardBottomMargin = 10;

  return (
    <View style={styles.root}>
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.backdropFill, backdropAnimatedStyle]}
        pointerEvents="none"
      />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => closeWithAnimation()}
        accessibilityLabel={I18n.t('common.close')}
      />

      <Animated.View style={[styles.kav, keyboardAvoidStyle]} pointerEvents="box-none">
        <Animated.View
          style={[styles.cardWrap, { paddingBottom: cardBottomMargin }, sheetAnimatedStyle]}
        >
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {SHEET_TYPES.map((option) => {
                const selected = type === option;
                const labelKey =
                  option === 'expense'
                    ? 'transactions.filters.spent'
                    : 'transactions.filters.earned';
                const tint = selectedTypeColor(option);
                return (
                  <Pressable
                    key={option}
                    onPress={() => handleTypeChange(option)}
                    hitSlop={6}
                    style={[
                      styles.headerTypePill,
                      {
                        backgroundColor: themeColors.card,
                        borderColor: selected ? tint : `${themeColors.border}`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.headerTypeLabel,
                        {
                          color: selected ? tint : themeColors.text,
                          fontWeight: selected ? '700' : '500',
                        },
                      ]}
                    >
                      {I18n.t(labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.headerRight}>
              {canPickCurrency ? (
                <Pressable
                  onPress={handleOpenCurrencyPicker}
                  accessibilityLabel={I18n.t('accounts.currency')}
                  hitSlop={6}
                  style={[
                    styles.headerCurrencyButton,
                    {
                      backgroundColor: themeColors.card,
                      borderColor: themeColors.border,
                    },
                  ]}
                >
                  <Text style={[styles.headerCurrencyLabel, { color: themeColors.text }]}>
                    {entryCurrency}
                  </Text>
                  <ChevronDown size={12} color={themeColors.textSoft} />
                </Pressable>
              ) : null}
              {onOpenQuickEntrySettings ? (
                <Pressable
                  onPress={handleOpenSettings}
                  accessibilityLabel={I18n.t('settings.quick_entry.title')}
                  hitSlop={6}
                  style={[
                    styles.headerIconButton,
                    {
                      backgroundColor: themeColors.card,
                      borderColor: themeColors.border,
                    },
                  ]}
                >
                  <Settings2 size={14} color={themeColors.textSoft} />
                </Pressable>
              ) : null}
              {onExpandToDetailed ? (
                <Pressable
                  onPress={handleExpand}
                  accessibilityLabel={I18n.t('transactions.quick_add.expand')}
                  hitSlop={6}
                  style={[
                    styles.headerIconButton,
                    {
                      backgroundColor: themeColors.card,
                      borderColor: themeColors.border,
                    },
                  ]}
                >
                  <Maximize2 size={14} color={themeColors.textSoft} />
                </Pressable>
              ) : null}
            </View>
          </View>
          <View style={styles.card} className="bg-card">
            <View className="px-4 pt-5 pb-4">
              <View className="flex-row items-stretch gap-3">
                <View
                  className="w-1.5 rounded-full"
                  style={{ backgroundColor: inputAccentColor }}
                />
                <View className="flex-1" style={styles.inputColumn}>
                  {text.length === 0 ? (
                    <View style={styles.placeholderOverlay} pointerEvents="none">
                      <Text style={[styles.placeholderLine, { color: themeColors.textMuted }]}>
                        {I18n.t(
                          type === 'income'
                            ? 'transactions.quick_add.placeholder_income'
                            : 'transactions.quick_add.placeholder_expense',
                        )}
                      </Text>
                    </View>
                  ) : null}
                  <TextInput
                    ref={inputRef}
                    value={text}
                    onChangeText={setText}
                    autoFocus
                    autoCorrect={false}
                    autoCapitalize="none"
                    multiline
                    numberOfLines={3}
                    blurOnSubmit
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                    style={[styles.primaryInput, { color: themeColors.text }]}
                  />
                  {noteSuggestions.length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.suggestionStrip}
                      style={styles.suggestionInline}
                    >
                      {noteSuggestions.map((suggestion) => (
                        <Pressable
                          key={suggestion}
                          onPress={() => handleSuggestionPress(suggestion)}
                          style={[
                            styles.suggestionChip,
                            {
                              backgroundColor: `${themeColors.primary}0F`,
                              borderColor: `${themeColors.primary}33`,
                            },
                          ]}
                          hitSlop={4}
                        >
                          <History size={10} color={themeColors.primary} />
                          <Text
                            style={[styles.suggestionChipText, { color: themeColors.text }]}
                            numberOfLines={1}
                          >
                            {suggestion}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
                <Pressable
                  onPress={handleSubmit}
                  disabled={submitDisabled}
                  accessibilityLabel={I18n.t('common.save')}
                  style={[
                    styles.submitButton,
                    {
                      backgroundColor: submitDisabled
                        ? `${themeColors.textMuted}33`
                        : inputAccentColor,
                    },
                  ]}
                >
                  <Check
                    size={18}
                    strokeWidth={3}
                    color={submitDisabled ? themeColors.textMuted : '#FFFFFF'}
                  />
                </Pressable>
              </View>

              <View style={styles.summaryRow}>
                <Pressable
                  onPress={() => openPicker('date')}
                  style={styles.summarySegment}
                  hitSlop={6}
                >
                  <Calendar size={11} color={themeColors.textSoft} />
                  <Text className="text-foreground" style={styles.summaryText}>
                    {formatDateChipLabel(date)}
                  </Text>
                </Pressable>
                {isSimpleMode ? null : (
                  <>
                    <Text style={styles.summarySep}>·</Text>
                    <Pressable
                      onPress={() => openPicker('account')}
                      style={styles.summarySegmentFlexible}
                      hitSlop={6}
                    >
                      {selectedAccount ? (
                        <AccountLogo
                          logoId={selectedAccount.logoId}
                          type={selectedAccount.type}
                          goalEmoji={selectedAccount.goalEmoji}
                          size={16}
                        />
                      ) : null}
                      <Text
                        className="text-foreground"
                        style={[styles.summaryText, styles.summaryTextFlexible]}
                        numberOfLines={1}
                      >
                        {selectedAccount?.name ?? I18n.t('transactions.editor.account')}
                      </Text>
                    </Pressable>
                  </>
                )}
                {showAmountChip ? (
                  <>
                    <Text style={styles.summarySep}>·</Text>
                    <Pressable
                      onPress={() => openPicker('category')}
                      style={styles.summarySegmentFlexible}
                      hitSlop={6}
                    >
                      <CategoryEmoji
                        icon={activeCategoryIcon}
                        size={16}
                        style={styles.summaryIcon}
                      />
                      <Text
                        className="text-foreground"
                        style={[styles.summaryText, styles.summaryTextFlexible]}
                        numberOfLines={1}
                      >
                        {activeCategoryLabel}
                      </Text>
                    </Pressable>
                  </>
                ) : null}
              </View>

              <View style={styles.amountSentenceRow}>
                {timeEquivalent ? (
                  <Text
                    style={[styles.timeSentence, { color: themeColors.textSoft }]}
                    numberOfLines={1}
                  >
                    {(() => {
                      const AMOUNT_TOKEN = '__M2T_AMOUNT__';
                      const HOURS_TOKEN = '__M2T_HOURS__';
                      const template = I18n.t('transactions.quick_add.time_sentence', {
                        amount: AMOUNT_TOKEN,
                        hours: HOURS_TOKEN,
                      });
                      const accentStyle = {
                        color: inputAccentColor,
                        fontWeight: '700' as const,
                      };
                      const amountValue = formatMoneyOnly(displayAmount, entryCurrencySymbol);
                      // Defensive fallback: if the locale's template is
                      // missing one or both tokens, render the parts we
                      // know about so the user never sees the raw
                      // __M2T_*__ sentinels.
                      const hasAmount = template.includes(AMOUNT_TOKEN);
                      const hasHours = template.includes(HOURS_TOKEN);
                      if (!hasAmount || !hasHours) {
                        // Malformed locale template — render both values
                        // explicitly so neither is silently dropped,
                        // regardless of which token the template happened
                        // to include.
                        return (
                          <>
                            <Text style={accentStyle}>{amountValue}</Text>
                            {' · '}
                            <Text style={accentStyle}>{timeEquivalent}</Text>
                          </>
                        );
                      }
                      const valueByToken: Record<string, string> = {
                        [AMOUNT_TOKEN]: amountValue,
                        [HOURS_TOKEN]: timeEquivalent,
                      };
                      const tokenPattern = new RegExp(`(${AMOUNT_TOKEN}|${HOURS_TOKEN})`, 'g');
                      const parts = template.split(tokenPattern);
                      return parts.map((part, idx) =>
                        valueByToken[part] ? (
                          <Text key={idx} style={accentStyle}>
                            {valueByToken[part]}
                          </Text>
                        ) : (
                          <Text key={idx}>{part}</Text>
                        ),
                      );
                    })()}
                  </Text>
                ) : (
                  <Text style={[styles.amountValue, { color: inputAccentColor }]} numberOfLines={1}>
                    {formatMoneyOnly(displayAmount, entryCurrencySymbol)}
                  </Text>
                )}
                {reportingEquivLabel ? (
                  <Text
                    style={[styles.reportingEquiv, { color: themeColors.textSoft }]}
                    numberOfLines={1}
                  >
                    {reportingEquivLabel}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </Animated.View>
      </Animated.View>

      <CategoryPickerSheet
        visible={activePicker === 'category'}
        parents={categoryPickerOptions.parents}
        childByParent={categoryPickerOptions.childByParent}
        selectedCategoryId={activeCategoryId}
        onSelect={handleCategorySelect}
        onClose={closePicker}
        allowParentSelection
        overlay
      />

      <AccountPickerSheet
        visible={activePicker === 'account'}
        accounts={accounts}
        accountGroups={accountGroups}
        selectedAccountId={effectiveAccountId}
        onSelect={handleAccountSelect}
        onClose={closePicker}
        overlay
      />

      <DatePickerModal
        visible={activePicker === 'date'}
        value={date}
        onSelect={handleDateSelect}
        onClose={closePicker}
      />

      <CurrencyPickerSheet
        visible={showCurrencyPicker}
        onClose={() => setShowCurrencyPicker(false)}
        onSelect={handleSelectCurrency}
        selectedCode={entryCurrency}
        restrictToCodes={currencyChoices}
        title={I18n.t('accounts.currency')}
      />
    </View>
  );
}
