import { useFocusEffect } from '@react-navigation/native';
import { Calendar, Check, History, Maximize2, Mic, Settings2, X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  AccountPickerSheet,
  CategoryPickerSheet,
  type CategoryPickerOption,
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
  Transaction,
  TransactionType,
  UserSettings,
} from '~/types';
import {
  amountToHoursByRate,
  dayKeyFromDateLocal,
  formatHours,
  normalizeMoneyAmount,
} from '~/utils/formatters';

import { QuickAddDateModalPicker } from './quickAdd';
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
  onClose: () => void;
  onSubmit: (input: CreateTransactionInput) => void;
  onExpandToDetailed?: (values: ExpandToDetailedValues) => void;
  onOpenQuickEntrySettings?: () => void;
  /** Show the one-time "Try voice input" banner above the input card. */
  voicePromptVisible?: boolean;
  onEnableVoice?: () => void;
  onDismissVoicePrompt?: () => void;
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
    paddingTop: 0,
    paddingBottom: 0,
    textAlignVertical: 'top',
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
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 10,
    columnGap: 6,
    rowGap: 4,
    minHeight: 22,
  },
  summarySegment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 18,
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

function formatMoneyOnly(amount: number, settings: UserSettings): string {
  const normalized = normalizeMoneyAmount(Math.abs(amount));
  return `${settings.currencySymbol}${normalized.toFixed(2)}`;
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

function findFallbackCategory(categories: Category[], type: TransactionType): Category | null {
  if (type !== 'expense' && type !== 'income') return null;
  const sameType = categories.filter((category) => category.type === type);
  if (sameType.length === 0) return null;
  const other = sameType.find((category) => /^other/i.test(category.name));
  return other ?? sameType[sameType.length - 1] ?? null;
}

function pickDefaultAccount(
  accounts: Account[],
  preferredId: string | undefined | null,
): string | null {
  if (preferredId) {
    const exists = accounts.find((account) => account.id === preferredId);
    if (exists) return exists.id;
  }
  if (accounts.length === 0) return null;
  return [...accounts].sort(
    (a, b) => (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER),
  )[0].id;
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
  onClose,
  onSubmit,
  onExpandToDetailed,
  onOpenQuickEntrySettings,
  voicePromptVisible = false,
  onEnableVoice,
  onDismissVoicePrompt,
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
    const lastUsed = lastUsedAccountId(transactions);
    return pickDefaultAccount(accounts, initialAccountId ?? lastUsed);
  }, [accounts, initialAccountId, isSimpleMode, simpleWalletId, transactions]);

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

  const accountsById = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((account) => map.set(account.id, account));
    return map;
  }, [accounts]);

  const selectedAccount = accountsById.get(effectiveAccountId ?? '') ?? null;
  const selectedAccountName = selectedAccount?.name;

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
    const submission: CreateTransactionInput = {
      type,
      amount: parsedLive.amount,
      currency: settings.currencyCode,
      date,
      note: noteTrimmed.length > 0 ? noteTrimmed : null,
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
    activeCategoryId,
    closeWithAnimation,
    date,
    isSimpleMode,
    onSubmit,
    parsedLive.amount,
    parsedLive.note,
    settings.currencyCode,
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
      categoryId: activeCategoryId,
      note: parsedLive.note.trim(),
    };
    onExpandToDetailed(values);
  }, [
    effectiveAccountId,
    activeCategoryId,
    date,
    onExpandToDetailed,
    parsedLive.amount,
    parsedLive.note,
    type,
  ]);

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
  const timeEquivalent = formatTimeEquivalent(displayAmount, trueHourlyRate);
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

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[styles.cardWrap, { paddingBottom: cardBottomMargin }, sheetAnimatedStyle]}
        >
          {voicePromptVisible ? (
            <View
              style={[
                styles.voiceBanner,
                { backgroundColor: themeColors.card, borderColor: themeColors.border },
              ]}
            >
              <View
                style={[styles.voiceBannerIcon, { backgroundColor: `${themeColors.primary}1F` }]}
              >
                <Mic size={16} color={themeColors.primary} />
              </View>
              <View style={styles.voiceBannerText}>
                <Text
                  variant="bodyStrong"
                  className="text-foreground"
                  style={styles.voiceBannerTitle}
                  numberOfLines={1}
                >
                  {I18n.t('settings.quick_entry.voice.suggest_title')}
                </Text>
                <Text
                  variant="caption"
                  className="text-foreground/70"
                  style={styles.voiceBannerBody}
                  numberOfLines={2}
                >
                  {I18n.t('settings.quick_entry.voice.suggest_message')}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onEnableVoice?.();
                }}
                hitSlop={6}
                style={[styles.voiceBannerCta, { backgroundColor: themeColors.primary }]}
                accessibilityLabel={I18n.t('settings.quick_entry.voice.suggest_enable')}
              >
                <Text style={[styles.voiceBannerCtaLabel, { color: '#FFFFFF' }]}>
                  {I18n.t('settings.quick_entry.voice.suggest_enable')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onDismissVoicePrompt?.();
                }}
                hitSlop={10}
                style={styles.voiceBannerClose}
                accessibilityLabel={I18n.t('settings.quick_entry.voice.suggest_later')}
              >
                <X size={14} color={themeColors.textMuted} />
              </Pressable>
            </View>
          ) : null}
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
                <Text style={styles.summarySep}>·</Text>
                <Pressable
                  onPress={() => openPicker('account')}
                  style={styles.summarySegment}
                  hitSlop={6}
                >
                  <Text style={styles.summaryIcon}>
                    {selectedAccount?.type === 'credit' ? '💳' : '🏦'}
                  </Text>
                  <Text className="text-foreground" style={styles.summaryText} numberOfLines={1}>
                    {selectedAccount?.name ?? I18n.t('transactions.editor.account')}
                  </Text>
                </Pressable>
                {showAmountChip ? (
                  <>
                    <Text style={styles.summarySep}>·</Text>
                    <Pressable
                      onPress={() => openPicker('category')}
                      style={styles.summarySegment}
                      hitSlop={6}
                    >
                      <Text style={styles.summaryIcon}>{activeCategory?.icon || '🏷️'}</Text>
                      <Text
                        className="text-foreground"
                        style={styles.summaryText}
                        numberOfLines={1}
                      >
                        {activeCategory?.name ?? I18n.t('transactions.editor.category')}
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
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
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
                      const amountValue = formatMoneyOnly(displayAmount, settings);
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
                    {formatMoneyOnly(displayAmount, settings)}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>

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

      <QuickAddDateModalPicker
        visible={activePicker === 'date'}
        value={date}
        onSelect={handleDateSelect}
        onClose={closePicker}
      />
    </View>
  );
}
