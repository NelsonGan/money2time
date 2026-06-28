import { ChevronLeft } from 'lucide-react-native';
import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  import('../components/AlbumMapView').then((m) => ({ default: m.AlbumMapView })),
);

interface AlbumLocationsScreenProps {
  onClose: () => void;
  onOpenAlbumDetail: (albumId: string) => void;
}

export function AlbumLocationsScreen({ onClose, onOpenAlbumDetail }: AlbumLocationsScreenProps) {
  const { locatedAlbums, getAlbumStats, settings } = useApp();
  const themeColors = useThemeColors();
  const insets = useSafeAreaInsets();

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
          // Default the badge to the album's start month/year (manual override,
          // else first transaction).
          monthLabel: formatAlbumMonthYear(album.startDate ?? stats.startDate),
        };
      }),
    [locatedAlbums, getAlbumStats, isTimeMode, settings],
  );

  useEffect(() => {
    void trackEvent(AnalyticsEvents.ALBUM_LOCATIONS_OPENED, { count: pins.length });
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectAlbum = useCallback(
    (albumId: string) => {
      void trackEvent(AnalyticsEvents.MAP_PIN_TAPPED);
      onOpenAlbumDetail(albumId);
    },
    [onOpenAlbumDetail],
  );

  return (
    <View className="flex-1 bg-background">
      {pins.length === 0 ? (
        <EmptyState
          title={I18n.t('albums.location.empty_title')}
          message={I18n.t('albums.location.empty_message')}
          mascotMood="curious"
        />
      ) : (
        // The native MapLibre module may be missing on a dev client that hasn't
        // been rebuilt — degrade to a message instead of crashing the whole app
        // (the lazy import would otherwise reject past Suspense to the root).
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
      )}

      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={I18n.t('common.back')}
        hitSlop={8}
        className="absolute left-4 h-11 w-11 items-center justify-center rounded-full border border-border/40 bg-card shadow-soft active:opacity-80"
        style={{ top: insets.top + 8 }}
      >
        <ChevronLeft size={22} color={themeColors.text} />
      </Pressable>
    </View>
  );
}
