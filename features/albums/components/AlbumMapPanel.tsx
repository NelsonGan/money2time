import { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppErrorBoundary } from '~/components/feedback/AppErrorBoundary';
import { EmptyState } from '~/components/feedback/EmptyState';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { AnalyticsEvents, trackEvent } from '~/services/analytics';
import { getAlbumCoverUri } from '~/services/userAssets';
import { formatAmount, formatHoursCompact } from '~/utils/formatters';

import { type AlbumPin, formatAlbumMonthYear } from '../utils';

// MapLibre is a native module; lazy-load it so the rest of the app keeps working
// on a dev client that hasn't been rebuilt with the native pod yet.
const AlbumMapView = lazy(() =>
  import('./AlbumMapView').then((m) => ({ default: m.AlbumMapView })),
);

interface AlbumMapPanelProps {
  onOpenAlbumDetail: (albumId: string) => void;
  /** True while this panel is the visible tab — gates the analytics event. */
  active: boolean;
  /**
   * Height of the screen's floating header. The map is deliberately full-bleed
   * underneath it, but the fallbacks are text and have to start below it or the
   * mascot sits under the tab bar.
   */
  headerHeight?: number;
}

/**
 * The album locations map, rendered inside the Albums screen's Map tab. Holds
 * the pins/empty/suspense/error-boundary chrome so both the map itself and its
 * degraded fallbacks live in one place.
 */
export function AlbumMapPanel({ onOpenAlbumDetail, active, headerHeight = 0 }: AlbumMapPanelProps) {
  const { locatedAlbums, getAlbumStats, settings } = useApp();
  const themeColors = useThemeColors();

  const isTimeMode = settings.displayMode === 'time';

  // MapLibre is a large native+JS module. Importing it (via the lazy
  // AlbumMapView below) synchronously evaluates its module graph on the JS
  // thread — a multi-second hit with real data. The albums tab is pre-mounted
  // in the background during cold start, so touching the map here would block
  // startup even though the map tab is not visible. Latch on first activation
  // and only build pins / mount the map once the user actually opens the Map
  // tab, keeping the whole map subsystem off the cold-start path.
  const hasActivatedRef = useRef(active);
  if (active) hasActivatedRef.current = true;
  const shouldRenderMap = hasActivatedRef.current;

  const pins = useMemo<AlbumPin[]>(() => {
    if (!shouldRenderMap) return [];
    return locatedAlbums.map((album) => {
      const stats = getAlbumStats(album.id);
      return {
        albumId: album.id,
        name: album.name,
        latitude: album.latitude,
        longitude: album.longitude,
        coverUri: getAlbumCoverUri(album.coverPhotoUri),
        spendLabel: isTimeMode
          ? formatHoursCompact(stats.totalSpent)
          : formatAmount(stats.totalSpent, settings, { showSign: false, compact: true }),
        // Default the badge to the album's start month/year. stats.startDate
        // already resolves the manual override, else the first transaction.
        monthLabel: formatAlbumMonthYear(stats.startDate),
      };
    });
  }, [shouldRenderMap, locatedAlbums, getAlbumStats, isTimeMode, settings]);

  useEffect(() => {
    if (!active) return;
    void trackEvent(AnalyticsEvents.ALBUM_LOCATIONS_OPENED, { count: pins.length });
    // Fire once per activation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const handleSelectAlbum = useCallback(
    (albumId: string) => {
      void trackEvent(AnalyticsEvents.MAP_PIN_TAPPED);
      onOpenAlbumDetail(albumId);
    },
    [onOpenAlbumDetail],
  );

  // Until the Map tab has been opened, render nothing heavy — this keeps the
  // lazy MapLibre import (and the per-album stat queries) off the cold-start
  // preload path. A plain View is enough for the hidden, pre-mounted tab.
  if (!shouldRenderMap) {
    return <View className="flex-1" />;
  }

  if (pins.length === 0) {
    // Same wrapper as the Albums tab's own empty state, so the two line up
    // instead of one starting under the floating header.
    return (
      <View className="flex-1" style={{ paddingTop: headerHeight }}>
        <EmptyState
          title={I18n.t('albums.location.empty_title')}
          message={I18n.t('albums.location.empty_message')}
          mascotMood="curious"
        />
      </View>
    );
  }

  return (
    // The native MapLibre module may be missing on a dev client that hasn't been
    // rebuilt — degrade to a message instead of crashing the whole app (the lazy
    // import would otherwise reject past Suspense to the root).
    <AppErrorBoundary
      fallback={
        <View className="flex-1" style={{ paddingTop: headerHeight }}>
          <EmptyState
            title={I18n.t('errors.data_load_failed_title')}
            message={I18n.t('errors.generic_operation_failed')}
            mascotMood="thinking"
          />
        </View>
      }
    >
      <Suspense
        fallback={
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={themeColors.primary} />
          </View>
        }
      >
        <AlbumMapView pins={pins} onSelectAlbum={handleSelectAlbum} />
      </Suspense>
    </AppErrorBoundary>
  );
}
