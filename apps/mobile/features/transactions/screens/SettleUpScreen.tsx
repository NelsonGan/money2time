import { Check, ChevronRight, ReceiptText, Search, Settings2 } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TextInputInstance } from 'react-native';
import { Keyboard, Pressable, ScrollView, View } from 'react-native';
import PagerView, {
  type PagerViewOnPageSelectedEvent,
  type PageScrollStateChangedNativeEvent,
} from 'react-native-pager-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { useBottomNavContentInset } from '~/components/navigation/BottomNavMinimize';
import { CategoryEmoji, SettingsHeader, SettingsPageLayout, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { ActivitySearchRow } from '~/features/transactions/components/ActivitySearchRow';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { SettleUpDateHeader } from '~/features/transactions/components/SettleUpDateHeader';
import { personInitial } from '~/features/transactions/lib/personAvatar';
import { personBalanceState } from '~/features/transactions/lib/settleUp';
import {
  groupSettleUpSearchResultsByDate,
  groupSettleUpTransactionsByDate,
} from '~/features/transactions/lib/settleUpDateGroups';
import {
  filterSettleUpPeople,
  filterSettleUpTransactions,
} from '~/features/transactions/lib/settleUpSearch';
import {
  type AlbumBalance,
  useAlbumBalances,
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
  /** Omitted when the page sits in the bottom bar, which hides the back button. */
  onBack?: () => void;
  onOpenPerson: (personKey: string) => void;
  onOpenTransaction: (transactionId: string) => void;
  /** Opens an album, where its own bills are settled. */
  onOpenAlbum: (albumId: string) => void;
  onOpenSettings: () => void;
  /** Start a new itemized receipt split (Split by Item). */
  onSplitReceipt: () => void;
}

export function SettleUpScreen({
  onBack,
  onOpenPerson,
  onOpenTransaction,
  onOpenAlbum,
  onOpenSettings,
  onSplitReceipt,
}: SettleUpScreenProps) {
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const bottomNavInset = useBottomNavContentInset();
  const { settings } = useApp();

  const [tab, setTab] = useState<SettleUpTab>('people');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const searchInputRef = useRef<TextInputInstance | null>(null);
  // The bills in no album; an album's are settled in it, and listed below.
  const summary = useSettleUpSummary();
  const byTransaction = useSettleUpByTransaction('outside_albums');
  const albumBalances = useAlbumBalances();
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
  // The summary lists open balances first (biggest either way), then the
  // people who are settled up.
  const openPeople = useMemo(() => people.filter((person) => person.unpaidBillCount > 0), [people]);
  const settledPeople = useMemo(
    () => people.filter((person) => person.unpaidBillCount === 0),
    [people],
  );
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
    // As a page in the bottom bar the floating bar overlays the list; as a
    // pushed route the inset is 0 and only the home indicator needs clearing.
    paddingBottom: Math.max(insets.bottom, bottomNavInset) + 24,
  };

  // The hero is the one number that matters: what the user is owed or owes
  // once everyone is netted, with both sides of it underneath.
  const hasOpenBalances = summary.billCount > 0;
  const netState =
    summary.netReporting >= 0.005 ? 'owed' : summary.netReporting <= -0.005 ? 'owe' : 'even';
  // Both sides are shown only when there are two: with everyone owing the same
  // way the net above already is that side, and a second copy of it (beside a
  // zero) is noise.
  const bothWays = summary.owedToYouReporting > 0 && summary.youOweReporting > 0;
  const renderHero = () => (
    <View className="items-center px-5 pt-4 pb-4">
      <Text variant="caption" tone="muted">
        {I18n.t(
          !hasOpenBalances
            ? 'transactions.settleUp.hero_settled'
            : netState === 'owed'
              ? 'transactions.settleUp.hero_owed'
              : netState === 'owe'
                ? 'transactions.settleUp.you_owe_tag'
                : 'transactions.settleUp.hero_even',
        )}
      </Text>
      <Text
        variant="title"
        className={cn(
          'mt-1 text-center',
          hasOpenBalances && netState === 'owed'
            ? 'text-success'
            : hasOpenBalances && netState === 'owe'
              ? 'text-destructive'
              : '',
        )}
      >
        {formatReporting(Math.abs(summary.netReporting))}
      </Text>
      {bothWays ? (
        // The two sides of the net, to scale: one slim bar split by how much
        // is owed each way, with each figure under its own end.
        <View className="mt-4 self-stretch">
          <View className="h-1.5 flex-row gap-1 overflow-hidden rounded-full">
            <View
              className="rounded-full bg-success/60"
              style={{ flex: summary.owedToYouReporting }}
            />
            <View
              className="rounded-full bg-destructive/50"
              style={{ flex: summary.youOweReporting }}
            />
          </View>
          <View className="mt-2 flex-row justify-between">
            <View>
              <Text variant="caption" tone="muted">
                {I18n.t('transactions.settleUp.owed_to_you')}
              </Text>
              <Text variant="bodyStrong" className="text-success">
                {formatReporting(summary.owedToYouReporting)}
              </Text>
            </View>
            <View className="items-end">
              <Text variant="caption" tone="muted">
                {I18n.t('transactions.settleUp.you_owe_tag')}
              </Text>
              <Text variant="bodyStrong" className="text-destructive">
                {formatReporting(summary.youOweReporting)}
              </Text>
            </View>
          </View>
        </View>
      ) : (
        <View className="mt-2 h-[3px] w-8 rounded-full bg-primary/30" />
      )}
    </View>
  );

  const renderPersonCard = (person: PersonDebt) => {
    const state = personBalanceState(person);
    const settled = state === 'settled';
    // Open bills while there is a balance; every bill once it is settled.
    const billCount = settled ? person.billCount : person.unpaidBillCount;
    const billsLabel =
      billCount === 1
        ? I18n.t('transactions.settleUp.bills_one')
        : I18n.t('transactions.settleUp.bills_other', { count: billCount });
    const stateLabel =
      state === 'owes_you'
        ? I18n.t('transactions.settleUp.person_owes_label')
        : state === 'you_owe'
          ? I18n.t('transactions.settleUp.you_owe_tag')
          : I18n.t('transactions.settleUp.even_tag');
    return (
      <Pressable
        key={`person:${person.key}`}
        onPress={() => {
          Keyboard.dismiss();
          void triggerHaptic('selection');
          onOpenPerson(person.key);
        }}
        accessibilityRole="button"
        className={cn(
          'flex-row items-center gap-3 rounded-2xl border px-3.5 py-3 active:opacity-80',
          settled ? 'border-border/15 bg-secondary/20' : 'border-border/30 bg-card',
        )}
      >
        <View style={{ opacity: settled ? 0.55 : 1 }}>
          <PersonAvatar name={person.name} partyKey={person.key} size={38.5} />
        </View>
        <View className="flex-1">
          <Text variant="bodyStrong" tone={settled ? 'muted' : undefined} numberOfLines={1}>
            {person.name ?? I18n.t('transactions.settleUp.someone')}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {billsLabel}
          </Text>
        </View>
        {settled ? (
          <Check size={18} color={themeColors.success} />
        ) : (
          <View className="items-end">
            <Text variant="caption" tone="muted">
              {stateLabel}
            </Text>
            <Text
              variant="bodyStrong"
              className={
                state === 'owes_you'
                  ? 'text-success'
                  : state === 'you_owe'
                    ? 'text-destructive'
                    : 'text-muted-foreground'
              }
            >
              {formatReporting(Math.abs(person.netReporting))}
            </Text>
          </View>
        )}
        <ChevronRight size={18} color={themeColors.textMuted} />
      </Pressable>
    );
  };

  const renderTransactionCard = (bill: TransactionDebt) => {
    const settled = bill.unpaidSplitCount === 0;
    return (
      <Pressable
        key={`transaction:${bill.transactionId}`}
        onPress={() => {
          Keyboard.dismiss();
          void triggerHaptic('selection');
          onOpenTransaction(bill.transactionId);
        }}
        accessibilityRole="button"
        className={cn(
          'flex-row items-center gap-3 rounded-2xl border px-3.5 py-3 active:opacity-80',
          settled ? 'border-border/15 bg-secondary/20' : 'border-border/30 bg-card',
        )}
      >
        <View className="h-11 w-11 items-center justify-center rounded-full bg-secondary/50">
          <CategoryEmoji icon={bill.categoryIcon} size={22} className="text-[19px]" />
        </View>
        <View className="flex-1">
          <Text variant="bodyStrong" tone={settled ? 'muted' : undefined} numberOfLines={1}>
            {bill.note?.trim() ||
              bill.categoryName ||
              I18n.t('transactions.settleUp.untitled_bill')}
          </Text>
          {/* Who put the money down, which is which way the bill is owed. */}
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {bill.paidBy
              ? I18n.t('transactions.settleUp.person_paid', {
                  name: bill.paidBy.name ?? I18n.t('transactions.settleUp.someone'),
                })
              : I18n.t('transactions.settleUp.you_paid')}
          </Text>
        </View>
        <View className="items-end">
          {settled ? null : (
            <Text variant="caption" tone="muted">
              {I18n.t(
                bill.paidBy
                  ? 'transactions.settleUp.you_owe_tag'
                  : 'transactions.settleUp.owed_to_you',
              )}
            </Text>
          )}
          <Text
            variant="bodyStrong"
            className={
              settled ? 'text-muted-foreground' : bill.paidBy ? 'text-destructive' : 'text-success'
            }
          >
            {formatNative(settled ? bill.paidNative : bill.totalNative, bill.currency)}
          </Text>
        </View>
        <ChevronRight size={18} color={themeColors.textMuted} />
      </Pressable>
    );
  };

  const renderAlbumCard = ({ album, netReporting }: AlbumBalance) => {
    const state = netReporting >= 0.005 ? 'owed' : netReporting <= -0.005 ? 'owe' : 'even';
    return (
      <Pressable
        key={`album:${album.id}`}
        onPress={() => {
          void triggerHaptic('selection');
          onOpenAlbum(album.id);
        }}
        accessibilityRole="button"
        className="flex-row items-center gap-3 rounded-2xl border border-border/30 bg-card px-3.5 py-3 active:opacity-80"
      >
        <View className="h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
          <Text variant="bodyStrong" className="text-primary">
            {personInitial(album.name)}
          </Text>
        </View>
        <Text variant="bodyStrong" numberOfLines={1} className="flex-1">
          {album.name}
        </Text>
        <View className="items-end">
          <Text variant="caption" tone="muted">
            {I18n.t(
              state === 'owed'
                ? 'transactions.settleUp.hero_owed'
                : state === 'owe'
                  ? 'transactions.settleUp.you_owe_tag'
                  : 'transactions.settleUp.even_tag',
            )}
          </Text>
          <Text
            variant="bodyStrong"
            className={
              state === 'owed'
                ? 'text-success'
                : state === 'owe'
                  ? 'text-destructive'
                  : 'text-muted-foreground'
            }
          >
            {formatReporting(Math.abs(netReporting))}
          </Text>
        </View>
        <ChevronRight size={18} color={themeColors.textMuted} />
      </Pressable>
    );
  };

  // Albums answer for their own bills, so both tabs list the albums with
  // something owed first: without them the Transactions tab would read as
  // empty while an album still has money open.
  const renderAlbumSection = (followedBy: string | null) =>
    albumBalances.length > 0 ? (
      <>
        <Text variant="label" tone="muted" className="pb-1">
          {I18n.t('albums.title')}
        </Text>
        {albumBalances.map(renderAlbumCard)}
        {followedBy ? (
          <Text variant="label" tone="muted" className="pb-1 pt-3">
            {followedBy}
          </Text>
        ) : null}
      </>
    ) : null;

  const renderPeopleList = () => (
    <View className="mt-4 gap-2">
      {renderAlbumSection(openPeople.length > 0 ? I18n.t('albums.people.title') : null)}
      {openPeople.map(renderPersonCard)}
      {settledPeople.length > 0 ? (
        <>
          <Text variant="label" tone="muted" className="pt-3 pb-1">
            {I18n.t('transactions.settleUp.settled_up')}
          </Text>
          {settledPeople.map(renderPersonCard)}
        </>
      ) : null}
    </View>
  );

  const renderTransactionsList = () => (
    <View className="mt-5 gap-3">
      {albumBalances.length > 0 ? <View className="gap-2">{renderAlbumSection(null)}</View> : null}
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

      {/* The total is of the bills in no album: with nothing open among them,
          it would say "All settled up" above an album that is not. */}
      {!isSearchOpen && (summary.billCount > 0 || albumBalances.length === 0) ? renderHero() : null}

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
                  className="mt-2 h-0.5 w-16 rounded-full"
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
            const hasResults =
              value === 'people'
                ? people.length > 0 || albumBalances.length > 0
                : transactions.length > 0 || albumBalances.length > 0;
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
