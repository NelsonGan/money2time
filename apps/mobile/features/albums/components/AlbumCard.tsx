import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Menu } from 'lucide-react-native';
import { memo, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import Sortable from 'react-native-sortables';

import { Text, TimeValueInline } from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { classifyCategoryIcon } from '~/constants/categoryIcons';
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
import { albumInitial } from '../lib/albumLines';
import { isFlagEmoji } from '../lib/flagEmoji';
import { formatAlbumDateRange } from '../utils';
import { AlbumActiveDot } from './AlbumActiveDot';
import { AlbumLineIcon } from './AlbumLineIcon';

/** The people a shared album's card shows before "+N". */
const SHARED_AVATARS = 3;

/** The round icon badge's diameter, its thin white ring included. */
const BADGE_SIZE = 28;
/** The ring's width; the glyph centres in the circle inside it. */
const BADGE_RING = 1.5;
/** The circle inside the ring. */
const BADGE_INNER = BADGE_SIZE - BADGE_RING * 2;

/**
 * A flag's font size in the badge: a flag's glyph is a wide rectangle, so it
 * is drawn well past the circle for its height to fill it (its sides are
 * cropped, as a round flag's are).
 */
const BADGE_EMOJI_SIZE = 44;
/**
 * How far right the glyph is moved: a flag's emblem is mostly at its hoist
 * (the left), like the US stars, China's stars or Singapore's crescent.
 */
const BADGE_HOIST_SHIFT = 5;
/** The glyph's box: wide and tall enough that the glyph itself is never clipped. */
const BADGE_GLYPH_BOX = Math.ceil(BADGE_EMOJI_SIZE * 1.4);

/**
 * An album's icon on its card: a round badge with a thin white ring. A flag
 * emoji is drawn larger than the badge and cropped by it, so it fills the
 * circle like a round flag; any other emoji, a hand-drawn or an uploaded icon
 * sits whole inside it (cropped, it would be an unreadable fragment).
 */
function AlbumIconBadge({ album }: { album: Pick<Album, 'name' | 'icon'> }) {
  const classified = classifyCategoryIcon(album.icon);
  return (
    <View
      testID="album-card-icon"
      className="items-center justify-center overflow-hidden rounded-full border-white/80 bg-white/20"
      style={{ width: BADGE_SIZE, height: BADGE_SIZE, borderWidth: BADGE_RING }}
    >
      {classified.kind === 'emoji' && isFlagEmoji(classified.glyph) ? (
        <Text
          allowFontScaling={false}
          style={{
            position: 'absolute',
            width: BADGE_GLYPH_BOX,
            height: BADGE_GLYPH_BOX,
            left: (BADGE_INNER - BADGE_GLYPH_BOX) / 2 + BADGE_HOIST_SHIFT,
            top: (BADGE_INNER - BADGE_GLYPH_BOX) / 2,
            fontSize: BADGE_EMOJI_SIZE,
            lineHeight: BADGE_GLYPH_BOX,
            textAlign: 'center',
          }}
        >
          {classified.glyph}
        </Text>
      ) : (
        <AlbumLineIcon album={album} size={BADGE_SIZE - 9} />
      )}
    </View>
  );
}

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
  /** Dragged to reorder (the current albums); an archived album's card is not. */
  sortable?: boolean;
}

export const AlbumCard = memo(function AlbumCardImpl({
  album,
  width,
  isActive,
  onPress,
  sortable = true,
}: AlbumCardProps) {
  const { settings, getAlbumStats } = useApp();
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.96 });

  // A lookup in a cache `getAlbumStats` rebuilds only after its inputs change;
  // the memo wrapper re-renders this card when `album` or `statsVersion` does.
  const stats = getAlbumStats(album.id);
  // A shared album, kept in step with everyone in it through Cloud Sync: its
  // people beside its name.
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
  // A shared album's people, at the end of its name's line: who it is shared
  // with says it is shared.
  const sharedAvatars = shared ? (
    <View
      testID="album-card-shared"
      pointerEvents="none"
      className="shrink-0 flex-row items-center"
    >
      {group.people.slice(0, SHARED_AVATARS).map((person, index) => (
        <View
          key={person.id ?? 'me'}
          style={{ marginLeft: index === 0 ? 0 : -6 }}
          className="rounded-full border-2 border-black/40 bg-card"
        >
          <PersonAvatar
            name={person.name}
            partyKey={person.isSelf ? null : debtPartyKey(person.name)}
            size={22}
            imageUri={person.isSelf ? me.avatarUri : null}
          />
        </View>
      ))}
      {group.people.length > SHARED_AVATARS ? (
        <Text variant="caption" className="ml-1 font-semibold text-white">
          +{group.people.length - SHARED_AVATARS}
        </Text>
      ) : null}
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
          // No cover: a tint, with the name's first letter while the album has
          // no icon either (an icon sits in the scrim below).
          <View className="flex-1 items-center justify-center bg-primary/15">
            {album.icon ? null : (
              <Text variant="display" tone="muted">
                {albumInitial(album.name)}
              </Text>
            )}
          </View>
        )}

        {/* Bottom scrim with title + amount + meta overlaid on the cover: a
            gradient, so the photo fades into it rather than meeting a band. */}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.45)', 'rgba(0,0,0,0.7)']}
          locations={[0, 0.4, 1]}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingHorizontal: 16,
            paddingTop: 32,
            paddingBottom: 12,
          }}
        >
          <View className="flex-row items-center gap-2">
            {/* The album's icon (the one its line shows in the category lists)
                as a round badge leading its name. */}
            {album.icon ? <AlbumIconBadge album={album} /> : null}
            <Text variant="bodyStrong" numberOfLines={1} className="shrink text-white">
              {album.name}
            </Text>
            <View className="flex-1" />
            {sharedAvatars}
          </View>
          {isTimeMode ? (
            <TimeValueInline
              value={formatHours(stats.totalSpent, settings)}
              variant="headingSm"
              textClassName="text-white"
              iconColor="#fff"
              iconSize={18}
              numberOfLines={1}
            />
          ) : (
            <Text variant="headingSm" numberOfLines={1} className="mt-1 text-white">
              {formatAmount(stats.totalSpent, settings, { showSign: false })}
            </Text>
          )}
          <Text variant="label" numberOfLines={1} className="mt-0.5 text-white/75">
            {metaLabel}
          </Text>
        </LinearGradient>
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
      {sortable ? (
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
      ) : null}
    </Animated.View>
  );
});
