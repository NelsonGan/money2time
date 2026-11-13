import { Image } from 'expo-image';
import { CloudCheck, Menu } from 'lucide-react-native';
import { memo, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { Text, TimeValueInline } from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { useApp } from '~/context/AppContext';
import { PersonAvatar } from '~/features/transactions/components/PersonAvatar';
import { debtPartyKey } from '~/features/transactions/lib/debtParty';
import { usePressScale } from '~/hooks/usePressScale';
import { useSelfPerson } from '~/hooks/useSelfPerson';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { getAlbumCoverUri } from '~/services/userAssets';
import type { Album } from '~/types';
import { formatAmount, formatHours } from '~/utils/formatters';

import { useAlbumGroup } from '../hooks/useAlbumGroup';
import { formatAlbumDateRange } from '../utils';
import { AlbumActiveDot } from './AlbumActiveDot';

/** The people a shared album's card shows before "+N". */
const SHARED_AVATARS = 3;
/**
 * The shortest cover that keeps the pill above the scrim clear of the reorder
 * handle (the handle's 44pt, the pill's 34pt and the scrim's ~80pt).
 */
const PILL_MIN_COVER = 160;

interface AlbumCardProps {
  album: Album;
  width: number;
  isActive: boolean;
  onPress: (albumId: string) => void;
  /**
   * Changes whenever the album totals may have (the loaded transactions,
   * held still while the albums tab is hidden). `getAlbumStats` keeps one
   * identity, so this is what re-renders the memoized card with fresh totals.
   */
  statsVersion: unknown;
}

export const AlbumCard = memo(function AlbumCardImpl({
  album,
  width,
  isActive,
  onPress,
}: AlbumCardProps) {
  const { settings, getAlbumStats } = useApp();
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.96 });

  // A lookup in a cache `getAlbumStats` rebuilds only after its inputs change;
  // the memo wrapper re-renders this card when `album` or `statsVersion` does.
  const stats = getAlbumStats(album.id);
  // A shared album, kept in step with everyone in it through Cloud Sync: its
  // people and a cloud over the name, clear of the active dot's corner.
  const group = useAlbumGroup(album);
  const me = useSelfPerson();
  const shared = group.share !== null;
  const coverUri = useMemo(() => getAlbumCoverUri(album.coverPhotoUri), [album.coverPhotoUri]);
  // Skip a uri that failed to load natively; see CategoryEmoji for why.
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const effectiveCoverUri = coverUri !== brokenUri ? coverUri : null;
  const dateRange = formatAlbumDateRange(stats.startDate, stats.endDate, { alwaysShowYear: true });
  const isTimeMode = settings.displayMode === 'time';

  // Full-width 2:1 banner.
  const coverHeight = Math.round(width * 0.5);
  // On a short card the pill would reach the reorder handle: it sits beside it.
  const compactPill = coverHeight < PILL_MIN_COVER;
  const sharedPill = shared ? (
    <View
      testID="album-card-shared"
      pointerEvents="none"
      // Over the photo: just above the scrim, so the scrim keeps its height,
      // or on a short card beside the reorder handle.
      style={compactPill ? styles.sharedPillTop : styles.sharedPill}
      className="flex-row items-center rounded-full bg-black/50 py-0.5 pl-0.5 pr-2.5"
    >
      {group.people.slice(0, SHARED_AVATARS).map((person, index) => (
        <View
          key={person.id ?? 'me'}
          style={{ marginLeft: index === 0 ? 0 : -6 }}
          className="rounded-full border border-black/40 bg-card"
        >
          <PersonAvatar
            name={person.name}
            partyKey={person.isSelf ? null : debtPartyKey(person.name)}
            size={20}
            imageUri={person.isSelf ? me.avatarUri : null}
          />
        </View>
      ))}
      {group.people.length > SHARED_AVATARS ? (
        <Text variant="caption" className="ml-1 font-semibold text-white">
          +{group.people.length - SHARED_AVATARS}
        </Text>
      ) : null}
      <CloudCheck size={14} color="#fff" style={{ marginLeft: 6 }} />
      <Text variant="caption" className="ml-1 font-semibold text-white">
        {I18n.t('albums.synced_badge')}
      </Text>
    </View>
  ) : null;
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
        // The card is one element to VoiceOver: "Shared" is read with its name.
        accessibilityLabel={shared ? `${album.name}, ${I18n.t('albums.synced_badge')}` : album.name}
        className="overflow-hidden rounded-3xl border border-border/40 shadow-soft"
        style={{ height: coverHeight }}
      >
        {effectiveCoverUri ? (
          <Image
            {...REPLAY_PRIVATE}
            source={{ uri: effectiveCoverUri }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={120}
            onError={() => setBrokenUri(effectiveCoverUri)}
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
          {sharedPill && !compactPill ? sharedPill : null}
          <Text variant="caption" numberOfLines={1} className="text-white/80">
            {album.name}
          </Text>
          {/* Time mode renders a View (icon + text) which has no text baseline,
              so bottom-align it; money mode keeps baseline alignment. */}
          <View
            className={`mt-0.5 flex-row justify-between gap-2 ${
              isTimeMode ? 'items-end' : 'items-baseline'
            }`}
          >
            {isTimeMode ? (
              <TimeValueInline
                value={formatHours(stats.totalSpent, settings)}
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

      {sharedPill && compactPill ? sharedPill : null}

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

const styles = StyleSheet.create({
  // 26pt tall (20pt avatars, their border and the padding), 8pt above the scrim.
  sharedPill: { position: 'absolute', left: 16, top: -34 },
  // Beside the reorder handle (12pt in, 32pt wide), level with its centre.
  sharedPillTop: { position: 'absolute', left: 52, top: 15 },
});
