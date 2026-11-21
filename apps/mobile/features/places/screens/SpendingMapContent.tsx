import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Maximize2,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import type MapView from 'react-native-maps';
import type { Region } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '~/components/feedback/EmptyState';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { Text } from '~/components/ui/text';
import { useApp, useTransactions } from '~/context/AppContext';
import { countsTowardSpending } from '~/features/reimbursements/lib/reimbursementMath';
import { ActivityTransactionList } from '~/features/transactions/components/ActivityTransactionList';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { triggerHaptic } from '~/services/haptics';
import type { TransactionWithRelations } from '~/types';
import { cn } from '~/utils';
import { monthCycleOf } from '~/utils/financialMonth';
import { formatAmount, formatHoursCompact } from '~/utils/formatters';

import { AppMap } from '../components/AppMap';
import { type PlaceStat, PlaceStats } from '../components/PlaceStats';
import { PlaceClusterPin, PlacePricePin } from '../components/SpendingMapPins';
import { fitMapToPoints } from '../lib/fitMap';
import {
  inPeriod,
  isLatestPeriod,
  isMapTransaction,
  type MapPeriod,
  type MapPeriodKind,
  periodLabel,
  placeTotals,
  shiftPeriod,
} from '../lib/mapPeriod';
import {
  CLUSTER_MAX_ZOOM,
  createPlaceClusterer,
  longitudeDeltaForZoom,
  type MapRegion,
  type PlaceMarker,
  zoomForRegion,
} from '../lib/placeClusters';
import { placeCategoryIcon } from '../lib/placeIcons';
import { groupByPlace, type PlaceGroup, regionFor } from '../lib/placeLocation';

type Group = PlaceGroup<TransactionWithRelations>;

/** Green only for money in: a place whose entries all count for nothing (left-out reimbursements) is neither. */
function isIncomeOnly(totals: { spent: number; earned: number } | undefined): boolean {
  return !!totals && totals.spent === 0 && totals.earned > 0;
}

type Selection = { kind: 'place'; key: string } | { kind: 'cluster'; keys: string[] } | null;

const WORLD_REGION: MapRegion = {
  latitude: 15,
  longitude: 100,
  latitudeDelta: 60,
  longitudeDelta: 60,
};

interface SpendingMapContentProps {
  onBack: () => void;
  onOpenTransaction: (transaction: TransactionWithRelations) => void;
  onOpenLocationSettings: () => void;
}

/**
 * The spending map (README: Transaction locations): every tagged entry of a
 * month, a year or all time, one price tag per place, merged into a bubble
 * where places crowd at the current zoom. Tapping a place lists what was
 * spent there; tapping a bubble zooms in, or lists its places once it cannot.
 */
