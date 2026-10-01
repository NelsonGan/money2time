import { ChevronRight, ReceiptText, Search, Settings2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { Keyboard, Pressable, ScrollView, View } from 'react-native';
import PagerView, {
  type PagerViewOnPageSelectedEvent,
  type PageScrollStateChangedNativeEvent,
} from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { CategoryEmoji, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { ActivitySearchRow } from '~/features/transactions/components/ActivitySearchRow';
import { SettleUpDateHeader } from '~/features/transactions/components/SettleUpDateHeader';
import {
  groupSettleUpPeopleByDate,
  groupSettleUpSearchResultsByDate,
  groupSettleUpTransactionsByDate,
} from '~/features/transactions/lib/settleUpDateGroups';
import {
  filterSettleUpPeople,
  filterSettleUpTransactions,
} from '~/features/transactions/lib/settleUpSearch';
import {
  useSettleUpByTransaction,
  useSettleUpSummary,
} from '~/features/transactions/lib/useSettleUpSummary';
import { offscreenPageLimitFor, usePagerTabSync } from '~/hooks/usePagerTabSync';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import type { PersonDebt, TransactionDebt } from '~/types';
import { cn } from '~/utils';
import { currencySymbolForCode } from '~/utils/currency';
import { formatCurrency } from '~/utils/formatters';

type SettleUpTab = 'people' | 'transactions';

const TAB_ORDER: SettleUpTab[] = ['people', 'transactions'];

interface SettleUpScreenProps {
  onBack: () => void;
  onOpenPerson: (personKey: string) => void;
  onOpenTransaction: (transactionId: string) => void;
  onOpenSettings: () => void;
  /** Start a new itemized receipt split (Split by Item). */
  onSplitReceipt: () => void;
}

const AVATAR_COLORS = [
  '#C2604A',
  '#4A78C2',
  '#8A5AC2',
  '#3E9A78',
  '#C28A3E',
  '#B94A78',
  '#4AA5C2',
  '#7A7A3E',
];

function avatarColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function personInitial(person: PersonDebt): string {
  const name = person.name?.trim();
  return name ? name[0]!.toUpperCase() : '?';
}

export function SettleUpScreen({
  onBack,
  onOpenPerson,
  onOpenTransaction,
  onOpenSettings,
  onSplitReceipt,
}: SettleUpScreenProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { settings } = useApp();

  const [tab, setTab] = useState<SettleUpTab>('people');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const searchInputRef = useRef<TextInput | null>(null);
  const summary = useSettleUpSummary();
  const byTransaction = useSettleUpByTransaction();
  const people = useMemo(
    () =>
      isSearchOpen ? filterSettleUpPeople(summary.people, debouncedSearchQuery) : summary.people,
    [isSearchOpen, summary.people, debouncedSearchQuery],
  );
  const transactions = useMemo(
    () =>
      isSearchOpen
        ? filterSettleUpTransactions(byTransaction.transactions, debouncedSearchQuery)
        : byTransaction.transactions,
    [isSearchOpen, byTransaction.transactions, debouncedSearchQuery],
  );
  const peopleGroups = useMemo(() => groupSettleUpPeopleByDate(people), [people]);
  const transactionGroups = useMemo(
    () => groupSettleUpTransactionsByDate(transactions),
    [transactions],
  );
  const searchGroups = useMemo(
    () => (isSearchOpen ? groupSettleUpSearchResultsByDate(people, transactions) : []),
    [isSearchOpen, people, transactions],
  );
  const locale = settings.locale ?? I18n.locale ?? 'en';

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setDebouncedSearchQuery('');
      return;
    }
    const timeout = setTimeout(() => setDebouncedSearchQuery(trimmed), 180);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  const handleCloseSearch = useCallback(() => {
    void triggerHaptic('selection');
    setSearchQuery('');
    setDebouncedSearchQuery('');
    searchInputRef.current?.blur();
    setIsSearchOpen(false);
  }, []);

  // Horizontal pager keeps both tabs swipeable; state and page index stay in sync.
  const pagerRef = useRef<PagerView>(null);
  const activeTabIndex = TAB_ORDER.indexOf(tab);
  const {
    positionRef: pagerPositionRef,
    scrollEnabled: pagerScrollEnabled,
    onPageScrollStateChanged: onPagerScrollStateChanged,
    settleNow: settlePagerNow,
  } = usePagerTabSync(pagerRef, activeTabIndex);

  const handleOpenSearch = useCallback(() => {
    void triggerHaptic('selection');
    if (isSearchOpen) {
      searchInputRef.current?.focus();
      return;
    }
    settlePagerNow();
    setIsSearchOpen(true);
  }, [isSearchOpen, settlePagerNow]);

  const handlePagerScrollStateChanged = useCallback(
    (event: PageScrollStateChangedNativeEvent) => {
      onPagerScrollStateChanged(event);
    },
    [onPagerScrollStateChanged],
  );

  const handlePageSelected = useCallback(
    (event: PagerViewOnPageSelectedEvent) => {
      const position = event.nativeEvent.position;
      pagerPositionRef.current = position;
      const nextTab = TAB_ORDER[position];
      if (nextTab && nextTab !== tab) {
        void triggerHaptic('selection');
        setTab(nextTab);
      }
    },
    [tab, pagerPositionRef],
  );

  const formatReporting = useCallback(
    (value: number) => formatCurrency(value, settings.currencySymbol),
    [settings.currencySymbol],
  );
  const formatNative = useCallback(
    (value: number, currency: string) => formatCurrency(value, currencySymbolForCode(currency)),
    [],
  );
  const tabs: { value: SettleUpTab; label: string }[] = [
    { value: 'people', label: I18n.t('transactions.settleUp.tab_person') },
    { value: 'transactions', label: I18n.t('transactions.settleUp.tab_transactions') },
  ];

  const scrollContentStyle = {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: insets.bottom + 24,
  };

  // Outstanding hero — a clean centered total (matching the split subtotal /
  // insights breakdown hero): plain label + big amount + accent underline.
  const renderHero = () => (
    <View className="items-center px-4 pt-4 pb-2">
      <Text variant="caption" tone="muted">
        {I18n.t('transactions.settleUp.outstanding_label')}
      </Text>
      <Text variant="title" className="mt-1 text-center">
        {formatReporting(summary.totalReporting)}
      </Text>
      <View className="mt-2 h-[3px] w-8 rounded-full bg-primary/30" />
    </View>
  );

  const renderPersonCard = (person: PersonDebt) => (
    <View key={`person:${person.key}`} className="relative">
      {person.unpaidBillCount > 0 ? (
        <View
          pointerEvents="none"
          className="absolute z-10 -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive border-2 border-background items-center justify-center"
        >
          <Text className="text-white text-[10px] font-bold leading-[12px]">
            {person.unpaidBillCount}
          </Text>
        </View>
      ) : null}
      <Pressable
        onPress={() => {
          Keyboard.dismiss();
          void triggerHaptic('selection');
          onOpenPerson(person.key);
        }}
        accessibilityRole="button"
        accessibilityHint={
          person.unpaidBillCount === 0
            ? undefined
            : person.unpaidBillCount === 1
              ? I18n.t('transactions.settleUp.bills_one')
              : I18n.t('transactions.settleUp.bills_other', {
                  count: person.unpaidBillCount,
                })
        }
        className={cn(
          'flex-row items-center gap-3 rounded-2xl border px-3.5 py-3 active:opacity-80',
          person.unpaidBillCount === 0
            ? 'border-border/15 bg-secondary/20'
            : 'border-border/30 bg-card',
        )}
      >
        <View
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: avatarColor(person.key) }}
        >
          <Text variant="bodyStrong" style={{ color: '#fff' }}>
            {personInitial(person)}
          </Text>
        </View>
        <View className="flex-1">
          <Text
            variant="bodyStrong"
            tone={person.unpaidBillCount === 0 ? 'muted' : undefined}
            numberOfLines={1}
          >
            {person.name ?? I18n.t('transactions.settleUp.someone')}
          </Text>
        </View>
        <View className="items-end">
          <Text
            variant="bodyStrong"
            className={person.unpaidBillCount === 0 ? 'text-muted-foreground' : 'text-warning'}
          >
            {formatReporting(
              person.unpaidBillCount === 0 ? person.paidReporting : person.totalReporting,
            )}
          </Text>
        </View>
        <ChevronRight size={18} color={themeColors.textMuted} />
      </Pressable>
    </View>
  );

  const renderTransactionCard = (bill: TransactionDebt) => (
    <View key={`transaction:${bill.transactionId}`} className="relative">
      {bill.unpaidSplitCount > 0 ? (
        <View
          pointerEvents="none"
          className="absolute z-10 -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive border-2 border-background items-center justify-center"
        >
          <Text className="text-white text-[10px] font-bold leading-[12px]">
            {bill.unpaidSplitCount}
          </Text>
        </View>
      ) : null}
      <Pressable
        onPress={() => {
          Keyboard.dismiss();
          void triggerHaptic('selection');
          onOpenTransaction(bill.transactionId);
        }}
        accessibilityRole="button"
        accessibilityHint={
          bill.unpaidSplitCount === 0
            ? undefined
            : bill.unpaidSplitCount === 1
              ? I18n.t('transactions.settleUp.people_one')
              : I18n.t('transactions.settleUp.people_other', {
                  count: bill.unpaidSplitCount,
                })
        }
        className={cn(
          'flex-row items-center gap-3 rounded-2xl border px-3.5 py-3 active:opacity-80',
          bill.unpaidSplitCount === 0
            ? 'border-border/15 bg-secondary/20'
            : 'border-border/30 bg-card',
        )}
      >
        <View className="h-11 w-11 items-center justify-center rounded-full bg-secondary/50">
          <CategoryEmoji icon={bill.categoryIcon} size={22} className="text-[19px]" />
        </View>
        <View className="flex-1">
          <Text
            variant="bodyStrong"
            tone={bill.unpaidSplitCount === 0 ? 'muted' : undefined}
            numberOfLines={1}
          >
            {bill.note?.trim() ||
              bill.categoryName ||
              I18n.t('transactions.settleUp.untitled_bill')}
          </Text>
        </View>
        <View className="items-end">
          <Text
            variant="bodyStrong"
            className={bill.unpaidSplitCount === 0 ? 'text-muted-foreground' : 'text-warning'}
          >
            {formatNative(
              bill.unpaidSplitCount === 0 ? bill.paidNative : bill.totalNative,
              bill.currency,
            )}
          </Text>
        </View>
        <ChevronRight size={18} color={themeColors.textMuted} />
      </Pressable>
    </View>
  );

  const renderPeopleList = () => (
    <View className="mt-5 gap-3">
      {peopleGroups.map((group) => (
        <View key={group.dayKey} className="gap-2">
          <SettleUpDateHeader dayKey={group.dayKey} locale={locale} />
          {group.items.map(renderPersonCard)}
        </View>
      ))}
    </View>
  );

  const renderTransactionsList = () => (
    <View className="mt-5 gap-3">
      {transactionGroups.map((group) => (
        <View key={group.dayKey} className="gap-2">
          <SettleUpDateHeader dayKey={group.dayKey} locale={locale} />
          {group.items.map(renderTransactionCard)}
        </View>
      ))}
    </View>
  );

  const renderSearchResults = () => (
    <View className="mt-5 gap-3">
      {searchGroups.map((group) => (
        <View key={group.dayKey} className="gap-2">
          <SettleUpDateHeader dayKey={group.dayKey} locale={locale} />
          {group.items.map((result) =>
            result.kind === 'person'
              ? renderPersonCard(result.person)
              : renderTransactionCard(result.transaction),
          )}
        </View>
      ))}
    </View>
  );

  const renderOutstandingEmpty = () => (
    <View className="mt-6">
      <EmptyState
        title={I18n.t('transactions.settleUp.empty_title')}
        message={I18n.t('transactions.settleUp.empty_subtitle')}
        mascotMood="happy"
      />
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          onSplitReceipt();
        }}
        accessibilityRole="button"
        className="mt-6 flex-row items-center justify-center gap-2 self-center rounded-full bg-primary px-5 py-3 active:opacity-80"
      >
        <ReceiptText size={17} color="#fff" />
        <Text variant="bodyStrong" style={{ color: '#fff' }}>
          {I18n.t('transactions.receiptSplit.settleup_cta')}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <SettingsPageLayout>
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('transactions.settleUp.title')}
        infoTooltip={I18n.t('transactions.settleUp.subtitle')}
        rightAccessory={
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={handleOpenSearch}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('transactions.filters.search')}
              className={cn(
                'h-9 w-9 items-center justify-center rounded-full active:opacity-70',
                isSearchOpen ? 'bg-primary/10' : 'bg-secondary/60',
              )}
            >
              <Search
                size={18}
                color={isSearchOpen ? themeColors.primary : themeColors.textMuted}
              />
            </Pressable>
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                onOpenSettings();
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('transactions.settleUp.settings_action')}
              className="h-9 w-9 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
            >
              <Settings2 size={18} color={themeColors.textMuted} />
            </Pressable>
          </View>
        }
      />

      {isSearchOpen ? (
        <View className="px-5 pb-3">
          <ActivitySearchRow
            inputRef={searchInputRef}
            visible={isSearchOpen}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onClose={handleCloseSearch}
            placeholder={I18n.t('transactions.settleUp.search_placeholder')}
          />
        </View>
      ) : null}

      {!isSearchOpen ? renderHero() : null}

      {!isSearchOpen ? (
        <View className="flex-row border-b border-border/15 px-3">
          {tabs.map((t) => {
            const isActive = t.value === tab;
            return (
              <Pressable
                key={t.value}
                onPress={() => {
                  if (isActive) return;
                  void triggerHaptic('selection');
                  setTab(t.value);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                className="flex-1 items-center pb-2.5"
              >
                <Text
                  variant="bodyStrong"
                  className={cn(isActive ? 'text-foreground' : 'text-muted-foreground')}
                >
                  {t.label}
                </Text>
                <View
                  className="mt-2 h-0.5 rounded-full"
                  style={{ backgroundColor: isActive ? themeColors.primary : 'transparent' }}
                />
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View className="flex-1">
        {/* Keep the pager laid out so closing search restores the selected tab. */}
        <PagerView
          ref={pagerRef}
          style={{ flex: 1, opacity: isSearchOpen ? 0 : 1 }}
          pointerEvents={isSearchOpen ? 'none' : 'auto'}
          accessibilityElementsHidden={isSearchOpen}
          importantForAccessibility={isSearchOpen ? 'no-hide-descendants' : 'auto'}
          initialPage={activeTabIndex}
          offscreenPageLimit={offscreenPageLimitFor(TAB_ORDER.length)}
          scrollEnabled={pagerScrollEnabled}
          onPageSelected={handlePageSelected}
          onPageScrollStateChanged={handlePagerScrollStateChanged}
        >
          {TAB_ORDER.map((value) => {
            const hasResults = value === 'people' ? people.length > 0 : transactions.length > 0;
            return (
              <View key={value} style={{ flex: 1 }}>
                <ScrollView
                  className="flex-1"
                  contentContainerStyle={scrollContentStyle}
                  keyboardDismissMode="on-drag"
                  keyboardShouldPersistTaps="handled"
                >
                  {hasResults
                    ? value === 'people'
                      ? renderPeopleList()
                      : renderTransactionsList()
                    : renderOutstandingEmpty()}
                </ScrollView>
              </View>
            );
          })}
        </PagerView>

        {isSearchOpen ? (
          <ScrollView
            className="absolute inset-0 bg-background"
            contentContainerStyle={scrollContentStyle}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            {searchGroups.length > 0 ? (
              renderSearchResults()
            ) : (
              <EmptyState
                title={I18n.t('transactions.settleUp.search_empty_title')}
                message={I18n.t('transactions.empty_search_message')}
                mascotMood="curious"
              />
            )}
          </ScrollView>
        ) : null}
      </View>
    </SettingsPageLayout>
  );
}
