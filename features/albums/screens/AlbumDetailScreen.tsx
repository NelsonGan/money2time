import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Alert, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import {
  type BreakdownChartRow,
  CategoryBreakdownChart,
  INSIGHTS_CHART_COLORS,
} from '~/features/insights/components';
import type { InsightsDrilldownPayload } from '~/features/insights/screens';
import {
  buildBulkUpdateInputs,
  BulkEditTransactionsSheet,
  type BulkTransactionChanges,
  TransactionSelectionToolbar,
} from '~/features/transactions/components';
import { ActivityTransactionList } from '~/features/transactions/components/ActivityTransactionList';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { deleteAlbumCover, getAlbumCoverUri, saveAlbumCover } from '~/services/userAssets';
import type { CategoryType, TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { getErrorMessage } from '~/utils/errorHandling';
import { formatAmount, formatHours } from '~/utils/formatters';

import { formatAlbumDateRange } from '../utils';

type DetailTab = 'breakdown' | 'transactions';

const TOP_BAR_HEIGHT = 52;
const TAB_BAR_HEIGHT = 48;

interface AlbumDetailScreenProps {
  albumId: string;
  onClose: () => void;
  onEditTransactions: (albumId: string) => void;
  onAddTransactions: (albumId: string) => void;
  onEditDetails: (albumId: string) => void;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  onOpenBreakdown: (payload: InsightsDrilldownPayload) => void;
  onDeleted: () => void;
}

export function AlbumDetailScreen({
  albumId,
  onClose,
  onEditTransactions,
  onAddTransactions,
  onEditDetails,
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
  } = useApp();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [tab, setTab] = useState<DetailTab>('breakdown');
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<string[]>([]);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const pagerRef = useRef<ScrollView | null>(null);
  // Page width drives both the pager layout and the tap→scroll math. Seeded with
  // the window width and corrected once the pager measures itself (tablets render
  // narrower than the full window inside TabletContentContainer).
  const [pageWidth, setPageWidth] = useState(windowWidth);

  const album = albums.find((a) => a.id === albumId);
  // `albums` is included so membership/stat edits (which trigger a full reload)
  // recompute these immediately when returning to this screen.
  const stats = useMemo(() => getAlbumStats(albumId), [getAlbumStats, albumId, albums]);
  const albumTransactions = useMemo(
    () => getAlbumTransactions(albumId),
    [getAlbumTransactions, albumId, albums],
  );
  const coverUri = useMemo(() => getAlbumCoverUri(album?.coverPhotoUri), [album?.coverPhotoUri]);
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
      if (t.type !== 'expense' || !t.categoryId) return;
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
  }, [albumTransactions, displayValue, getCategoryById]);

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
        categoryRootColor: INSIGHTS_CHART_COLORS[index % INSIGHTS_CHART_COLORS.length],
        albumId,
      });
    },
    [albumId, breakdownRows, breakdownTransactionsByRoot, getCategoryById, onOpenBreakdown],
  );

  const formatValue = useCallback(
    (amount: number) =>
      isTimeMode ? formatHours(amount) : formatAmount(amount, settings, { showSign: false }),
    [isTimeMode, settings],
  );

  const dateRange = formatAlbumDateRange(stats.startDate, stats.endDate);

  const handleDelete = useCallback(() => {
    void triggerHaptic('warning');
    Alert.alert(I18n.t('albums.delete_title'), I18n.t('albums.delete_body'), [
      { text: I18n.t('common.cancel'), style: 'cancel' },
      {
        text: I18n.t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteAlbum(albumId);
          onDeleted();
        },
      },
    ]);
  }, [albumId, deleteAlbum, onDeleted]);

  const changeCover = useCallback(async () => {
    void triggerHaptic('selection');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(I18n.t('albums.cover_permission_title'), I18n.t('albums.cover_permission_body'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 2],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    try {
      const previous = album?.coverPhotoUri ?? null;
      const relativePath = saveAlbumCover(result.assets[0].uri);
      updateAlbum(albumId, { coverPhotoUri: relativePath });
      if (previous) deleteAlbumCover(previous);
    } catch (error) {
      Alert.alert(I18n.t('errors.generic_operation_failed'), getErrorMessage(error));
    }
  }, [album?.coverPhotoUri, albumId, updateAlbum]);

  // --- Transactions tab multi-select ---
  const isSelectionMode = selectedTransactionIds.length > 0;
  const selectedTransactionCount = selectedTransactionIds.length;
  const transactionById = useMemo(
    () => new Map(albumTransactions.map((t) => [t.id, t])),
    [albumTransactions],
  );
  const clearSelection = useCallback(() => setSelectedTransactionIds([]), []);
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

  // Tap a tab → animate the pager to that page (swipe is handled by the pager).
  const selectTab = useCallback(
    (value: DetailTab) => {
      void triggerHaptic('selection');
      setSelectedTransactionIds([]);
      setTab(value);
      const index = value === 'transactions' ? 1 : 0;
      pagerRef.current?.scrollTo({ x: index * pageWidth, animated: true });
    },
    [pageWidth],
  );

  // Swipe settles on a page → sync the active tab and clear any selection.
  const handlePagerMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const index = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, pageWidth));
      const value: DetailTab = index === 1 ? 'transactions' : 'breakdown';
      if (value === tab) return;
      void triggerHaptic('selection');
      setSelectedTransactionIds([]);
      setTab(value);
    },
    [pageWidth, tab],
  );

  // Keep the pager aligned to the active tab when the page width changes
  // (tablet layout correction, orientation change). Re-aligning on width only —
  // not on tab — so tap/swipe transitions aren't interrupted by a snap.
  const activeTabRef = useRef(tab);
  activeTabRef.current = tab;
  useEffect(() => {
    if (activeTabRef.current !== 'transactions') return;
    pagerRef.current?.scrollTo({ x: pageWidth, animated: false });
  }, [pageWidth]);

  if (!album) {
    return <View className="flex-1 bg-background" />;
  }

  const coverHeight = Math.round(windowHeight * 0.3);
  const contentHeight = Math.max(260, windowHeight - insets.top - TOP_BAR_HEIGHT - TAB_BAR_HEIGHT);

  const tabsBar = (
    <View
      className="flex-row border-b border-border/30 bg-background px-5"
      style={{ height: TAB_BAR_HEIGHT }}
    >
      {(
        [
          { value: 'breakdown', label: I18n.t('albums.tab_breakdown') },
          { value: 'transactions', label: I18n.t('albums.tab_transactions') },
        ] as const
      ).map((option) => {
        const active = tab === option.value;
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
  );

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <TabletContentContainer style={{ flex: 1 }}>
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
                  onEditTransactions(albumId);
                }}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('albums.edit_transactions_title')}
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

        <ScrollView
          showsVerticalScrollIndicator={false}
          stickyHeaderIndices={[1]}
          snapToOffsets={[coverHeight]}
          decelerationRate="fast"
          nestedScrollEnabled
        >
          {/* Cover hero */}
          <View style={{ height: coverHeight }} className="bg-secondary/40">
            {coverUri ? (
              <Image
                source={{ uri: coverUri }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={120}
              />
            ) : (
              <View className="flex-1 items-center justify-center bg-primary/15">
                <Text variant="display" tone="muted">
                  {album.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
            )}

            {/* Change cover photo */}
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
                alignItems: 'center',
              }}
            >
              <Pressable
                onPress={() => {
                  void triggerHaptic('selection');
                  onEditDetails(albumId);
                }}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('albums.edit_details_title')}
                className="flex-row items-center gap-1.5"
              >
                <Text variant="bodyStrong" numberOfLines={1} className="text-white">
                  {album.name}
                </Text>
                {dateRange ? (
                  <Text variant="caption" numberOfLines={1} className="text-white/75">
                    {`· ${dateRange}`}
                  </Text>
                ) : null}
                <Pencil size={13} color="rgba(255,255,255,0.85)" />
              </Pressable>
            </LinearGradient>
          </View>

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
              {/* Breakdown page */}
              <View style={{ width: pageWidth, height: contentHeight }}>
                {breakdownRows.length === 0 ? (
                  <View className="flex-1 items-center justify-center px-8">
                    <Text variant="body" tone="muted" className="text-center">
                      {I18n.t('albums.no_expenses')}
                    </Text>
                  </View>
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
                )}
              </View>

              {/* Transactions page */}
              <View style={{ width: pageWidth, height: contentHeight }}>
                <ActivityTransactionList
                  transactions={albumTransactions}
                  displaySettings={settings}
                  getDisplayValueForTransaction={getDisplayValueForTransaction}
                  getTrueHourlyRateForDate={getTrueHourlyRateForDate}
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
                    onEdit={() => setShowBulkUpdate(true)}
                    onDelete={handleRemoveSelected}
                  />
                ) : null}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
        <BulkEditTransactionsSheet
          visible={showBulkUpdate}
          selectedCount={selectedTransactionCount}
          categoryTypes={selectionCategoryTypes}
          onClose={() => setShowBulkUpdate(false)}
          onApply={handleApplyBulkUpdate}
        />
      </TabletContentContainer>
    </View>
  );
}
