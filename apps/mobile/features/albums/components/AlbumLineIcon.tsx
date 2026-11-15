import { memo } from 'react';
import { View } from 'react-native';

import { CategoryEmoji, Text } from '~/components/ui';
import type { Album } from '~/types';

import { albumInitial } from '../lib/albumLines';

interface AlbumLineIconProps {
  album: Pick<Album, 'name' | 'icon'>;
  /** Width and height in px, as `CategoryEmoji`'s. Defaults to 20. */
  size?: number;
}

/**
 * An album's icon where a category's would be (its line in the category
 * lists, its card): the icon the user picked for it, else the first letter of
 * its name on a tinted tile.
 */
export const AlbumLineIcon = memo(function AlbumLineIconImpl({
  album,
  size = 20,
}: AlbumLineIconProps) {
  if (album.icon) return <CategoryEmoji icon={album.icon} size={size} />;
  const radius = Math.round(size * 0.28);
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
