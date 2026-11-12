import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollViewInstance } from 'react-native';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { LoadingDots } from '~/components/feedback/LoadingDots';
import { ContentFrameProvider, useContentFrame } from '~/components/layout/ContentFrame';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { Text } from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { chartCategoryColor } from '~/constants/chartColors';
import { useApp, useTransactions } from '~/context/AppContext';
import { useCloudSync } from '~/features/cloudSync/CloudSyncContext';
import { type BreakdownChartRow, CategoryBreakdownChart } from '~/features/insights/components';
import type { InsightsDrilldownPayload } from '~/features/insights/screens';
import { countsTowardSpending } from '~/features/reimbursements/lib/reimbursementMath';
import { sharingErrorMessage } from '~/features/sharedLedgers/lib/sharing';
import {
  buildBulkUpdateInputs,
  BulkEditTransactionsSheet,
  type BulkTransactionChanges,
  DuplicateTransactionsDatePicker,
  TransactionSelectionToolbar,
} from '~/features/transactions/components';
import { ActivityTransactionList } from '~/features/transactions/components/ActivityTransactionList';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { selectDuplicableTransactions } from '~/features/transactions/lib/duplicateTransaction';
import { useThemeColors } from '~/hooks/useThemeColors';
import { useWideTabColumns } from '~/hooks/useWideTabColumns';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { pickLibraryImage } from '~/services/libraryImagePicker';
import { deleteAlbumCover, getAlbumCoverUri, saveAlbumCover } from '~/services/userAssets';
import type { CategoryType, TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { formatAmount, formatHours } from '~/utils/formatters';
import { runAfterInteractions } from '~/utils/interactions';
import { countsAsExpenseRow } from '~/utils/spending';

import { AlbumBalances } from '../components/AlbumBalances';
import { useAlbumGroup } from '../hooks/useAlbumGroup';
import { formatAlbumDateRange } from '../utils';

type DetailTab = 'balances' | 'breakdown' | 'transactions';

const TOP_BAR_HEIGHT = 52;
const TAB_BAR_HEIGHT = 48;

// Stable reference for the pre-ready window so dependent memos don't churn.
const EMPTY_TRANSACTIONS: TransactionWithRelations[] = [];

interface AlbumDetailScreenProps {
  albumId: string;
  onClose: () => void;
  onAddTransactions: (albumId: string) => void;
  onEditDetails: (albumId: string) => void;
  /** Who the album is split with, and its sharing. */
  onOpenPeople: (albumId: string) => void;
  /** A person's page, with only this album's bills. */
  onOpenPerson: (personKey: string, albumId: string) => void;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  onOpenBreakdown: (payload: InsightsDrilldownPayload) => void;
  onDeleted: () => void;
}

export function AlbumDetailScreen({
  albumId,
  onClose,
  onAddTransactions,
  onEditDetails,
  onOpenPeople,
  onOpenPerson,
  onOpenTransaction,
  onOpenBreakdown,
  onDeleted,
}: AlbumDetailScreenProps) {
  const {
    albums,
    settings,
    getAlbumStats,
    getAlbumTransactions,
    getCategoryById,
    getDisplayValueForTransaction,
    getTrueHourlyRateForDate,
    deleteAlbum,
    updateAlbum,
    updateTransactionsBulk,
    removeTransactionsFromAlbum,
    addTransactionsToAlbum,
  } = useApp();
  const { transactions } = useTransactions();
  const sync = useCloudSync();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useContentFrame();
  // iPad and the open Duo: two panes in place of the Breakdown / Transactions
  // tabs.
  const wideColumns = useWideTabColumns();
  const isSplit = wideColumns.columns > 1;
  const splitPaneWidth =
    (Math.min(windowWidth, wideColumns.maxWidth ?? windowWidth) - SPLIT_PADDING * 2 - SPLIT_GAP) /
    2;
  const album = albums.find((a) => a.id === albumId);
  // Who the album is split with. With people (or once shared) the page leads
  // with their balances; an album nobody is split with reads as before.
  const group = useAlbumGroup(album);
  const showBalances = group.available && (group.others.length > 0 || group.share !== null);
  const tabs = useMemo<DetailTab[]>(
    () =>
      showBalances ? ['balances', 'breakdown', 'transactions'] : ['breakdown', 'transactions'],
    [showBalances],
  );
  const [tab, setTab] = useState<DetailTab>(showBalances ? 'balances' : 'breakdown');
  // The Balances tab going (the last person removed) leaves the page on a tab it still has.
  const shownTab = tabs.includes(tab) ? tab : tabs[0];
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [showDuplicatePicker, setShowDuplicatePicker] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const pagerRef = useRef<ScrollViewInstance | null>(null);
  const outerScrollRef = useRef<ScrollViewInstance | null>(null);
  // Whether the cover hero is scrolled off-screen (content snapped to the top).
  // Drives the tab-bar toggle arrow's direction and action.
  const [coverCollapsed, setCoverCollapsed] = useState(false);
  // Page width drives both the pager layout and the tap→scroll math. Seeded with
  // the window width and corrected once the pager measures itself (tablets render
  // narrower than the full window inside TabletContentContainer).
  const [pageWidth, setPageWidth] = useState(windowWidth);
  // Hold the heavy content (breakdown donut + full transaction list) off the
  // first render so it doesn't compute and paint on the JS thread *during* the
  // slide-in animation — that jank is what made the screen feel laggy on open.
  // We mount the cheap cover/tab-bar chrome immediately and swap in the content
  // once the navigation transition has settled.
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    const task = runAfterInteractions(() => setContentReady(true));
    return () => task.cancel();
  }, []);

  // Cover occupies ~30% of the screen; the content below fills the rest. Computed
  // here (not just at render) so the scroll callbacks can snap to these offsets.
  const coverHeight = Math.round(windowHeight * 0.3);
  const contentHeight = Math.max(260, windowHeight - insets.top - TOP_BAR_HEIGHT - TAB_BAR_HEIGHT);

  // Read on every render: `getAlbumStats` keeps one identity and looks the
  // album up in a cache it rebuilds only when its inputs change (membership,
  // transactions, the money/time display), so this stays cheap, hands back the
  // same object while nothing changed, and never goes stale the way a memo keyed
  // on the function would after a switch to time mode.
  const stats = getAlbumStats(albumId);
  // `getAlbumTransactions` reads the table, and both it and `albums` are stable
  // across transaction churn, so `transactions` is what tells this memo a row
  // written from here (a duplicate) has landed and can now be read back.
  const albumTransactions = useMemo(
    () => (contentReady ? getAlbumTransactions(albumId) : EMPTY_TRANSACTIONS),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [contentReady, getAlbumTransactions, albumId, albums, transactions],
  );
  const coverUri = useMemo(() => getAlbumCoverUri(album?.coverPhotoUri), [album?.coverPhotoUri]);
  // Skip a uri that failed to load natively; see CategoryEmoji for why.
  const [brokenCoverUri, setBrokenCoverUri] = useState<string | null>(null);
  const effectiveCoverUri = coverUri !== brokenCoverUri ? coverUri : null;
  const isTimeMode = settings.displayMode === 'time';

  const displayValue = useCallback(
    (t: TransactionWithRelations) =>
      isTimeMode ? getDisplayValueForTransaction(t) : (t.reportingAmount ?? t.amount),
    [getDisplayValueForTransaction, isTimeMode],
  );

  // Expense-only breakdown grouped by root category, mirroring the insights breakdown.
  const { breakdownRows, breakdownTransactionsByRoot } = useMemo(() => {
    const totals = new Map<string, BreakdownChartRow>();
    const byRoot = new Map<string, TransactionWithRelations[]>();
    albumTransactions.forEach((t) => {
      if (!countsAsExpenseRow(t) || !t.categoryId) return;
      if (!countsTowardSpending(t, settings.reimbursementsCountAsExpense)) return;
      const cat = getCategoryById(t.categoryId);
      if (!cat) return;
      const root = cat.parentId ? getCategoryById(cat.parentId) : cat;
      const id = root?.id ?? cat.id;
      const existing = totals.get(id);
      const amount = displayValue(t);
      if (existing) {
        existing.amount += amount;
        existing.count += 1;
      } else {
        totals.set(id, {
          id,
          label: root?.name ?? cat.name,
          emoji: root?.icon ?? cat.icon,
          amount,
          count: 1,
        });
      }
      const list = byRoot.get(id);
      if (list) list.push(t);
      else byRoot.set(id, [t]);
    });
    return {
      breakdownRows: [...totals.values()].sort((a, b) => b.amount - a.amount),
      breakdownTransactionsByRoot: byRoot,
    };
  }, [albumTransactions, displayValue, getCategoryById, settings.reimbursementsCountAsExpense]);

  // Drill into a breakdown category exactly like the insights expense breakdown:
  // parents open their subcategories, leaves open their transactions.
  const handleOpenBreakdownRow = useCallback(
    (rowId: string) => {
      const index = breakdownRows.findIndex((row) => row.id === rowId);
      if (index === -1) return;
      const row = breakdownRows[index];
      const rowTransactions = breakdownTransactionsByRoot.get(rowId) ?? [];
      const rootCategory = getCategoryById(rowId);
      onOpenBreakdown({
        label: row.label,
        transactionIds: rowTransactions.map((t) => t.id),
        categoryRootId: rootCategory?.id,
        categoryRootLabel: rootCategory?.name ?? row.label,
        categoryRootEmoji: rootCategory?.icon ?? row.emoji ?? undefined,
        categoryRootColor: chartCategoryColor(index),
        albumId,
      });
    },
    [albumId, breakdownRows, breakdownTransactionsByRoot, getCategoryById, onOpenBreakdown],
  );

  const formatValue = useCallback(
    (amount: number) =>
      isTimeMode
        ? formatHours(amount, settings)
        : formatAmount(amount, settings, { showSign: false }),
    [isTimeMode, settings],
  );

  const dateRange = formatAlbumDateRange(stats.startDate, stats.endDate);

  const handleDelete = useCallback(() => {
    void triggerHaptic('warning');
    const body =
      group.share?.role === 'owner'
        ? `${I18n.t('albums.delete_body')} ${I18n.t('albums.share.stop_message')}`
        : I18n.t('albums.delete_body');
    Alert.alert(I18n.t('albums.delete_title'), body, [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: I18n.t('common.delete'),
        style: 'destructive',
        onPress: () => {
          const share = group.share;
          if (!share) {
            deleteAlbum(albumId);
            onDeleted();
            return;
          }
          // A shared album stops being shared with it: the owner stops it for
          // everyone, a member leaves. Told to the Worker now, or after the
          // next sign-in when it cannot be reached.
          const ending =
            share.role === 'owner'
              ? sync.stopSharingLedger(albumId, { whenUnreachable: 'local' })
              : sync.leaveLedger(albumId, { force: true });
          ending
            .then(() => {
              deleteAlbum(albumId);
              onDeleted();
            })
            .catch((error: unknown) => Alert.alert(sharingErrorMessage(error)));
        },
      },
    ]);
  }, [albumId, deleteAlbum, group.share, onDeleted, sync]);

  const changeCover = useCallback(async () => {
    void triggerHaptic('selection');
    await pickLibraryImage(
      (uri) => {
        const previous = album?.coverPhotoUri ?? null;
        const relativePath = saveAlbumCover(uri);
        updateAlbum(albumId, { coverPhotoUri: relativePath });
        if (previous) deleteAlbumCover(previous);
      },
      {
        aspect: [3, 2],
        permissionAlert: {
          title: I18n.t('albums.cover_permission_title'),
          message: I18n.t('albums.cover_permission_body'),
        },
      },
    );
  }, [album?.coverPhotoUri, albumId, updateAlbum]);

  const isSelectionMode = selectedTransactionIds.length > 0;
  const selectedTransactionCount = selectedTransactionIds.length;
  const transactionById = useMemo(
    () => new Map(albumTransactions.map((t) => [t.id, t])),
    [albumTransactions],
  );
  const clearSelection = useCallback(() => setSelectedTransactionIds([]), []);
  const duplicableSelectedTransactions = useMemo(
    () => selectDuplicableTransactions(albumTransactions, selectedTransactionIds),
    [albumTransactions, selectedTransactionIds],
  );
  // `createTransaction` files a new row into the *active* album, which is not
  // necessarily the one being viewed, so the copies are added here explicitly.
  const handleDuplicated = useCallback(
    (ids: string[]) => {
      addTransactionsToAlbum(albumId, ids);
      setSelectedTransactionIds([]);
    },
    [addTransactionsToAlbum, albumId],
  );
  const toggleSelection = useCallback((id: string) => {
    setSelectedTransactionIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    );
  }, []);
  const toggleDaySelection = useCallback((dayTransactionIds: string[]) => {
    if (dayTransactionIds.length === 0) return;
    void triggerHaptic('selection');
    setSelectedTransactionIds((prev) => {
      const prevSet = new Set(prev);
      const allSelected = dayTransactionIds.every((id) => prevSet.has(id));
      if (allSelected) {
        const dayIdSet = new Set(dayTransactionIds);
        return prev.filter((id) => !dayIdSet.has(id));
      }
      const next = [...prev];
      for (const id of dayTransactionIds) {
        if (!prevSet.has(id)) next.push(id);
      }
      return next;
    });
  }, []);
  const handleTransactionPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleSelection(transaction.id);
        return;
      }
      onOpenTransaction(transaction);
    },
    [isSelectionMode, onOpenTransaction, toggleSelection],
  );
  const handleTransactionLongPress = useCallback(
    (transaction: TransactionWithRelations) => {
      if (isSelectionMode) {
        toggleSelection(transaction.id);
        return;
      }
      void triggerHaptic('selection');
      setSelectedTransactionIds([transaction.id]);
    },
    [isSelectionMode, toggleSelection],
  );
  const selectionCategoryTypes = useMemo<CategoryType[]>(() => {
    let hasIncome = false;
    let hasExpense = false;
    selectedTransactionIds.forEach((id) => {
      const t = transactionById.get(id);
      if (t?.type === 'income') hasIncome = true;
      else if (t?.type === 'expense') hasExpense = true;
    });
    const types: CategoryType[] = [];
    if (hasIncome) types.push('income');
    if (hasExpense) types.push('expense');
    return types;
  }, [selectedTransactionIds, transactionById]);
  const selectedTotal = useMemo(() => {
    let total = 0;
    selectedTransactionIds.forEach((id) => {
      const t = transactionById.get(id);
      if (t) total += displayValue(t);
    });
    return total;
  }, [displayValue, selectedTransactionIds, transactionById]);
  const handleApplyBulkUpdate = useCallback(
    (changes: BulkTransactionChanges) => {
      if (selectedTransactionIds.length === 0) return;
      const updates = buildBulkUpdateInputs(
        selectedTransactionIds,
        changes,
        (id) => transactionById.get(id)?.type,
      );
      if (updates.length > 0) {
        updateTransactionsBulk(updates);
        void triggerHaptic('success');
      }
      setShowBulkUpdate(false);
      setSelectedTransactionIds([]);
    },
    [selectedTransactionIds, transactionById, updateTransactionsBulk],
  );
  const handleRemoveSelected = useCallback(() => {
    if (selectedTransactionIds.length === 0) return;
    const idsToRemove = [...selectedTransactionIds];
    Alert.alert(
      I18n.t('albums.remove_from_album'),
      I18n.t('albums.remove_selected_body', { count: idsToRemove.length }),
      [
        { text: I18n.t('common.cancel'), style: 'cancel' },
        {
          text: I18n.t('common.remove'),
          onPress: () => {
            removeTransactionsFromAlbum(albumId, idsToRemove);
            setSelectedTransactionIds([]);
          },
        },
      ],
    );
  }, [albumId, removeTransactionsFromAlbum, selectedTransactionIds]);

  // Track whether the cover hero has scrolled away so the toggle arrow can flip
  // direction. Only flips state when crossing the halfway point to avoid churn.
  const handleOuterScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const collapsed = e.nativeEvent.contentOffset.y >= coverHeight / 2;
      setCoverCollapsed((prev) => (prev === collapsed ? prev : collapsed));
    },
    [coverHeight],
  );

  // Tab-bar arrow: snap the outer scroll between the cover photo (top) and the
  // content. Gives a reliable control when the breakdown page is too short to
  // hand its scroll gesture off to the outer snapping ScrollView.
  const toggleCover = useCallback(() => {
    void triggerHaptic('selection');
    outerScrollRef.current?.scrollTo({ y: coverCollapsed ? 0 : coverHeight, animated: true });
  }, [coverCollapsed, coverHeight]);

  // Tap a tab → animate the pager to that page (swipe is handled by the pager).
  const selectTab = useCallback(
    (value: DetailTab) => {
      void triggerHaptic('selection');
      setSelectedTransactionIds([]);
      setTab(value);
      const index = Math.max(0, tabs.indexOf(value));
      pagerRef.current?.scrollTo({ x: index * pageWidth, animated: true });
    },
    [pageWidth, tabs],
  );

  // Swipe settles on a page → sync the active tab and clear any selection.
  const handlePagerMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, pageWidth));
      const value = tabs[Math.min(tabs.length - 1, Math.max(0, index))];
      if (value === shownTab) return;
      void triggerHaptic('selection');
      setSelectedTransactionIds([]);
      setTab(value);
    },
    [pageWidth, shownTab, tabs],
  );

  // Keep the pager aligned to the active tab when the page width changes
  // (tablet layout correction, orientation change). Re-aligning on width only —
  // not on tab — so tap/swipe transitions aren't interrupted by a snap.
  const activeIndexRef = useRef(0);
  activeIndexRef.current = Math.max(0, tabs.indexOf(shownTab));
  useEffect(() => {
    if (activeIndexRef.current === 0) return;
    pagerRef.current?.scrollTo({ x: activeIndexRef.current * pageWidth, animated: false });
  }, [pageWidth, tabs.length]);

  if (!album) {
    return <View className="flex-1 bg-background" />;
  }

  // The cover photo, title and dates. `rounded` for the card it sits in with
  // two panes.
  const coverHero = (height: number, rounded = false) => (
    <View
      style={[{ height }, rounded && { borderRadius: 20, overflow: 'hidden' }]}
      className="bg-secondary/40"
    >
      {effectiveCoverUri ? (
        <Image
          {...REPLAY_PRIVATE}
          source={{ uri: effectiveCoverUri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={120}
          onError={() => setBrokenCoverUri(effectiveCoverUri)}
        />
      ) : (
        <View className="flex-1 items-center justify-center bg-primary/15">
          <Text variant="display" tone="muted">
            {album.name.slice(0, 1).toUpperCase()}
          </Text>
        </View>
      )}

      {/* Change cover photo — top right */}
      <Pressable
        onPress={changeCover}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('albums.change_cover')}
        className="absolute right-4 top-4 flex-row items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5"
      >
        <Camera size={14} color="#ffffff" />
        <Text variant="label" className="text-white">
          {I18n.t('albums.change_cover')}
        </Text>
      </Pressable>

      {/* Who it is split with — bottom right, over the gradient below */}
      {group.available ? (
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            onOpenPeople(albumId);
          }}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('albums.people.title')}
          hitSlop={8}
          style={{ position: 'absolute', right: 16, bottom: 12, zIndex: 1 }}
          className="flex-row items-center rounded-full bg-black/45 py-1 pl-1 pr-2.5"
        >
          {group.others.length > 0 ? (
            <>
              {group.people.slice(0, 4).map((person, index) => (
                <View
                  key={person.id ?? 'me'}
                  style={{ marginLeft: index === 0 ? 0 : -8 }}
                  className="rounded-full border-2 border-black/30"
                >
                  <PersonAvatar
                    name={person.name}
                    partyKey={person.isSelf ? null : debtPartyKey(person.name)}
                    size={24}
                  />
                </View>
              ))}
              <Text variant="label" className="ml-1.5 text-white">
                {group.people.length > 4 ? `+${group.people.length - 4}` : group.people.length}
              </Text>
            </>
          ) : (
            <>
              <View className="h-6 w-6 items-center justify-center">
                <UserPlus size={14} color="#ffffff" />
              </View>
              <Text variant="label" className="text-white">
                {I18n.t('albums.people.split_with')}
              </Text>
            </>
          )}
        </Pressable>
      ) : null}

      {/* Title + date — bottom left */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.55)']}
        locations={[0, 1]}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          paddingTop: 44,
          paddingBottom: 12,
          paddingHorizontal: 20,
          alignItems: 'flex-start',
        }}
      >
        <Text variant="bodyStrong" numberOfLines={1} className="text-white">
          {album.name}
        </Text>
        {dateRange ? (
          <Text variant="caption" numberOfLines={1} className="mt-0.5 text-white/75">
            {dateRange}
          </Text>
        ) : null}
      </LinearGradient>
    </View>
  );

  const breakdownContent =
    breakdownRows.length === 0 ? (
      <EmptyState
        title={I18n.t('albums.no_transactions_title')}
        message={I18n.t('albums.no_transactions_message')}
        mascotMood="curious"
        animateIn={false}
      />
    ) : (
      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 20, paddingBottom: insets.bottom + 32 }}
      >
        <CategoryBreakdownChart
          rows={breakdownRows}
          formatValue={formatValue}
          onSelectRow={handleOpenBreakdownRow}
        />
      </ScrollView>
    );

  const balancesContent = (
    <ScrollView
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
    >
      <AlbumBalances
        albumId={albumId}
        group={group}
        onOpenPerson={(personKey) => onOpenPerson(personKey, albumId)}
        onOpenPeople={() => onOpenPeople(albumId)}
      />
    </ScrollView>
  );

  const transactionsContent = (
    <>
      <ActivityTransactionList
        transactions={albumTransactions}
        displaySettings={settings}
        getDisplayValueForTransaction={getDisplayValueForTransaction}
        getTrueHourlyRateForDate={getTrueHourlyRateForDate}
        reimbursementsCountAsExpense={settings.reimbursementsCountAsExpense}
        onTransactionPress={handleTransactionPress}
        onTransactionLongPress={handleTransactionLongPress}
        onToggleDaySelection={toggleDaySelection}
        selectedTransactionIds={selectedTransactionIds}
        selectionMode={isSelectionMode}
        emptyTitle={I18n.t('albums.no_transactions_title')}
        emptyMessage={I18n.t('albums.no_transactions_message')}
        contentPaddingBottom={insets.bottom + 32}
        disableItemAnimations
        compactItems
      />
      {isSelectionMode ? (
        <TransactionSelectionToolbar
          selectedCount={selectedTransactionCount}
          totalNode={
            <Text variant="label" className="text-foreground">
              {formatValue(selectedTotal)}
            </Text>
          }
          onCancel={clearSelection}
          onDuplicate={
            duplicableSelectedTransactions.length > 0
              ? () => setShowDuplicatePicker(true)
              : undefined
          }
          onEdit={() => setShowBulkUpdate(true)}
          onDelete={handleRemoveSelected}
        />
      ) : null}
    </>
  );

  const tabsBar = (
    <View
      className="flex-row items-center justify-between border-b border-border/30 bg-background px-5"
      style={{ height: TAB_BAR_HEIGHT }}
    >
      <View className="flex-row self-stretch">
        {tabs.map((value) => {
          const option = {
            value,
            label:
              value === 'balances'
                ? I18n.t('albums.balances.tab')
                : value === 'breakdown'
                  ? I18n.t('albums.tab_breakdown')
                  : I18n.t('albums.tab_transactions'),
          };
          const active = shownTab === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => selectTab(option.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              className="mr-6 justify-center"
            >
              <Text
                variant="bodyStrong"
                className={cn(active ? 'text-primary' : 'text-muted-foreground')}
              >
                {option.label}
              </Text>
              <View
                className="mt-1.5 h-0.5 rounded-full"
                style={{ backgroundColor: active ? themeColors.primary : 'transparent' }}
              />
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={toggleCover}
        accessibilityRole="button"
        accessibilityLabel={
          coverCollapsed ? I18n.t('albums.show_cover') : I18n.t('albums.show_details')
        }
        hitSlop={8}
        className="h-8 w-8 items-center justify-center rounded-full bg-secondary/40"
      >
        {coverCollapsed ? (
          <ChevronUp size={18} color={themeColors.textMuted} />
        ) : (
          <ChevronDown size={18} color={themeColors.textMuted} />
        )}
      </Pressable>
    </View>
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <TabletContentContainer style={{ flex: 1 }} maxWidth={wideColumns.maxWidth}>
        {/* Fixed top bar */}
        <View style={{ height: TOP_BAR_HEIGHT }} className="justify-center">
          <View className="flex-row items-center justify-between px-3">
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.back')}
              className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
            >
              <ChevronLeft size={20} color={themeColors.textMuted} />
            </Pressable>
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onEditDetails(albumId);
                }}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('albums.edit_details_title')}
                className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
              >
                <Pencil size={17} color={themeColors.textMuted} />
              </Pressable>
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onAddTransactions(albumId);
                }}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('albums.add_transactions_title')}
                className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
              >
                <Plus size={19} color={themeColors.textMuted} />
              </Pressable>
              <Pressable
                onPress={handleDelete}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('common.delete')}
                className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
              >
                <Trash2 size={18} color={themeColors.error} />
              </Pressable>
            </View>
          </View>
        </View>

        {isSplit ? (
          // Two panes: the cover and breakdown on the left, the transactions
          // on the right, both always showing instead of behind tabs.
          <View style={styles.splitRow}>
            <View style={styles.splitPane}>
              <ContentFrameProvider width={splitPaneWidth} height={windowHeight}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
                >
                  {coverHero(SPLIT_COVER_HEIGHT, true)}
                  {showBalances && contentReady ? (
                    <AlbumBalances
                      albumId={albumId}
                      group={group}
                      onOpenPerson={(personKey) => onOpenPerson(personKey, albumId)}
                      onOpenPeople={() => onOpenPeople(albumId)}
                    />
                  ) : null}
                  <Text variant="label" tone="muted" style={styles.splitHeading}>
                    {I18n.t('albums.tab_breakdown')}
                  </Text>
                  {contentReady ? breakdownContent : <LoadingDots />}
                </ScrollView>
              </ContentFrameProvider>
            </View>
            <View style={styles.splitPane}>
              <ContentFrameProvider width={splitPaneWidth} height={windowHeight}>
                <Text variant="label" tone="muted" style={styles.splitHeading}>
                  {I18n.t('albums.tab_transactions')}
                </Text>
                <View style={styles.flexOne}>
                  {contentReady ? transactionsContent : <LoadingDots />}
                </View>
              </ContentFrameProvider>
            </View>
          </View>
        ) : (
          <ScrollView
            ref={outerScrollRef}
            showsVerticalScrollIndicator={false}
            stickyHeaderIndices={[1]}
            snapToOffsets={[coverHeight]}
            decelerationRate="fast"
            nestedScrollEnabled
            onScroll={handleOuterScroll}
            scrollEventThrottle={16}
          >
            {coverHero(coverHeight)}

            {/* Sticky tab bar */}
            {tabsBar}

            {/* Full-screen content — horizontal pager: swipe left/right to switch
                tabs, in sync with the sticky tab bar above. */}
            <View
              style={{ height: contentHeight }}
              onLayout={(e) => {
                const width = e.nativeEvent.layout.width;
                if (width > 0 && width !== pageWidth) setPageWidth(width);
              }}
            >
              {!contentReady ? (
                <View className="flex-1 items-center justify-center">
                  <LoadingDots />
                </View>
              ) : (
                <ScrollView
                  ref={pagerRef}
                  horizontal
                  pagingEnabled
                  directionalLockEnabled
                  showsHorizontalScrollIndicator={false}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  scrollEventThrottle={32}
                  onMomentumScrollEnd={handlePagerMomentumEnd}
                >
                  {showBalances ? (
                    <View style={{ width: pageWidth, height: contentHeight }}>
                      <ContentFrameProvider width={pageWidth} height={windowHeight}>
                        {balancesContent}
                      </ContentFrameProvider>
                    </View>
                  ) : null}

                  {/* Breakdown page */}
                  <View style={{ width: pageWidth, height: contentHeight }}>
                    <ContentFrameProvider width={pageWidth} height={windowHeight}>
                      {breakdownContent}
                    </ContentFrameProvider>
                  </View>

                  {/* Transactions page */}
                  <View style={{ width: pageWidth, height: contentHeight }}>
                    <ContentFrameProvider width={pageWidth} height={windowHeight}>
                      {transactionsContent}
                    </ContentFrameProvider>
                  </View>
                </ScrollView>
              )}
            </View>
          </ScrollView>
        )}
        <BulkEditTransactionsSheet
          visible={showBulkUpdate}
          selectedCount={selectedTransactionCount}
          categoryTypes={selectionCategoryTypes}
          onClose={() => setShowBulkUpdate(false)}
          onApply={handleApplyBulkUpdate}
        />
        <DuplicateTransactionsDatePicker
          visible={showDuplicatePicker}
          transactions={duplicableSelectedTransactions}
          onClose={() => setShowDuplicatePicker(false)}
          onDuplicated={handleDuplicated}
        />
      </TabletContentContainer>
    </View>
  );
}

/** Two-pane layout: page padding, the gap between panes, the cover's height. */
const SPLIT_PADDING = 12;
const SPLIT_GAP = 20;
const SPLIT_COVER_HEIGHT = 240;

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  splitRow: {
    flex: 1,
    flexDirection: 'row',
    gap: SPLIT_GAP,
    paddingHorizontal: SPLIT_PADDING,
  },
  splitPane: { flex: 1 },
  splitHeading: {
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 4,
    textTransform: 'uppercase',
  },
});
