import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';
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
}

/**
 * The album locations map, rendered inside the Albums screen's Map tab. Holds
 * the pins/empty/suspense/error-boundary chrome so both the map itself and its
 * degraded fallbacks live in one place.
 */
export function AlbumMapPanel({ onOpenAlbumDetail, active }: AlbumMapPanelProps) {
  const { locatedAlbums, getAlbumStats, settings } = useApp();
  const themeColors = useThemeColors();

  const isTimeMode = settings.displayMode === 'time';

  const pins = useMemo<AlbumPin[]>(
    () =>
      locatedAlbums.map((album) => {
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
      }),
    [locatedAlbums, getAlbumStats, isTimeMode, settings],
  );

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

  if (pins.length === 0) {
    return (
      <EmptyState
        title={I18n.t('albums.location.empty_title')}
        message={I18n.t('albums.location.empty_message')}
        mascotMood="curious"
      />
    );
  }

  return (
    // The native MapLibre module may be missing on a dev client that hasn't been
    // rebuilt — degrade to a message instead of crashing the whole app (the lazy
    // import would otherwise reject past Suspense to the root).
    <AppErrorBoundary
      fallback={
        <EmptyState
          title={I18n.t('errors.data_load_failed_title')}
          message={I18n.t('errors.generic_operation_failed')}
          mascotMood="thinking"
        />
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
