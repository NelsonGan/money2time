import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, ChevronLeft, Pencil, Plus, Trash2 } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { type BreakdownChartRow, CategoryBreakdownChart } from '~/features/insights/components';
import { ActivityTransactionList } from '~/features/transactions/components/ActivityTransactionList';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { deleteAlbumCover, getAlbumCoverUri, saveAlbumCover } from '~/services/userAssets';
import type { TransactionWithRelations } from '~/types';
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
  onDeleted: () => void;
}

export function AlbumDetailScreen({
  albumId,
  onClose,
  onEditTransactions,
  onAddTransactions,
  onEditDetails,
  onOpenTransaction,
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
  } = useApp();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [tab, setTab] = useState<DetailTab>('breakdown');

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
  const breakdownRows = useMemo<BreakdownChartRow[]>(() => {
    const totals = new Map<string, BreakdownChartRow>();
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
    });
    return [...totals.values()].sort((a, b) => b.amount - a.amount);
  }, [albumTransactions, displayValue, getCategoryById]);

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
            onPress={() => {
              void triggerHaptic('selection');
              setTab(option.value);
            }}
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

          {/* Full-screen content */}
          <View style={{ height: contentHeight }}>
            {tab === 'breakdown' ? (
              breakdownRows.length === 0 ? (
                <View className="flex-1 items-center justify-center px-8">
                  <Text variant="body" tone="muted" className="text-center">
                    {I18n.t('albums.no_expenses')}
                  </Text>
                </View>
              ) : (
                <ScrollView
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingTop: 0, paddingBottom: insets.bottom + 32 }}
                >
                  <CategoryBreakdownChart rows={breakdownRows} formatValue={formatValue} />
                </ScrollView>
              )
            ) : (
              <ActivityTransactionList
                transactions={albumTransactions}
                displaySettings={settings}
                getDisplayValueForTransaction={getDisplayValueForTransaction}
                getTrueHourlyRateForDate={getTrueHourlyRateForDate}
                onTransactionPress={onOpenTransaction}
                emptyTitle={I18n.t('albums.no_transactions_title')}
                emptyMessage={I18n.t('albums.no_transactions_message')}
                contentPaddingBottom={insets.bottom + 32}
                disableItemAnimations
                compactItems
              />
            )}
          </View>
        </ScrollView>
      </TabletContentContainer>
    </View>
  );
}