export function SpendingMapContent({
  onBack,
  onOpenTransaction,
  onOpenLocationSettings,
}: SpendingMapContentProps) {
  const { transactions } = useTransactions();
  const { settings, getDisplayValueForTransaction, getTrueHourlyRateForDate } = useApp();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const mapRef = useRef<MapView>(null);
  const locale = I18n.locale;
  const isTime = settings.displayMode === 'time';
  const monthCycle = useMemo(() => monthCycleOf(settings), [settings]);

  const [period, setPeriod] = useState<MapPeriod>({ kind: 'month', anchor: new Date() });
  const [selection, setSelection] = useState<Selection>(null);

  const located = useMemo(
    () => transactions.filter((tx) => isMapTransaction(tx) && tx.latitude !== null),
    [transactions],
  );
  const groups = useMemo(
    () => groupByPlace(located.filter((tx) => inPeriod(tx.date, period, monthCycle))),
    [located, period, monthCycle],
  );
  const groupByKey = useMemo(() => new Map(groups.map((g) => [g.key, g])), [groups]);

  // Money in the main currency (frozen at save for a foreign entry), or hours.
  const valueOf = useCallback(
    (tx: TransactionWithRelations) =>
      isTime ? getDisplayValueForTransaction(tx) : (tx.reportingAmount ?? tx.amount),
    [isTime, getDisplayValueForTransaction],
  );
  // Like every other total: reimbursements count only when the user says so.
  const countsAsMoney = useCallback(
    (tx: TransactionWithRelations) =>
      countsTowardSpending(tx, settings.reimbursementsCountAsExpense),
    [settings.reimbursementsCountAsExpense],
  );
  const hoursOf = useCallback(
    (tx: TransactionWithRelations) => {
      const rate = getTrueHourlyRateForDate(tx.date);
      return rate > 0 ? Math.abs(tx.reportingAmount ?? tx.amount) / rate : 0;
    },
    [getTrueHourlyRateForDate],
  );
  const formatValue = useCallback(
    (value: number, compact: boolean) =>
      isTime
        ? formatHoursCompact(value, settings)
        : formatAmount(value, settings, { showSign: false, compact }),
    [isTime, settings],
  );

  const totalsByKey = useMemo(() => {
    const map = new Map<string, ReturnType<typeof placeTotals>>();
    for (const group of groups) {
      map.set(group.key, placeTotals(group.transactions, valueOf, countsAsMoney));
    }
    return map;
  }, [groups, valueOf, countsAsMoney]);

  const fitRegion = useMemo(
    () => regionFor(groups, { padding: 1.5, minDelta: 0.02 }) ?? WORLD_REGION,
    [groups],
  );
  const [region, setRegion] = useState<MapRegion>(fitRegion);
  const clusterer = useMemo(() => createPlaceClusterer(groups), [groups]);
  const markers = useMemo(() => clusterer(region, width), [clusterer, region, width]);

  const panelHeight = Math.round(height * (selection ? 0.46 : 0.3));
  const topInset = insets.top + 112;

  const mapPadding = useMemo(
    () => ({ top: topInset, right: 0, bottom: panelHeight, left: 0 }),
    [topInset, panelHeight],
  );
  const fitAll = useCallback(
    (animated: boolean) =>
      fitMapToPoints(mapRef.current, groups, {
        minDelta: 0.02,
        margin: { top: 24, right: 48, bottom: 24, left: 48 },
        mapPadding,
        animated,
      }),
    [groups, mapPadding],
  );

  // A fit closes the place panel first and frames the places once the panel
  // is back to its own height; read with the taller place panel, the places
  // would end up framed too small.
  const [fitRequest, setFitRequest] = useState<{ animated: boolean } | null>(null);
  const requestFit = useCallback((animated: boolean) => {
    setSelection(null);
    setFitRequest({ animated });
  }, []);
  useEffect(() => {
    if (!fitRequest || selection) return;
    fitAll(fitRequest.animated);
    setFitRequest(null);
  }, [fitRequest, selection, fitAll]);

  // A new period re-frames the map around its places.
  useEffect(() => {
    requestFit(true);
  }, [period, requestFit]);

  useEffect(() => {
    void trackEvent(AnalyticsEvents.SPENDING_MAP_OPENED, { count: groups.length });
    // Once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedGroups: Group[] = useMemo(() => {
    if (!selection) return [];
    if (selection.kind === 'place') {
      const group = groupByKey.get(selection.key);
      return group ? [group] : [];
    }
    return selection.keys.map((key) => groupByKey.get(key)).filter((g): g is Group => Boolean(g));
  }, [selection, groupByKey]);

  // A place that left the period (or was deleted) closes its panel.
  useEffect(() => {
    if (selection && selectedGroups.length === 0) setSelection(null);
  }, [selection, selectedGroups.length]);

  const handleMarkerPress = useCallback(
    (marker: PlaceMarker<TransactionWithRelations>) => {
      void triggerHaptic('selection');
      if (marker.kind === 'place') {
        setSelection({ kind: 'place', key: marker.key });
        return;
      }
      // A bubble zooms in to where it splits; places at one point never split
      // (Supercluster answers past its maxZoom), so those list instead.
      if (marker.expansionZoom <= CLUSTER_MAX_ZOOM) {
        // A level past where it splits, so rounding never leaves it merged.
        const delta = longitudeDeltaForZoom(
          Math.max(marker.expansionZoom + 1, zoomForRegion(region, width) + 1),
          width,
        );
        mapRef.current?.animateToRegion(
          {
            latitude: marker.latitude,
            longitude: marker.longitude,
            latitudeDelta: delta,
            longitudeDelta: delta,
          },
          350,
        );
        return;
      }
      setSelection({ kind: 'cluster', keys: marker.groups.map((g) => g.key) });
    },
    [region, width],
  );

  const selectPlace = useCallback(
    (group: Group) => {
      void triggerHaptic('selection');
      setSelection({ kind: 'place', key: group.key });
      mapRef.current?.animateToRegion(
        {
          latitude: group.latitude,
          longitude: group.longitude,
          latitudeDelta: Math.min(region.latitudeDelta, 0.03),
          longitudeDelta: Math.min(region.longitudeDelta, 0.03),
        },
        350,
      );
    },
    [region.latitudeDelta, region.longitudeDelta],
  );

  // A bubble shows what was spent at its places, or the income of an
  // income-only bubble, in green.
  const clusterLook = (clustered: readonly { key: string }[]) => {
    const totals = { spent: 0, earned: 0 };
    for (const { key } of clustered) {
      totals.spent += totalsByKey.get(key)?.spent ?? 0;
      totals.earned += totalsByKey.get(key)?.earned ?? 0;
    }
    const value = totals.spent > 0 ? totals.spent : totals.earned;
    return { label: formatValue(value, value >= 1000), income: isIncomeOnly(totals) };
  };

  const pinLabel = (key: string) => {
    const totals = totalsByKey.get(key);
    if (!totals) return '';
    const value = totals.spent > 0 ? totals.spent : totals.earned;
    // Short form only where it saves room: "RM18.50", but "RM1.2K".
    return formatValue(value, value >= 1000);
  };

  // Visits, then the money (spent, or earned where nothing was spent), then
  // the hours of work it cost; time mode already shows hours as the money.
  const statsFor = (txs: readonly TransactionWithRelations[]): PlaceStat[] => {
    const totals = placeTotals(txs, valueOf, countsAsMoney);
    const hours = txs.reduce(
      (sum, tx) => sum + (tx.type === 'expense' && countsAsMoney(tx) ? hoursOf(tx) : 0),
      0,
    );
    const stats: PlaceStat[] = [
      {
        key: 'visits',
        icon: CalendarDays,
        value: String(totals.visits),
        label: I18n.t(
          totals.visits === 1 ? 'locations.map_stat_visits_one' : 'locations.map_stat_visits_other',
        ),
      },
    ];
    if (totals.spent > 0 || totals.earned === 0)
      stats.push({
        key: 'spent',
        value: formatValue(totals.spent, totals.spent >= 100_000),
        label: I18n.t('locations.map_stat_spent'),
        tone: 'primary',
      });
    if (totals.earned > 0)
      stats.push({
        key: 'earned',
        value: `+${formatValue(totals.earned, totals.earned >= 100_000)}`,
        label: I18n.t('locations.map_stat_earned'),
        tone: 'success',
      });
    if (!isTime && hours > 0)
      stats.push({
        key: 'work',
        icon: Clock,
        value: formatHoursCompact(hours, settings),
        label: I18n.t('locations.map_stat_work'),
      });
    return stats;
  };

  const kinds: MapPeriodKind[] = ['month', 'year', 'all'];
  const periodText = periodLabel(period, locale, I18n.t('locations.map_all_time'), monthCycle);
  const latest = isLatestPeriod(period, monthCycle);
  const anyLocated = located.length > 0;

  const renderPlaceRow = (group: Group) => {
    const Icon = placeCategoryIcon(group.category);
    const totals = totalsByKey.get(group.key);
    return (
      <Pressable
        key={group.key}
        onPress={() => selectPlace(group)}
        accessibilityRole="button"
        accessibilityLabel={group.name}
        className="flex-row items-center gap-3 rounded-2xl bg-secondary/40 px-3 py-2.5 active:opacity-70"
      >
        <View className="h-9 w-9 items-center justify-center rounded-full bg-card">
          <Icon size={17} color={themeColors.primary} />
        </View>
        <View className="min-w-0 flex-1">
          <Text variant="bodyStrong" numberOfLines={1}>
            {group.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {I18n.t(
              group.transactions.length === 1
                ? 'locations.map_visits_one'
                : 'locations.map_visits_other',
              { count: group.transactions.length },
            )}
            {group.address ? ` · ${group.address}` : ''}
          </Text>
        </View>
        <Text
          variant="bodyStrong"
          tone={isIncomeOnly(totals) ? 'success' : totals && totals.spent > 0 ? 'primary' : 'muted'}
        >
          {pinLabel(group.key)}
        </Text>
      </Pressable>
    );
  };

  const panel = (() => {
    if (selection && selectedGroups.length === 1) {
      const group = selectedGroups[0] as Group;
      const PlaceIcon = placeCategoryIcon(group.category);
      return (
        <View className="flex-1">
          <View className="flex-row items-center gap-3 px-5 pt-4">
            <View className="h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <PlaceIcon size={22} color={themeColors.primary} />
            </View>
            <View className="min-w-0 flex-1">
              <Text variant="headingSm" numberOfLines={1}>
                {group.name}
              </Text>
              {group.address ? (
                <View className="flex-row items-center gap-1">
                  <MapPin size={13} color={themeColors.textMuted} />
                  <Text variant="caption" tone="muted" numberOfLines={1} className="shrink">
                    {group.address}
                  </Text>
                </View>
              ) : null}
            </View>
            <Pressable
              onPress={() => setSelection(null)}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.close')}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
            >
              <X size={18} color={themeColors.textMuted} />
            </Pressable>
          </View>
          <View className="px-4 pb-1 pt-3">
            <PlaceStats stats={statsFor(group.transactions)} />
          </View>
          <View className="flex-1">
            <ActivityTransactionList
              transactions={group.transactions}
              displaySettings={settings}
              getDisplayValueForTransaction={getDisplayValueForTransaction}
              getTrueHourlyRateForDate={getTrueHourlyRateForDate}
              reimbursementsCountAsExpense={settings.reimbursementsCountAsExpense}
              onTransactionPress={onOpenTransaction}
              emptyTitle={I18n.t('locations.map_empty_title')}
              emptyMessage={I18n.t('locations.map_empty_message')}
              contentPaddingTop={0}
              contentPaddingBottom={insets.bottom + 16}
              locale={locale}
              // The same rows as the Calendar, without the accent strip.
              compactItems
              disableItemAnimations
            />
          </View>
        </View>
      );
    }
    const list = selection ? selectedGroups : groups;
    if (list.length === 0) {
      return (
        <View className="flex-1 justify-center px-5">
          <EmptyState
            compact
            title={I18n.t(
              anyLocated ? 'locations.map_empty_period_title' : 'locations.map_empty_title',
            )}
            message={
              settings.transactionLocationsEnabled
                ? I18n.t('locations.map_empty_message')
                : I18n.t('locations.map_disabled_message')
            }
            mascotMood="curious"
            action={
              settings.transactionLocationsEnabled
                ? undefined
                : { label: I18n.t('locations.map_turn_on'), onPress: onOpenLocationSettings }
            }
          />
        </View>
      );
    }
    const all = list.flatMap((g) => g.transactions);
    return (
      <View className="flex-1">
        <View className="flex-row items-start gap-2 px-5 pb-2 pt-4">
          <View className="min-w-0 flex-1">
            <Text variant="subheading" numberOfLines={1}>
              {I18n.t(
                list.length === 1 ? 'locations.map_places_one' : 'locations.map_places_other',
                {
                  count: list.length,
                },
              )}
            </Text>
          </View>
          {selection ? (
            <Pressable
              onPress={() => setSelection(null)}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.close')}
              hitSlop={8}
              className="h-9 w-9 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
            >
              <X size={18} color={themeColors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <View className="px-4 pb-2">
          <PlaceStats stats={statsFor(all)} />
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 16,
            gap: 6,
          }}
          showsVerticalScrollIndicator={false}
        >
          {list.map(renderPlaceRow)}
        </ScrollView>
      </View>
    );
  })();

  const selectedKeys = new Set(selectedGroups.map((g) => g.key));

  return (
    <View className="flex-1 bg-background">
      {/* Where the user spends is their location history. */}
      <View className="flex-1" {...REPLAY_PRIVATE}>
        <AppMap
          ref={mapRef}
          initialRegion={fitRegion}
          mapPadding={mapPadding}
          onRegionChangeComplete={(next: Region) => setRegion(next)}
          onPress={() => setSelection(null)}
          onMapReady={() => fitAll(false)}
        >
          {markers.map((marker) =>
            marker.kind === 'place' ? (
              <PlacePricePin
                key={marker.key}
                id={marker.key}
                latitude={marker.latitude}
                longitude={marker.longitude}
                label={pinLabel(marker.key)}
                income={isIncomeOnly(totalsByKey.get(marker.key))}
                selected={selectedKeys.has(marker.key) && selection?.kind === 'place'}
                accessibilityLabel={`${marker.group.name}, ${pinLabel(marker.key)}`}
                onPress={() => handleMarkerPress(marker)}
              />
            ) : (
              <PlaceClusterPin
                key={marker.key}
                id={marker.key}
                latitude={marker.latitude}
                longitude={marker.longitude}
                count={marker.count}
                {...clusterLook(marker.groups)}
                selected={
                  selection?.kind === 'cluster' &&
                  marker.groups.some((g) => selectedKeys.has(g.key))
                }
                accessibilityLabel={I18n.t('locations.map_places_other', {
                  count: marker.groups.length,
                })}
                onPress={() => handleMarkerPress(marker)}
              />
            ),
          )}
        </AppMap>
      </View>

      {/* Floating header: back, the period, and its length. */}
      <View
        pointerEvents="box-none"
        className="absolute left-0 right-0 top-0 px-4"
        style={{ paddingTop: insets.top + 8 }}
      >
        <View pointerEvents="box-none" className="flex-row items-center gap-2">
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.back')}
            className="h-11 w-11 items-center justify-center rounded-full border border-border/40 bg-card shadow-soft active:opacity-80"
          >
            <ChevronLeft size={20} color={themeColors.text} />
          </Pressable>
          <View className="h-11 flex-1 flex-row items-center justify-between rounded-full border border-border/40 bg-card px-1.5 shadow-soft">
            <Pressable
              onPress={() => setPeriod((p) => shiftPeriod(p, -1, monthCycle))}
              disabled={period.kind === 'all'}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('locations.map_previous')}
              hitSlop={6}
              className={cn(
                'h-8 w-8 items-center justify-center rounded-full',
                period.kind === 'all' && 'opacity-0',
              )}
            >
              <ChevronLeft size={18} color={themeColors.textMuted} />
            </Pressable>
            <Text variant="bodyStrong" numberOfLines={1} className="shrink">
              {periodText}
            </Text>
            <Pressable
              onPress={() => setPeriod((p) => shiftPeriod(p, 1, monthCycle))}
              disabled={latest}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('locations.map_next')}
              hitSlop={6}
              className={cn(
                'h-8 w-8 items-center justify-center rounded-full',
                latest && 'opacity-0',
              )}
            >
              <ChevronRight size={18} color={themeColors.textMuted} />
            </Pressable>
          </View>
          <View className="w-11" />
        </View>
        <View pointerEvents="box-none" className="mt-2 items-center">
          <View className="flex-row rounded-full border border-border/40 bg-card p-1 shadow-soft">
            {kinds.map((kind) => {
              const active = period.kind === kind;
              return (
                <Pressable
                  key={kind}
                  onPress={() => {
                    if (active) return;
                    void triggerHaptic('selection');
                    setPeriod({ kind, anchor: new Date() });
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  className={cn('rounded-full px-4 py-1.5', active && 'bg-primary')}
                >
                  <Text
                    variant="caption"
                    className={cn(
                      'font-semibold',
                      active ? 'text-primary-foreground' : 'text-foreground',
                    )}
                  >
                    {I18n.t(`locations.map_period_${kind}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {groups.length > 0 ? (
        <Pressable
          onPress={() => {
            void triggerHaptic('selection');
            requestFit(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={I18n.t('locations.map_fit')}
          className="absolute right-4 h-11 w-11 items-center justify-center rounded-full border border-border/40 bg-card shadow-soft active:opacity-80"
          style={{ bottom: panelHeight + 12 }}
        >
          <Maximize2 size={18} color={themeColors.text} />
        </Pressable>
      ) : null}

      <View
        className="absolute bottom-0 left-0 right-0 rounded-t-[28px] border-t border-border/30 bg-card shadow-soft"
        style={{ height: panelHeight }}
        {...REPLAY_PRIVATE}
      >
        <View className="items-center pt-2">
          <View className="h-1 w-10 rounded-full bg-border/70" />
        </View>
        {panel}
      </View>
    </View>
  );
}
