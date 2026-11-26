import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArchiveRestore,
  Camera,
  ChevronDown,
  ChevronLeft,
  Info,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react-native';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type {
  AlertButton,
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
import { ImportingOverlay } from '~/components/feedback/ImportingOverlay';
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
import { CategoryBreakdownChart } from '~/features/insights/components';
import type { InsightsDrilldownPayload } from '~/features/insights/screens';
import { countsTowardSpending } from '~/features/reimbursements/lib/reimbursementMath';
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
import { useSelfPerson } from '~/hooks/useSelfPerson';
import { useThemeColors } from '~/hooks/useThemeColors';
import { useWideTabColumns } from '~/hooks/useWideTabColumns';
import { I18n } from '~/lib/i18n';
import { albumGroupsRepository } from '~/lib/repositories/albumGroupsRepository';
import type { RootStackParamList } from '~/navigation/rootStack';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import { pickLibraryImage } from '~/services/libraryImagePicker';
import { deleteAlbumCover, getAlbumCoverUri, saveAlbumCover } from '~/services/userAssets';
import type { CategoryType, TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { withColorAlpha } from '~/utils/color';
import { formatAmount, formatHours } from '~/utils/formatters';
import { countsAsExpenseRow } from '~/utils/spending';

import { AlbumActivity } from '../components/AlbumActivity';
import { AlbumBalances } from '../components/AlbumBalances';
import {
  type BreakdownMemberChoice,
  BreakdownMemberSheet,
} from '../components/BreakdownMemberSheet';
import { useAlbumCategories } from '../hooks/useAlbumCategories';
import { useAlbumGroup } from '../hooks/useAlbumGroup';
import { useRemoveFromAlbum } from '../hooks/useRemoveFromAlbum';
import { albumBillSides, AlbumBillSidesContext } from '../lib/albumBillSides';
import { albumCategoryRows } from '../lib/albumBreakdown';
import { albumCategoryKeyOfId, albumCategoryPickerList } from '../lib/albumCategories';
import { albumSharingMessage } from '../lib/albumMessages';
import { breakdownMemberOptions, memberShare } from '../lib/memberShare';
import {
  listGroupActivity,
  listGroupExpenses,
  subscribeAlbumGroups,
} from '../services/albumGroupStore';
import { letGoOfSharedAlbum } from '../services/letGoOfSharedAlbum';
import { formatAlbumDateRange } from '../utils';

type DetailTab = 'balances' | 'breakdown' | 'transactions';

/** The bar of controls under the status bar, which the floating chrome becomes. */
const TOP_BAR_HEIGHT = 52;
const TAB_BAR_HEIGHT = 48;
/** Share of the screen the cover photo takes, status bar included. */
const COVER_HEIGHT_RATIO = 0.36;
/** When the push's end is never reported, the other tabs mount after this long anyway. */
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

interface AlbumDetailScreenProps {
  albumId: string;
  onClose: () => void;
  onAddTransactions: (albumId: string) => void;
  onEditDetails: (albumId: string) => void;
  /** Who the album is split with, and its sharing. */
  onOpenPeople: (albumId: string) => void;
  /** Opens a new expense in this album (the floating +). */
  onAddExpense: (albumId: string) => void;
  /** A person's page, with only this album's bills (and only `currency`'s, when given). */
  onOpenPerson: (personKey: string, albumId: string, currency?: string) => void;
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
    categories,
    quickEntryPrefs,
    getCategoryById,
    getDisplayValueForTransaction,
    getTrueHourlyRateForDate,
    deleteAlbum,
    archiveAlbum,
    updateAlbum,
    updateTransactionsBulk,
    setGroupEntriesAccount,
    editGroupBills,
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
  // Who the album is split with. A shared album has a Balances tab: it
  // answers for its own bills (an album of the user's own settles its split
  // bills on the Balances page).
  const group = useAlbumGroup(album);
  const showBalances = group.available;
  const tabs = useMemo<DetailTab[]>(
    () =>
      showBalances ? ['transactions', 'breakdown', 'balances'] : ['transactions', 'breakdown'],
    [showBalances],
  );
  // A shared album's activity log sits under its Balances.
  const showActivity = group.share !== null;
  // A shared album's bills, for its Transactions tab's rows: who paid each
  // and what it is to the user (README: Shared albums > Transactions tab).
  const sharedBills = useSyncExternalStore(subscribeAlbumGroups, () =>
    listGroupExpenses(group.share ? group.share.ledgerId : null),
  );
  // Only once the user is on its list: before that every bill would read "Not
  // involved". Names come from every member row, so a bill keeps the name of
  // someone who left.
  const billSides = useMemo(
    () =>
      group.share && group.self
        ? albumBillSides(
            sharedBills,
            albumGroupsRepository.listAllMembers(group.share.ledgerId),
            group.self.id,
          )
        : null,
    // The members and the language: the rows are written out in it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group.share, group.members, group.self, sharedBills, I18n.locale],
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
  const [showMemberSheet, setShowMemberSheet] = useState(false);
  const pagerRef = useRef<ScrollViewInstance | null>(null);
  // Page size drives the pager layout and the tap→scroll math. Seeded with
  // the frame and corrected once the pager measures itself (tablets render
  // narrower than the full window inside TabletContentContainer).
  const [pageWidth, setPageWidth] = useState(windowWidth);
  const [pageHeight, setPageHeight] = useState(windowHeight);
  // The album's entries are already in memory, so the open tab's list shows
  // with the page, never behind a loading state. Only the tabs not shown
  // (the breakdown donut, the balances) wait until the page has slid in, so
  // they never compute and paint on the JS thread during the push: when the
  // native stack says the transition ended, or after a short wait when it
  // never says so (no animation).
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
    () => ({
      transactions: transactionsY,
      breakdown: breakdownY,
      balances: balancesY,
    }),
    [balancesY, breakdownY, transactionsY],
  );
  // Opening a shared album's Balances, with its activity log, once per visit.
  const activityOpenedRef = useRef(false);
  useEffect(() => {
    if (shownTab !== 'balances' || !showActivity || activityOpenedRef.current) return;
    activityOpenedRef.current = true;
    void trackEvent(AnalyticsEvents.ALBUM_ACTIVITY_OPENED, {
      entries: listGroupActivity(albumId).length,
    });
  }, [albumId, showActivity, shownTab]);
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

  // Mounted once the page has slid in (Balances only with people), so
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

  // The open tab mounts with the page; the others follow one at a time once
  // it has slid in, so opening the album renders one list, not three. A tab
  // still waiting mounts at once when it is swiped or tapped to. Each joins
  // the header where it is as it mounts.
  const [mountedTabs, setMountedTabs] = useState<readonly DetailTab[]>(['transactions']);
  const mountTabs = useCallback((wanted: readonly DetailTab[]) => {
    setMountedTabs((current) =>
      wanted.every((value) => current.includes(value))
        ? current
        : [...current, ...wanted.filter((value) => !current.includes(value))],
    );
  }, []);
  useEffect(() => {
    mountTabs([shownTab]);
  }, [mountTabs, shownTab]);
  useEffect(() => {
    if (!contentReady) return;
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
  // `getAlbumTransactions` reads the loaded list through refs and keeps one
  // identity, so `albums` (which entries are in it) and `transactions` (the
  // rows themselves, optimistic ones included) are what tell this memo that
  // something it shows changed.
  const albumTransactions = useMemo(
    () => getAlbumTransactions(albumId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    [getAlbumTransactions, albumId, albums, transactions],
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

  // The entries the Breakdown counts: expenses, as spending (those with no
  // category on a row of their own), as the album's line in Insights.
  const breakdownCandidates = useMemo(
    () =>
      albumTransactions.filter(
        (t) =>
          countsAsExpenseRow(t) && countsTowardSpending(t, settings.reimbursementsCountAsExpense),
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
  // Whose spending the Breakdown shows, once a bill in it is split: one line
  // that opens a sheet of the choices, however many people the album has.
  const memberChoices = useMemo<BreakdownMemberChoice[]>(
    () =>
      memberOptions.length === 0
        ? []
        : [
            {
              key: EVERYONE,
              name: I18n.t('albums.breakdown_everyone'),
              icon: (
                <View className="h-7 w-7 items-center justify-center rounded-full bg-primary/15">
                  <Users size={15} color={themeColors.primary} />
                </View>
              ),
            },
            ...memberOptions.map((option) => ({
              key: option.key,
              name: option.name,
              icon: (
                <PersonAvatar
                  name={option.name}
                  partyKey={option.member.kind === 'self' ? null : debtPartyKey(option.name)}
                  size={28}
                  imageUri={option.member.kind === 'self' ? me.avatarUri : null}
                />
              ),
            })),
          ],
    [me.avatarUri, memberOptions, themeColors.primary],
  );
  const selectBreakdownMember = useCallback((key: string) => {
    setBreakdownMemberKey(key);
    setShowMemberSheet(false);
  }, []);
  const closeMemberSheet = useCallback(() => setShowMemberSheet(false), []);

  // Expense-only breakdown, mirroring the insights breakdown: a shared
  // album by its own categories, the same for everyone in it; an album of
  // the user's own by their root categories. For one person, each bill
  // counts by their share of it.
  // A shared album, or one the user is no longer in, by its own categories.
  const byAlbumCategory = group.share !== null || !!album?.shareEndedAt;
  // A shared album's entries are filed under its own categories.
  const groupCategories = useAlbumCategories(group.share ? albumId : null);
  const albumCategoryOptions = useMemo(
    () => (group.share ? albumCategoryPickerList(groupCategories) : undefined),
    [group.share, groupCategories],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const breakdownRows = useMemo(
    () =>
      albumCategoryRows(breakdownCandidates, {
        valueOf: (t) => {
          const amount = displayValue(t);
          if (!breakdownMember) return amount;
          // The share is in the bill's currency: scaled by the entry's own rate.
          const share = memberShare(t, breakdownMember);
          return share > 0 && t.amount > 0 ? (amount * share) / t.amount : null;
        },
        categories,
        categoryById,
        categoryMap: quickEntryPrefs.categoryMap,
        byAlbumCategory,
        albumCategories: group.share ? groupCategories : undefined,
      }),
    [
      breakdownCandidates,
      breakdownMember,
      categories,
      categoryById,
      displayValue,
      byAlbumCategory,
      group.share,
      groupCategories,
      quickEntryPrefs.categoryMap,
    ],
  );

  // Drill into a breakdown category exactly like the insights expense breakdown:
  // parents open their subcategories, leaves open their transactions.
  const handleOpenBreakdownRow = useCallback(
    (rowId: string) => {
      const index = breakdownRows.findIndex((row) => row.id === rowId);
      if (index === -1) return;
      const row = breakdownRows[index];
      const rootCategory = row.categoryRootId ? getCategoryById(row.categoryRootId) : undefined;
      onOpenBreakdown({
        label: row.label,
        transactionIds: row.transactions.map((t) => t.id),
        categoryRootId: rootCategory?.id,
        categoryRootLabel: rootCategory?.name ?? row.label,
        categoryRootEmoji: rootCategory?.icon ?? row.emoji,
        categoryRootColor: chartCategoryColor(index),
        albumId,
      });
    },
    [albumId, breakdownRows, getCategoryById, onOpenBreakdown],
  );

  const openPersonHere = useCallback(
    (personKey: string, currency?: string) => onOpenPerson(personKey, albumId, currency),
    [albumId, onOpenPerson],
  );

  const formatValue = useCallback(
    (amount: number) =>
      isTimeMode
        ? formatHours(amount, settings)
        : formatAmount(amount, settings, { showSign: false }),
    [isTimeMode, settings],
  );

  const dateRange = formatAlbumDateRange(stats.startDate, stats.endDate);

  // Deleting keeps the album's entries, back under their own categories
  // (README: Album members and shared albums > Deleting). A shared album is
  // let go first: a member leaves it, its owner ends it for everyone, and the
  // others keep it. One the user is no longer in only goes from here.
  const share = group.share;
  const othersJoined = group.people.some((person) => !person.isSelf && person.joined);
  // Leaving or ending can take a few seconds (the group's latest comes down
  // first): the page says so and takes no second delete meanwhile.
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const deleteShared = useCallback(async () => {
    if (!share || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      if (!(await letGoOfSharedAlbum(sync, { id: albumId, name: album?.name ?? '' }, share.role))) {
        return;
      }
      // Let go, whatever a list read in flight saved again since.
      if (deleteAlbum(albumId, { leftShare: true })) onDeleted();
    } catch (error) {
      Alert.alert(albumSharingMessage(error));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }, [album?.name, albumId, deleteAlbum, onDeleted, share, sync]);

  const handleDelete = useCallback(() => {
    void triggerHaptic('warning');
    const body = share
      ? share.role === 'member'
        ? I18n.t('albums.delete_body_member')
        : othersJoined
          ? I18n.t('albums.delete_body_owner')
          : I18n.t('albums.delete_body')
      : album?.shareEndedAt
        ? I18n.t('albums.delete_body_ended')
        : I18n.t('albums.delete_body');
    const buttons: AlertButton[] = [{ text: I18n.t('common.cancel'), style: 'cancel' }];
    // Archived already (as an album the user is no longer in always is).
    if (!album?.archivedAt) {
      buttons.push({
        text: I18n.t('albums.archive.action'),
        onPress: () => archiveAlbum(albumId, true),
      });
    }
    buttons.push({
      text: I18n.t('common.delete'),
      style: 'destructive',
      onPress: () => {
        if (share) {
          void deleteShared();
          return;
        }
        if (deleteAlbum(albumId)) onDeleted();
      },
    });
    Alert.alert(I18n.t('albums.delete_title'), body, buttons);
  }, [
    album?.archivedAt,
    album?.shareEndedAt,
    albumId,
    archiveAlbum,
    deleteAlbum,
    deleteShared,
    onDeleted,
    othersJoined,
    share,
  ]);

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
        kind: 'cover',
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
  // A shared album takes no entries made elsewhere: only bills made in it,
  // split with its members (README: Album members and shared albums). So no
  // picking existing transactions, and no copies of its bills.
  // A shared album the user is no longer in is kept as it was: read-only.
  const isFrozen = !!album?.shareEndedAt;
  const isArchived = !!album?.archivedAt;
  const takesExisting = group.share === null && !isFrozen;
  // Archived: entries are added once it is back (Unarchive), as with its +.
  const addsExisting = takesExisting && !isArchived;
  const duplicableSelectedTransactions = useMemo(
    () =>
      addsExisting ? selectDuplicableTransactions(albumTransactions, selectedTransactionIds) : [],
    [addsExisting, albumTransactions, selectedTransactionIds],
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
      // Nothing in an album no longer shared is taken out or changed together.
      if (isFrozen) return;
      if (isSelectionMode) {
        toggleSelection(transaction.id);
        return;
      }
      void triggerHaptic('selection');
      setSelectedTransactionIds([transaction.id]);
    },
    [isFrozen, isSelectionMode, toggleSelection],
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
      // A shared album's bills: their account is the user's own, on this phone;
      // their day, title and category (one of the album's) are the group's,
      // changed for everyone.
      const { accountId, ...rest } = changes;
      if (accountId) setGroupEntriesAccount(selectedTransactionIds, accountId);
      const { bills: groupBills } = editGroupBills(selectedTransactionIds, {
        date: rest.date,
        note: rest.note,
        category: albumCategoryKeyOfId(rest.expenseCategoryId) ?? undefined,
      });
      const updates = buildBulkUpdateInputs(
        selectedTransactionIds,
        rest,
        (id) => transactionById.get(id)?.type,
      ).filter(({ id }) => !groupBills.has(id));
      if (updates.length > 0) updateTransactionsBulk(updates);
      void triggerHaptic('success');
      setShowBulkUpdate(false);
      setSelectedTransactionIds([]);
    },
    [
      editGroupBills,
      selectedTransactionIds,
      setGroupEntriesAccount,
      transactionById,
      updateTransactionsBulk,
    ],
  );
  // Asked first, whoever's entries they are: a shared album's bill leaves its
  // group with it, for everyone.
  const removeFromAlbum = useRemoveFromAlbum(albumId, { confirm: true });
  const handleRemoveSelected = useCallback(() => {
    if (selectedTransactionIds.length === 0) return;
    removeFromAlbum([...selectedTransactionIds], clearSelection);
  }, [clearSelection, removeFromAlbum, selectedTransactionIds]);
  const openDuplicatePicker = useCallback(() => setShowDuplicatePicker(true), []);
  const openBulkUpdate = useCallback(() => setShowBulkUpdate(true), []);

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

  // What state the album is in, beside its people: no longer shared (what
  // that means, on a tap), or archived (bring it back).
  const statePill = isFrozen ? (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        Alert.alert(I18n.t('albums.ended.title'), I18n.t('albums.ended.body'));
      }}
      accessibilityRole="button"
      accessibilityLabel={I18n.t('albums.ended.title')}
      hitSlop={8}
      className="flex-row items-center gap-1.5 rounded-full bg-black/45 py-1.5 pl-2 pr-2.5"
    >
      <Info size={14} color="#ffffff" />
      <Text variant="label" className="text-white">
        {I18n.t('albums.ended.label')}
      </Text>
    </Pressable>
  ) : isArchived ? (
    <Pressable
      onPress={() => {
        void triggerHaptic('success');
        archiveAlbum(albumId, false);
      }}
      accessibilityRole="button"
      accessibilityLabel={I18n.t('albums.archive.unarchive')}
      hitSlop={8}
      className="flex-row items-center gap-1.5 rounded-full bg-black/45 py-1.5 pl-2 pr-2.5"
    >
      <ArchiveRestore size={14} color="#ffffff" />
      <Text variant="label" className="text-white">
        {I18n.t('albums.archive.unarchive')}
      </Text>
    </Pressable>
  ) : null;
  const coverPills =
    statePill || peoplePill ? (
      <View className="flex-row items-center gap-2">
        {statePill}
        {peoplePill}
      </View>
    ) : null;
  // An album no longer shared says so on its pill alone.
  const statusLabel = isArchived && !isFrozen ? I18n.t('albums.archive.label') : null;

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
      {dateRange || statusLabel ? (
        <Text variant="caption" numberOfLines={1} className="mt-0.5 text-white/75">
          {[dateRange, statusLabel].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </>
  );

  const shownChoice =
    memberChoices.find((choice) => choice.key === breakdownMemberKey) ?? memberChoices[0];
  const memberFilter = shownChoice ? (
    <Pressable
      onPress={() => {
        void triggerHaptic('selection');
        setShowMemberSheet(true);
      }}
      accessibilityRole="button"
      accessibilityLabel={`${I18n.t('albums.breakdown_showing')}: ${shownChoice.name}`}
      testID="album-breakdown-members"
      className="mx-5 mt-4 h-12 flex-row items-center gap-2.5 rounded-2xl border border-border/40 bg-card px-4 active:opacity-80"
    >
      <Text variant="body" tone="muted">
        {I18n.t('albums.breakdown_showing')}
      </Text>
      {shownChoice.icon}
      <Text variant="bodyStrong" numberOfLines={1} className="flex-1">
        {shownChoice.name}
      </Text>
      <ChevronDown size={18} color={themeColors.textMuted} />
    </Pressable>
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
        <View style={{ paddingTop: memberFilter ? 12 : 20 }}>
          <MemoBreakdownChart
            rows={breakdownRows}
            formatValue={formatValue}
            onSelectRow={handleOpenBreakdownRow}
          />
        </View>
      )}
    </>
  );

  // A shared album's activity log follows its balances: who changed what.
  const balancesBody = (
    <>
      <MemoAlbumBalances albumId={albumId} group={group} onOpenPerson={openPersonHere} />
      {showActivity ? <MemoAlbumActivity group={group} /> : null}
    </>
  );

  // The selection's controls: in the tab bar on a phone, a toolbar under
  // the list in two panes.
  const selectionProps = {
    selectedCount: selectedTransactionCount,
    totalNode: (
      <Text variant="label" className="text-foreground">
        {formatValue(selectedTotal)}
      </Text>
    ),
    onCancel: clearSelection,
    onDuplicate: duplicableSelectedTransactions.length > 0 ? openDuplicatePicker : undefined,
    onEdit: openBulkUpdate,
    onDelete: handleRemoveSelected,
  };

  const transactionList = (paddingTop: number, phone: boolean) => (
    <AlbumBillSidesContext.Provider value={billSides}>
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
    </AlbumBillSidesContext.Provider>
  );

  const tabLabel = (value: DetailTab) =>
    value === 'balances'
      ? I18n.t('albums.balances.tab')
      : value === 'breakdown'
        ? I18n.t('albums.tab_breakdown')
        : I18n.t('albums.tab_transactions');

  // An archived album takes no new entries until it is brought back.
  const fab =
    isSelectionMode || isArchived || isFrozen ? null : (
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
      {memberChoices.length > 0 ? (
        <MemoBreakdownMemberSheet
          visible={showMemberSheet}
          choices={memberChoices}
          selectedKey={shownChoice?.key ?? EVERYONE}
          onSelect={selectBreakdownMember}
          onClose={closeMemberSheet}
        />
      ) : null}
      {showBulkUpdate || bulkSheetUsed ? (
        <BulkEditTransactionsSheet
          visible={showBulkUpdate}
          selectedCount={selectedTransactionCount}
          categoryTypes={selectionCategoryTypes}
          // The account is offered for a shared album's own bills only.
          offerAccount={
            group.share !== null &&
            selectedTransactionIds.every((id) => !!transactionById.get(id)?.albumGroupId)
          }
          expenseCategories={albumCategoryOptions}
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
      <ImportingOverlay visible={deleting} title={I18n.t('albums.deleting')} mascot="thinking" />
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
                {isFrozen
                  ? null
                  : splitIconButton(
                      () => void changeCover(),
                      I18n.t('albums.change_cover'),
                      <Camera size={17} color={themeColors.textMuted} />,
                    )}
                {isFrozen
                  ? null
                  : splitIconButton(
                      () => {
                        void triggerHaptic('selection');
                        onEditDetails(albumId);
                      },
                      I18n.t('albums.edit_details_title'),
                      <Pencil size={17} color={themeColors.textMuted} />,
                    )}
                {addsExisting
                  ? splitIconButton(
                      () => {
                        void triggerHaptic('selection');
                        onAddTransactions(albumId);
                      },
                      I18n.t('albums.add_transactions_title'),
                      <Plus size={19} color={themeColors.textMuted} />,
                    )
                  : null}
                {/* The last header button: every album is deleted from here,
                    with Archive offered beside Delete. */}
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
                    {coverPills ? <View style={styles.splitPeople}>{coverPills}</View> : null}
                  </View>
                  <Text variant="label" tone="muted" style={styles.splitHeading}>
                    {I18n.t('albums.tab_breakdown')}
                  </Text>
                  {/* Like the phone's other tabs, after the page has slid in. */}
                  {contentReady ? breakdownBody : null}
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
                  {transactionList(4, false)}
                  {isSelectionMode ? <TransactionSelectionToolbar {...selectionProps} /> : null}
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
            {coverPills ? (
              <View style={[styles.coverPeople, { bottom: SHEET_OVERLAP + 12 }]}>{coverPills}</View>
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
                <TransactionSelectionActions {...selectionProps} />
              </View>
            ) : (
              // The labels run long in some languages (Swedish "Mellanhavanden"):
              // they shrink to fit a narrow phone instead of running off it.
              // `minimumFontScale` is iOS only: Android keeps shrinking (Swedish
              // still reads at about 60% on a 270 dp screen).
              <View className="flex-1 flex-row gap-6 px-5">
                {tabs.map((value) => {
                  const active = shownTab === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => selectTab(value)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      testID={`album-tab-${value}`}
                      className="shrink justify-center"
                    >
                      <Text
                        variant="bodyStrong"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
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
            {isFrozen ? null : (
              <HeroHeaderButton
                onPress={() => void changeCover()}
                accessibilityLabel={I18n.t('albums.change_cover')}
                floatingStyle={floatingChromeStyle}
                solidStyle={solidHeaderStyle}
                renderIcon={(overPhoto) => (
                  <Camera size={17} color={overPhoto ? '#ffffff' : themeColors.textMuted} />
                )}
              />
            )}
            {isFrozen ? null : (
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
            )}
            {addsExisting ? (
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
            ) : null}
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

// The page re-renders on every selection, tab and mount; these keep their
// own work for when their props change.
const MemoBreakdownChart = memo(CategoryBreakdownChart);
const MemoBreakdownMemberSheet = memo(BreakdownMemberSheet);
const MemoAlbumBalances = memo(AlbumBalances);
const MemoAlbumActivity = memo(AlbumActivity);

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
