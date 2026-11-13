import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, ChevronLeft, Pencil, Plus, Trash2, UserPlus } from 'lucide-react-native';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewInstance,
} from 'react-native';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { EmptyState } from '~/components/feedback/EmptyState';
import { LoadingDots } from '~/components/feedback/LoadingDots';
import { ContentFrameProvider, useContentFrame } from '~/components/layout/ContentFrame';
import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { ADD_FAB_SIZE, AddFabButton } from '~/components/navigation/AddFab';
import { Text } from '~/components/ui';
import { HeroHeaderButton } from '~/components/ui/HeroHeaderButton';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { chartCategoryColor } from '~/constants/chartColors';
import { spacing } from '~/constants/designSystem';
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
import { TransactionSelectionActions } from '~/features/transactions/components/TransactionSelectionToolbar';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { selectDuplicableTransactions } from '~/features/transactions/lib/duplicateTransaction';
import { useSettleUpSummary } from '~/features/transactions/lib/useSettleUpSummary';
import { useSelfPerson } from '~/hooks/useSelfPerson';
import { useThemeColors } from '~/hooks/useThemeColors';
import { useWideTabColumns } from '~/hooks/useWideTabColumns';
import { I18n } from '~/lib/i18n';
import type { RootStackParamList } from '~/navigation/rootStack';
import { triggerHaptic } from '~/services/haptics';
import { pickLibraryImage } from '~/services/libraryImagePicker';
import { deleteAlbumCover, getAlbumCoverUri, saveAlbumCover } from '~/services/userAssets';
import type { CategoryType, TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';
import { formatAmount, formatHours } from '~/utils/formatters';
import { countsAsExpenseRow } from '~/utils/spending';

import { AlbumBalances } from '../components/AlbumBalances';
import { useAlbumGroup } from '../hooks/useAlbumGroup';
import { breakdownMemberOptions, memberShare } from '../lib/memberShare';
import { formatAlbumDateRange } from '../utils';

type DetailTab = 'balances' | 'breakdown' | 'transactions';

/** The bar of controls under the status bar, which the floating chrome becomes. */
const TOP_BAR_HEIGHT = 52;
const TAB_BAR_HEIGHT = 48;
/** Share of the screen the cover photo takes, status bar included. */
const COVER_HEIGHT_RATIO = 0.36;
/** When the push's end is never reported, the content mounts after this long anyway. */
const CONTENT_FALLBACK_MS = 450;
/** The tabs not shown first mount one at a time, this far apart, after it. */
const TAB_MOUNT_STAGGER_MS = 250;
/** How far the tab bar rides up over the photo's bottom, on rounded corners. */
const SHEET_OVERLAP = 22;
/** The scroll distance over which the floating chrome turns into the bar. */
const HEADER_FADE_DISTANCE = 56;
const FAB_BOTTOM_GAP = 12;
/** "Everyone" in the Breakdown's member filter. */
const EVERYONE = 'everyone';

// Stable reference for the pre-ready window so dependent memos don't churn.
const EMPTY_TRANSACTIONS: TransactionWithRelations[] = [];

interface AlbumDetailScreenProps {
  albumId: string;
  onClose: () => void;
  onAddTransactions: (albumId: string) => void;
  onEditDetails: (albumId: string) => void;
  /** Who the album is split with, and its sharing. */
  onOpenPeople: (albumId: string) => void;
  /** Opens a new expense in this album (the floating +). */
  onAddExpense: (albumId: string) => void;
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
  onAddExpense,
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
  const me = useSelfPerson();
  const { width: windowWidth, height: windowHeight } = useContentFrame();
  // iPad and the open Duo: two panes in place of the tabs.
  const wideColumns = useWideTabColumns();
  const isSplit = wideColumns.columns > 1;
  const splitPaneWidth =
    (Math.min(windowWidth, wideColumns.maxWidth ?? windowWidth) - SPLIT_PADDING * 2 - SPLIT_GAP) /
    2;
  const album = albums.find((a) => a.id === albumId);
  // Who the album is split with. With people, once shared, or with a split
  // bill in it, the page has a Balances tab.
  const group = useAlbumGroup(album);
  // An album answers for its own bills.
  const balances = useSettleUpSummary(albumId);
  const showBalances =
    group.available &&
    (group.others.length > 0 || group.share !== null || balances.people.length > 0);
  const tabs = useMemo<DetailTab[]>(
    () =>
      showBalances ? ['transactions', 'breakdown', 'balances'] : ['transactions', 'breakdown'],
    [showBalances],
  );
  const [tab, setTab] = useState<DetailTab>('transactions');
  // The Balances tab going (the last person removed) leaves the page on a tab it still has.
  const shownTab = tabs.includes(tab) ? tab : tabs[0];
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [showDuplicatePicker, setShowDuplicatePicker] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [duplicatePickerUsed, setDuplicatePickerUsed] = useState(false);
  const [bulkSheetUsed, setBulkSheetUsed] = useState(false);
  useEffect(() => {
    if (showDuplicatePicker) setDuplicatePickerUsed(true);
  }, [showDuplicatePicker]);
  useEffect(() => {
    if (showBulkUpdate) setBulkSheetUsed(true);
  }, [showBulkUpdate]);
  const [breakdownMemberKey, setBreakdownMemberKey] = useState(EVERYONE);
  const pagerRef = useRef<ScrollViewInstance | null>(null);
  // Page size drives the pager layout and the tap→scroll math. Seeded with
  // the frame and corrected once the pager measures itself (tablets render
  // narrower than the full window inside TabletContentContainer).
  const [pageWidth, setPageWidth] = useState(windowWidth);
  const [pageHeight, setPageHeight] = useState(windowHeight);
  // Hold the heavy content (the lists, the breakdown donut, the balances) off
  // until the page has slid in, so it never computes and paints on the JS
  // thread during the push: that is what made opening an album feel slow.
  // The cover, controls and tab bar mount at once; the content when the
  // native stack says the transition ended, or after a short wait when it
  // never says so (no animation, the iPad layout).
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [contentReady, setContentReady] = useState(false);
  useEffect(() => {
    if (contentReady) return;
    const ready = () => setContentReady(true);
    const fallback = setTimeout(ready, CONTENT_FALLBACK_MS);
    const unsubscribe = navigation.addListener('transitionEnd', (event) => {
      if (!event.data.closing) ready();
    });
    return () => {
      clearTimeout(fallback);
      unsubscribe();
    };
  }, [contentReady, navigation]);

  // --- The cover header --------------------------------------------------
  // The photo runs to the top edge under the status bar with the controls
  // floating over it, and the tab bar rests on its bottom. Each tab is its own
  // list under that header, padded at the top by its height: as the open
  // tab's list scrolls, the header rides up with it until only the controls'
  // bar and the tabs are left (one scroll, not a photo above a second list).
  const coverHeight = Math.round(windowHeight * COVER_HEIGHT_RATIO);
  const headerBarHeight = insets.top + TOP_BAR_HEIGHT;
  const headerHeight = coverHeight - SHEET_OVERLAP + TAB_BAR_HEIGHT;
  // How far the header moves: until the tab bar meets the controls' bar.
  const collapseDistance = Math.max(1, coverHeight - SHEET_OVERLAP - headerBarHeight);
  const fadeStart = Math.max(0, collapseDistance - HEADER_FADE_DISTANCE);
  // Room for a short tab to scroll the header away too, so it never rests half
  // collapsed and every tab can be brought to the same place.
  const minContentHeight = pageHeight + collapseDistance;
  const fabBottom = insets.bottom + FAB_BOTTOM_GAP;
  const listBottomPadding = fabBottom + ADD_FAB_SIZE + 24;

  // Each tab's scroll offset, read on the UI thread; the open tab's moves the header.
  const transactionsY = useSharedValue(0);
  const breakdownY = useSharedValue(0);
  const balancesY = useSharedValue(0);
  const offsets = useMemo<Record<DetailTab, SharedValue<number>>>(
    () => ({ transactions: transactionsY, breakdown: breakdownY, balances: balancesY }),
    [balancesY, breakdownY, transactionsY],
  );
  const activeTab = useSharedValue<DetailTab>('transactions');
  useEffect(() => {
    activeTab.value = shownTab;
  }, [activeTab, shownTab]);
  const scrollY = useDerivedValue(() => {
    const value = activeTab.value;
    return value === 'transactions'
      ? transactionsY.value
      : value === 'breakdown'
        ? breakdownY.value
        : balancesY.value;
  });
  const headerStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: -interpolate(
          scrollY.value,
          [0, collapseDistance],
          [0, collapseDistance],
          Extrapolation.CLAMP,
        ),
      },
    ],
  }));
  // Pulled down past the top the photo stretches to fill the gap; pushed up
  // it drifts slower than the page.
  const coverImageStyle = useAnimatedStyle(() => {
    const y = scrollY.value;
    if (y < 0) {
      return { transform: [{ translateY: y / 2 }, { scale: 1 + -y / coverHeight }] };
    }
    return { transform: [{ translateY: Math.min(y, collapseDistance) * 0.4 }] };
  });
  const solidHeaderStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [fadeStart, collapseDistance], [0, 1], Extrapolation.CLAMP),
  }));
  const floatingChromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [fadeStart, collapseDistance], [1, 0], Extrapolation.CLAMP),
  }));
  // The tab bar's top corners square off as it docks under the bar.
  const tabBarCornerStyle = useAnimatedStyle(() => {
    const radius = interpolate(
      scrollY.value,
      [fadeStart, collapseDistance],
      [SHEET_OVERLAP, 0],
      Extrapolation.CLAMP,
    );
    return { borderTopLeftRadius: radius, borderTopRightRadius: radius };
  });


  // Mounted only once the content is ready (Balances only with people), so
  // their offsets come from their own scroll handlers.
  const breakdownScrollRef = useAnimatedRef<Animated.ScrollView>();
  const balancesScrollRef = useAnimatedRef<Animated.ScrollView>();
  const onBreakdownScroll = useAnimatedScrollHandler((event) => {
    breakdownY.value = event.contentOffset.y;
  });
  const onBalancesScroll = useAnimatedScrollHandler((event) => {
    balancesY.value = event.contentOffset.y;
  });
  const transactionsIndicatorInsets = useMemo(() => ({ top: headerHeight }), [headerHeight]);
  const transactionsScrollToRef = useRef<((offset: number) => void) | null>(null);
  const scrollTabTo = useCallback(
    (value: DetailTab, offset: number) => {
      if (value === 'transactions') transactionsScrollToRef.current?.(offset);
      else if (value === 'breakdown')
        breakdownScrollRef.current?.scrollTo({ y: offset, animated: false });
      else balancesScrollRef.current?.scrollTo({ y: offset, animated: false });
      offsets[value].value = offset;
    },
    [balancesScrollRef, breakdownScrollRef, offsets],
  );
  // Before another tab shows, bring it to where the header is: with the
  // header part way, to the same offset; collapsed, at least collapsed, so a
  // tab keeps its own place further down.
  const alignTabsToHeader = useCallback(() => {
    const header = Math.min(Math.max(offsets[shownTab].value, 0), collapseDistance);
    for (const value of tabs) {
      if (value === shownTab) continue;
      const current = offsets[value].value;
      const target = header < collapseDistance ? header : Math.max(current, collapseDistance);
      if (Math.abs(current - target) > 0.5) scrollTabTo(value, target);
    }
  }, [collapseDistance, offsets, scrollTabTo, shownTab, tabs]);

  // The open tab mounts with the content; the others follow one at a time,
  // so opening the album renders one list, not three. A tab still waiting
  // mounts at once when it is swiped or tapped to. Each joins the header
  // where it is as it mounts.
  const [mountedTabs, setMountedTabs] = useState<readonly DetailTab[]>([]);
  const mountTabs = useCallback((wanted: readonly DetailTab[]) => {
    setMountedTabs((current) =>
      wanted.every((value) => current.includes(value))
        ? current
        : [...current, ...wanted.filter((value) => !current.includes(value))],
    );
  }, []);
  useEffect(() => {
    if (contentReady) mountTabs([shownTab]);
  }, [contentReady, mountTabs, shownTab]);
  useEffect(() => {
    if (!contentReady || mountedTabs.length === 0) return;
    const next = tabs.find((value) => !mountedTabs.includes(value));
    if (!next) return;
    const timer = setTimeout(() => mountTabs([next]), TAB_MOUNT_STAGGER_MS);
    return () => clearTimeout(timer);
  }, [contentReady, mountTabs, mountedTabs, tabs]);
  useEffect(() => {
    if (mountedTabs.length < 2) return;
    const frame = requestAnimationFrame(alignTabsToHeader);
    return () => cancelAnimationFrame(frame);
    // Only when a tab mounts, not on every change of what aligning reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountedTabs]);

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

  // The entries the Breakdown counts: expenses with a category, as spending.
  const breakdownCandidates = useMemo(
    () =>
      albumTransactions.filter(
        (t) =>
          countsAsExpenseRow(t) &&
          !!t.categoryId &&
          countsTowardSpending(t, settings.reimbursementsCountAsExpense),
      ),
    [albumTransactions, settings.reimbursementsCountAsExpense],
  );
  // With a split bill in the album, the Breakdown can show one person's share.
  const memberOptions = useMemo(
    () =>
      group.available ? breakdownMemberOptions(group.people, breakdownCandidates, me.name) : [],
    [breakdownCandidates, group.available, group.people, me.name],
  );
  const breakdownMember =
    memberOptions.find((option) => option.key === breakdownMemberKey)?.member ?? null;

  // Expense-only breakdown grouped by root category, mirroring the insights
  // breakdown; for one person, each bill counts by their share of it.
  const { breakdownRows, breakdownTransactionsByRoot } = useMemo(() => {
    const totals = new Map<string, BreakdownChartRow>();
    const byRoot = new Map<string, TransactionWithRelations[]>();
    breakdownCandidates.forEach((t) => {
      const cat = t.categoryId ? getCategoryById(t.categoryId) : undefined;
      if (!cat) return;
      let amount = displayValue(t);
      if (breakdownMember) {
        // The share is in the bill's currency: scaled by the entry's own rate.
        const share = memberShare(t, breakdownMember);
        if (share <= 0 || t.amount <= 0) return;
        amount = (amount * share) / t.amount;
      }
      const root = cat.parentId ? getCategoryById(cat.parentId) : cat;
      const id = root?.id ?? cat.id;
      const existing = totals.get(id);
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
  }, [breakdownCandidates, breakdownMember, displayValue, getCategoryById]);

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

  const openPersonHere = useCallback(
    (personKey: string) => onOpenPerson(personKey, albumId),
    [albumId, onOpenPerson],
  );
  const openPeopleHere = useCallback(() => onOpenPeople(albumId), [albumId, onOpenPeople]);

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
    // A shared album's bill leaves its group with it, for everyone.
    const shared = idsToRemove.some((id) => transactionById.get(id)?.albumGroupId === albumId);
    Alert.alert(
      I18n.t('albums.remove_from_album'),
      shared
        ? I18n.t('albums.bill.remove_shared')
        : I18n.t('albums.remove_selected_body', { count: idsToRemove.length }),
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
  }, [albumId, removeTransactionsFromAlbum, selectedTransactionIds, transactionById]);

  // Tap a tab → line the tabs up under the header, then animate the pager to
  // that page (swipe is handled by the pager).
  const selectTab = useCallback(
    (value: DetailTab) => {
      void triggerHaptic('selection');
      alignTabsToHeader();
      setSelectedTransactionIds([]);
      setTab(value);
      const index = Math.max(0, tabs.indexOf(value));
      pagerRef.current?.scrollTo({ x: index * pageWidth, animated: true });
    },
    [alignTabsToHeader, pageWidth, tabs],
  );

  // A swipe can reach a tab still waiting to mount: they all mount now.
  const handlePagerDragBegin = useCallback(() => {
    mountTabs(tabs);
    alignTabsToHeader();
  }, [alignTabsToHeader, mountTabs, tabs]);

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

  // Keep the pager aligned to the active tab when the page width or the set of
  // tabs changes (tablet layout correction, orientation change, Balances coming
  // or going). Not on tab, so tap/swipe transitions aren't interrupted by a
  // snap.
  const activeIndexRef = useRef(0);
  activeIndexRef.current = Math.max(0, tabs.indexOf(shownTab));
  useEffect(() => {
    pagerRef.current?.scrollTo({ x: activeIndexRef.current * pageWidth, animated: false });
  }, [pageWidth, tabs.length]);

  if (!album) {
    return <View className="flex-1 bg-background" />;
  }

  const openPeople = () => {
    void triggerHaptic('selection');
    onOpenPeople(albumId);
  };

  // Who it is split with, over the photo's bottom right.
  const peoplePill = group.available ? (
    <Pressable
      onPress={openPeople}
      accessibilityRole="button"
      accessibilityLabel={I18n.t('albums.people.title')}
      hitSlop={8}
      className={`flex-row items-center rounded-full bg-black/45 py-1 pl-1 ${
        group.others.length > 0 && group.people.length <= 4 ? 'pr-1' : 'pr-2.5'
      }`}
    >
      {group.others.length > 0 ? (
        <>
          {group.people.slice(0, 4).map((person, index) => (
            <View
              key={person.id ?? 'me'}
              style={{ marginLeft: index === 0 ? 0 : -8 }}
              // Opaque behind the user's tinted circle, which otherwise
              // shows the dark cover through it.
              className="rounded-full border-2 border-black/30 bg-card"
            >
              <PersonAvatar
                name={person.name}
                partyKey={person.isSelf ? null : debtPartyKey(person.name)}
                size={24}
                imageUri={person.isSelf ? me.avatarUri : null}
              />
            </View>
          ))}
          {/* Only the people the avatars leave out. */}
          {group.people.length > 4 ? (
            <Text variant="label" className="ml-1.5 text-white">
              +{group.people.length - 4}
            </Text>
          ) : null}
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
  ) : null;

  const coverImage = effectiveCoverUri ? (
    <Image
      {...REPLAY_PRIVATE}
      source={{ uri: effectiveCoverUri }}
      style={StyleSheet.absoluteFill}
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
  );

  const titleBlock = (
    <>
      <Text variant="bodyStrong" numberOfLines={1} className="text-white">
        {album.name}
      </Text>
      {dateRange ? (
        <Text variant="caption" numberOfLines={1} className="mt-0.5 text-white/75">
          {dateRange}
        </Text>
      ) : null}
    </>
  );

  // Whose spending the Breakdown shows, once a bill in it is split.
  const memberFilter =
    memberOptions.length > 0 ? (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.memberChips}
        testID="album-breakdown-members"
      >
        {[
          { key: EVERYONE, name: I18n.t('albums.breakdown_everyone'), avatar: null },
          ...memberOptions.map((option) => ({
            key: option.key,
            name: option.name,
            avatar: (
              <PersonAvatar
                name={option.name}
                partyKey={option.member.kind === 'self' ? null : debtPartyKey(option.name)}
                size={22}
                imageUri={option.member.kind === 'self' ? me.avatarUri : null}
              />
            ),
          })),
        ].map((chip) => {
          const selected =
            chip.key === EVERYONE ? breakdownMember === null : chip.key === breakdownMemberKey;
          return (
            <Pressable
              key={chip.key}
              onPress={() => {
                void triggerHaptic('selection');
                setBreakdownMemberKey(chip.key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={cn(
                'flex-row items-center gap-1.5 rounded-full border py-1',
                chip.avatar ? 'pl-1 pr-3' : 'px-3.5',
                selected ? 'border-primary bg-primary/12' : 'border-border/40 bg-card',
              )}
            >
              {chip.avatar}
              <Text
                variant="label"
                numberOfLines={1}
                className={selected ? 'text-primary' : 'text-muted-foreground'}
              >
                {chip.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    ) : null;

  const breakdownBody = (
    <>
      {memberFilter}
      {breakdownRows.length === 0 ? (
        <EmptyState
          title={I18n.t('albums.no_transactions_title')}
          message={I18n.t('albums.no_transactions_message')}
          mascotMood="curious"
          animateIn={false}
        />
      ) : (
        <View style={{ paddingTop: memberFilter ? 8 : 20 }}>
          <MemoBreakdownChart
            rows={breakdownRows}
            formatValue={formatValue}
            onSelectRow={handleOpenBreakdownRow}
          />
        </View>
      )}
    </>
  );

  const balancesBody = (
    <MemoAlbumBalances
      summary={balances}
      group={group}
      onOpenPerson={openPersonHere}
      onOpenPeople={openPeopleHere}
    />
  );

  const selectionActions = (
    <TransactionSelectionActions
      selectedCount={selectedTransactionCount}
      totalNode={
        <Text variant="label" className="text-foreground">
          {formatValue(selectedTotal)}
        </Text>
      }
      onCancel={clearSelection}
      onDuplicate={
        duplicableSelectedTransactions.length > 0 ? () => setShowDuplicatePicker(true) : undefined
      }
      onEdit={() => setShowBulkUpdate(true)}
      onDelete={handleRemoveSelected}
    />
  );

  const transactionList = (paddingTop: number, phone: boolean) => (
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
      contentPaddingTop={paddingTop}
      contentPaddingBottom={listBottomPadding}
      disableItemAnimations
      compactItems
      {...(phone
        ? {
            scrollOffset: transactionsY,
            scrollToOffsetRef: transactionsScrollToRef,
            minContentHeight,
            scrollIndicatorInsets: transactionsIndicatorInsets,
          }
        : null)}
    />
  );

  const tabLabel = (value: DetailTab) =>
    value === 'balances'
      ? I18n.t('albums.balances.tab')
      : value === 'breakdown'
        ? I18n.t('albums.tab_breakdown')
        : I18n.t('albums.tab_transactions');

  const fab = isSelectionMode ? null : (
    <View pointerEvents="box-none" style={[styles.fab, { bottom: fabBottom }]}>
      <AddFabButton
        onPress={() => onAddExpense(albumId)}
        accessibilityLabel={I18n.t('onboarding.bootstrap.add_transaction')}
      />
    </View>
  );

  // Mounted once first opened (and kept, so they animate closed), not with
  // the page: nobody needs them on the way in.
  const sheets = (
    <>
      {showBulkUpdate || bulkSheetUsed ? (
        <BulkEditTransactionsSheet
          visible={showBulkUpdate}
          selectedCount={selectedTransactionCount}
          categoryTypes={selectionCategoryTypes}
          onClose={() => setShowBulkUpdate(false)}
          onApply={handleApplyBulkUpdate}
        />
      ) : null}
      {showDuplicatePicker || duplicatePickerUsed ? (
        <DuplicateTransactionsDatePicker
          visible={showDuplicatePicker}
          transactions={duplicableSelectedTransactions}
          onClose={() => setShowDuplicatePicker(false)}
          onDuplicated={handleDuplicated}
        />
      ) : null}
    </>
  );

  if (isSplit) {
    // Two panes: the cover, breakdown and balances on the left, the
    // transactions on the right, all showing at once instead of behind tabs.
    const splitIconButton = (onPress: () => void, label: string, icon: React.ReactNode) => (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card"
      >
        {icon}
      </Pressable>
    );
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <TabletContentContainer style={{ flex: 1 }} maxWidth={wideColumns.maxWidth}>
          <View style={{ height: TOP_BAR_HEIGHT }} className="justify-center">
            <View className="flex-row items-center justify-between px-3">
              {splitIconButton(
                onClose,
                I18n.t('common.back'),
                <ChevronLeft size={20} color={themeColors.textMuted} />,
              )}
              <View className="flex-row items-center gap-2">
                {splitIconButton(
                  () => void changeCover(),
                  I18n.t('albums.change_cover'),
                  <Camera size={17} color={themeColors.textMuted} />,
                )}
                {splitIconButton(
                  () => {
                    void triggerHaptic('selection');
                    onEditDetails(albumId);
                  },
                  I18n.t('albums.edit_details_title'),
                  <Pencil size={17} color={themeColors.textMuted} />,
                )}
                {splitIconButton(
                  () => {
                    void triggerHaptic('selection');
                    onAddTransactions(albumId);
                  },
                  I18n.t('albums.add_transactions_title'),
                  <Plus size={19} color={themeColors.textMuted} />,
                )}
                {splitIconButton(
                  handleDelete,
                  I18n.t('common.delete'),
                  <Trash2 size={18} color={themeColors.error} />,
                )}
              </View>
            </View>
          </View>
          <View style={styles.splitRow}>
            <View style={styles.splitPane}>
              <ContentFrameProvider width={splitPaneWidth} height={windowHeight}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: listBottomPadding }}
                >
                  <View style={[styles.splitCover, { height: SPLIT_COVER_HEIGHT }]}>
                    {coverImage}
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.55)']}
                      style={styles.splitTitle}
                    >
                      {titleBlock}
                    </LinearGradient>
                    {peoplePill ? <View style={styles.splitPeople}>{peoplePill}</View> : null}
                  </View>
                  <Text variant="label" tone="muted" style={styles.splitHeading}>
                    {I18n.t('albums.tab_breakdown')}
                  </Text>
                  {contentReady ? breakdownBody : <LoadingDots />}
                  {showBalances && contentReady ? (
                    <>
                      <Text variant="label" tone="muted" style={styles.splitHeading}>
                        {I18n.t('albums.balances.tab')}
                      </Text>
                      {balancesBody}
                    </>
                  ) : null}
                </ScrollView>
              </ContentFrameProvider>
            </View>
            <View style={styles.splitPane}>
              <ContentFrameProvider width={splitPaneWidth} height={windowHeight}>
                <Text variant="label" tone="muted" style={styles.splitHeading}>
                  {I18n.t('albums.tab_transactions')}
                </Text>
                <View style={styles.flexOne}>
                  {contentReady ? (
                    <>
                      {transactionList(4, false)}
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
                  ) : (
                    <LoadingDots />
                  )}
                </View>
              </ContentFrameProvider>
            </View>
          </View>
          {fab}
          {sheets}
        </TabletContentContainer>
      </View>
    );
  }

  const scrollPageProps = {
    showsVerticalScrollIndicator: false,
    nestedScrollEnabled: true,
    scrollEventThrottle: 16,
    contentContainerStyle: {
      paddingTop: headerHeight,
      paddingBottom: listBottomPadding,
      minHeight: minContentHeight,
    },
  } as const;

  const page = (value: DetailTab) => {
    let body: React.ReactNode;
    if (!mountedTabs.includes(value)) {
      body = null;
    } else if (value === 'transactions') {
      body = transactionList(headerHeight + 4, true);
    } else if (value === 'breakdown') {
      body = (
        <Animated.ScrollView
          ref={breakdownScrollRef}
          onScroll={onBreakdownScroll}
          {...scrollPageProps}
        >
          {breakdownBody}
        </Animated.ScrollView>
      );
    } else {
      body = (
        <Animated.ScrollView
          ref={balancesScrollRef}
          onScroll={onBalancesScroll}
          {...scrollPageProps}
        >
          {balancesBody}
        </Animated.ScrollView>
      );
    }
    return (
      <View key={value} style={{ width: pageWidth, height: pageHeight }}>
        <ContentFrameProvider width={pageWidth} height={pageHeight}>
          {body}
        </ContentFrameProvider>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <TabletContentContainer style={{ flex: 1 }} maxWidth={wideColumns.maxWidth}>
        {/* The tabs, side by side: swipe left/right to switch, in sync with
            the tab bar. Each is a full-height list under the header. */}
        <View
          style={StyleSheet.absoluteFill}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            if (width > 0 && width !== pageWidth) setPageWidth(width);
            if (height > 0 && height !== pageHeight) setPageHeight(height);
          }}
        >
          {!contentReady ? (
            <View style={{ paddingTop: headerHeight + 32 }} className="items-center">
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
              onScrollBeginDrag={handlePagerDragBegin}
              onMomentumScrollEnd={handlePagerMomentumEnd}
            >
              {tabs.map(page)}
            </ScrollView>
          )}
        </View>

        {/* The header: the cover photo and the tab bar resting on it. Drags
            on the photo go through to the list below, which is what moves it. */}
        <Animated.View
          pointerEvents="box-none"
          style={[styles.header, { height: headerHeight }, headerStyle]}
        >
          <View
            pointerEvents="box-none"
            style={{ height: coverHeight, overflow: 'hidden' }}
            className="bg-secondary/40"
          >
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, coverImageStyle]}>
              {coverImage}
            </Animated.View>
            {/* The status bar's band is washed with the page background so the
                clock keeps the contrast its colour expects (see the Goal page). */}
            <LinearGradient
              colors={[
                withColorAlpha(themeColors.background, 0.92),
                withColorAlpha(themeColors.background, 0),
              ]}
              style={[styles.statusWash, { height: insets.top + 28 }]}
              pointerEvents="none"
            />
            {/* Title and dates bottom left, fading as the bar takes the name over. */}
            <Animated.View pointerEvents="none" style={[styles.coverTitle, floatingChromeStyle]}>
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.55)']}
                style={{
                  paddingTop: 44,
                  paddingBottom: SHEET_OVERLAP + 12,
                  paddingHorizontal: 20,
                  paddingRight: 140,
                }}
              >
                {titleBlock}
              </LinearGradient>
            </Animated.View>
            {peoplePill ? (
              <View style={[styles.coverPeople, { bottom: SHEET_OVERLAP + 12 }]}>{peoplePill}</View>
            ) : null}
          </View>

          <Animated.View
            style={[styles.tabBar, { height: TAB_BAR_HEIGHT }, tabBarCornerStyle]}
            className="border-b border-border/30 bg-background"
          >
            {isSelectionMode ? (
              // Selecting transactions: the tab bar becomes the selection's
              // bar (as the calendar's header does), clear of the rows being
              // picked and docked with the header as it scrolls.
              <View className="flex-1 flex-row items-center px-4" testID="album-selection-toolbar">
                {selectionActions}
              </View>
            ) : (
              <View className="flex-1 flex-row px-5">
                {tabs.map((value) => {
                  const active = shownTab === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => selectTab(value)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      testID={`album-tab-${value}`}
                      className="mr-6 justify-center"
                    >
                      <Text
                        variant="bodyStrong"
                        className={cn(active ? 'text-primary' : 'text-muted-foreground')}
                      >
                        {tabLabel(value)}
                      </Text>
                      <View
                        className="mt-1.5 h-0.5 rounded-full"
                        style={{ backgroundColor: active ? themeColors.primary : 'transparent' }}
                      />
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Animated.View>
        </Animated.View>

        {/* The bar the floating chrome becomes. */}
        <SolidHeaderBar
          title={album.name}
          scrollY={scrollY}
          fadeStart={fadeStart}
          collapseDistance={collapseDistance}
          style={solidHeaderStyle}
          height={headerBarHeight}
          paddingTop={insets.top}
        />

        <View
          pointerEvents="box-none"
          className="absolute left-3 right-3 flex-row items-center justify-between"
          style={{ top: insets.top + (TOP_BAR_HEIGHT - 40) / 2 }}
        >
          <HeroHeaderButton
            onPress={onClose}
            accessibilityLabel={I18n.t('common.back')}
            floatingStyle={floatingChromeStyle}
            solidStyle={solidHeaderStyle}
            renderIcon={(overPhoto) => (
              <ChevronLeft size={20} color={overPhoto ? '#ffffff' : themeColors.textMuted} />
            )}
          />
          <View className="flex-row items-center gap-2">
            <HeroHeaderButton
              onPress={() => void changeCover()}
              accessibilityLabel={I18n.t('albums.change_cover')}
              floatingStyle={floatingChromeStyle}
              solidStyle={solidHeaderStyle}
              renderIcon={(overPhoto) => (
                <Camera size={17} color={overPhoto ? '#ffffff' : themeColors.textMuted} />
              )}
            />
            <HeroHeaderButton
              onPress={() => {
                void triggerHaptic('selection');
                onEditDetails(albumId);
              }}
              accessibilityLabel={I18n.t('albums.edit_details_title')}
              floatingStyle={floatingChromeStyle}
              solidStyle={solidHeaderStyle}
              renderIcon={(overPhoto) => (
                <Pencil size={17} color={overPhoto ? '#ffffff' : themeColors.textMuted} />
              )}
            />
            <HeroHeaderButton
              onPress={() => {
                void triggerHaptic('selection');
                onAddTransactions(albumId);
              }}
              accessibilityLabel={I18n.t('albums.add_transactions_title')}
              floatingStyle={floatingChromeStyle}
              solidStyle={solidHeaderStyle}
              renderIcon={(overPhoto) => (
                <Plus size={19} color={overPhoto ? '#ffffff' : themeColors.textMuted} />
              )}
            />
            <HeroHeaderButton
              onPress={handleDelete}
              accessibilityLabel={I18n.t('common.delete')}
              floatingStyle={floatingChromeStyle}
              solidStyle={solidHeaderStyle}
              renderIcon={(overPhoto) => (
                <Trash2 size={18} color={overPhoto ? '#ffffff' : themeColors.error} />
              )}
            />
          </View>
        </View>

        {fab}
        {sheets}
      </TabletContentContainer>
    </View>
  );
}

// The page re-renders on every selection, tab and mount; these two keep
// their own work for when their props change.
const MemoBreakdownChart = memo(CategoryBreakdownChart);
const MemoAlbumBalances = memo(AlbumBalances);

/**
 * The solid bar the cover's controls dock into. Once the header is collapsed
 * it takes the touches it covers, so a tap on it never reaches a row scrolled
 * underneath. It holds that state itself: flipping it while scrolling then
 * re-renders this bar alone, not the whole album page with its lists, which
 * stuttered the cover mid-scroll.
 */
const SolidHeaderBar = memo(function SolidHeaderBarImpl({
  title,
  scrollY,
  fadeStart,
  collapseDistance,
  style,
  height,
  paddingTop,
}: {
  title: string;
  scrollY: SharedValue<number>;
  fadeStart: number;
  collapseDistance: number;
  /** Its fade in, read on the UI thread. */
  style: ReturnType<typeof useAnimatedStyle>;
  height: number;
  paddingTop: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  useAnimatedReaction(
    () => scrollY.value >= fadeStart + (collapseDistance - fadeStart) / 2,
    (next, previous) => {
      if (next !== previous) scheduleOnRN(setCollapsed, next);
    },
    [collapseDistance, fadeStart],
  );
  return (
    <Animated.View
      pointerEvents={collapsed ? 'auto' : 'none'}
      className="absolute inset-x-0 top-0 border-b border-border/40 bg-background"
      style={[style, { height, paddingTop }]}
    >
      {/* Beside Back: four controls on the right leave no room to centre it. */}
      <View className="flex-1 justify-center pl-16 pr-[204px]">
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
      </View>
    </Animated.View>
  );
});

/** Two-pane layout: page padding, the gap between panes, the cover's height. */
const SPLIT_PADDING = 12;
const SPLIT_GAP = 20;
const SPLIT_COVER_HEIGHT = 240;

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  header: { position: 'absolute', top: 0, left: 0, right: 0 },
  statusWash: { position: 'absolute', top: 0, left: 0, right: 0 },
  coverTitle: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  coverPeople: { position: 'absolute', right: 16 },
  tabBar: { marginTop: -SHEET_OVERLAP, overflow: 'visible' },
  memberChips: { gap: 8, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  fab: { position: 'absolute', right: spacing.lg, zIndex: 10 },
  splitRow: {
    flex: 1,
    flexDirection: 'row',
    gap: SPLIT_GAP,
    paddingHorizontal: SPLIT_PADDING,
  },
  splitPane: { flex: 1 },
  splitCover: { borderRadius: 20, overflow: 'hidden' },
  splitTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 44,
    paddingBottom: 12,
    paddingHorizontal: 20,
    paddingRight: 140,
  },
  splitPeople: { position: 'absolute', right: 16, bottom: 12 },
  splitHeading: {
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 4,
    textTransform: 'uppercase',
  },
});
