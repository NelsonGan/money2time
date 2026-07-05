import { Image } from 'expo-image';
import { Menu } from 'lucide-react-native';
import { memo, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { Text, TimeValueInline } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { usePressScale } from '~/hooks/usePressScale';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { getAlbumCoverUri } from '~/services/userAssets';
import type { Album } from '~/types';
import { formatAmount, formatHours } from '~/utils/formatters';

import { AlbumActiveDot } from './AlbumActiveDot';
import { formatAlbumDateRange } from '../utils';

interface AlbumCardProps {
  album: Album;
  width: number;
  isActive: boolean;
  onPress: (albumId: string) => void;
}

export const AlbumCard = memo(function AlbumCard({
  album,
  width,
  isActive,
  onPress,
}: AlbumCardProps) {
  const { settings, getAlbumStats } = useApp();
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.96 });

  // Depend on the album object (a fresh reference after each data reload) so the
  // total/date range recompute when the album's transactions change.
  const stats = useMemo(() => getAlbumStats(album.id), [getAlbumStats, album]);
  const coverUri = useMemo(() => getAlbumCoverUri(album.coverPhotoUri), [album.coverPhotoUri]);
  const dateRange = formatAlbumDateRange(stats.startDate, stats.endDate, { alwaysShowYear: true });
  const isTimeMode = settings.displayMode === 'time';

  // Full-width 2:1 banner.
  const coverHeight = Math.round(width * 0.5);
  const metaLabel =
    dateRange ?? I18n.t('albums.transaction_count', { count: stats.transactionCount });

  return (
    <Animated.View style={[animatedStyle, { width }]}>
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          onPress(album.id);
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={album.name}
        className="overflow-hidden rounded-3xl border border-border/40 shadow-soft"
        style={{ height: coverHeight }}
      >
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

        {/* Bottom scrim with title + amount + meta overlaid on the cover. */}
        <View
          className="absolute inset-x-0 bottom-0 px-4 pb-3 pt-5"
          style={{ backgroundColor: 'rgba(0,0,0,0.52)' }}
        >
          <Text variant="caption" numberOfLines={1} className="text-white/80">
            {album.name}
          </Text>
          <View className="mt-0.5 flex-row items-end justify-between gap-2">
            {isTimeMode ? (
              <TimeValueInline
                value={formatHours(stats.totalSpent)}
                variant="subheading"
                textClassName="text-white"
                iconColor="#fff"
                iconSize={16}
                numberOfLines={1}
              />
            ) : (
              <Text variant="subheading" numberOfLines={1} className="text-white">
                {formatAmount(stats.totalSpent, settings, { showSign: false })}
              </Text>
            )}
            <Text variant="label" numberOfLines={1} className="shrink text-white/70">
              {metaLabel}
            </Text>
          </View>
        </View>
      </Pressable>

      {/* Active marker — small blinking green dot pinned to the top-right. */}
      {isActive ? (
        <View className="absolute right-3 top-3" pointerEvents="none">
          <AlbumActiveDot />
        </View>
      ) : null}

      {/* Handle must be a sibling of the Pressable — nesting it inside lets the
          Pressable swallow the touch so the drag gesture never activates. The
          absolute wrapper pins it inside the card's top-left corner. */}
      <View className="absolute left-3 top-3" pointerEvents="box-none">
        <Sortable.Handle>
          <View
            accessible
            accessibilityRole="button"
            accessibilityLabel={`${I18n.t('common.reorder')} ${album.name}`}
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          >
            <Menu size={16} color="#fff" />
          </View>
        </Sortable.Handle>
      </View>
    </Animated.View>
  );
});
