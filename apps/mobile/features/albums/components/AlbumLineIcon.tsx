import { Image } from 'expo-image';
import { memo, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { getAlbumCoverUri } from '~/services/userAssets';
import type { Album } from '~/types';

import { albumInitial } from '../lib/albumLines';

interface AlbumLineIconProps {
  album: Pick<Album, 'name' | 'coverPhotoUri'>;
  /** Width and height in px, as `CategoryEmoji`'s. Defaults to 20. */
  size?: number;
}

/**
 * An album's icon where a category's would be (its line in the category
 * lists): its cover, rounded, else the first letter of its name.
 */
export const AlbumLineIcon = memo(function AlbumLineIconImpl({
  album,
  size = 20,
}: AlbumLineIconProps) {
  const coverUri = useMemo(() => getAlbumCoverUri(album.coverPhotoUri), [album.coverPhotoUri]);
  // Skip a uri that failed to load natively; see CategoryEmoji for why.
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const uri = coverUri !== brokenUri ? coverUri : null;
  const radius = Math.round(size * 0.28);
  if (uri) {
    return (
      <Image
        {...REPLAY_PRIVATE}
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius }}
        contentFit="cover"
        onError={() => setBrokenUri(uri)}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View
      className="items-center justify-center bg-primary/15"
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <Text
        className="font-bold text-primary"
        style={{ fontSize: Math.round(size * 0.55), lineHeight: Math.round(size * 0.7) }}
        allowFontScaling={false}
      >
        {albumInitial(album.name)}
      </Text>
    </View>
  );
});
