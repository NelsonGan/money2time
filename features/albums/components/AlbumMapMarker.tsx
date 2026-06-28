import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '~/components/ui/text';
import { useThemeColors } from '~/hooks/useThemeColors';

const CARD_WIDTH = 92;
const IMAGE_HEIGHT = 62;

interface AlbumMapMarkerProps {
  name: string;
  coverUri: string | null;
  /** Total spend, shown under the album name. */
  spendLabel: string;
  /** "Jun 2026" badge overlaid on the cover; hidden when null. */
  monthLabel: string | null;
  onPress: () => void;
}

export const AlbumMapMarker = memo(function AlbumMapMarker({
  name,
  coverUri,
  spendLabel,
  monthLabel,
  onPress,
}: AlbumMapMarkerProps) {
  const themeColors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      className="items-center"
    >
      <View
        className="overflow-hidden rounded-2xl border border-border/50 bg-card shadow-soft"
        style={{ width: CARD_WIDTH }}
      >
        {/* Cover image. */}
        {coverUri ? (
          <Image
            source={{ uri: coverUri }}
            style={{ width: '100%', height: IMAGE_HEIGHT }}
            contentFit="cover"
            // Keep the decoded image cached so MapLibre re-rendering the marker
            // during pan/zoom never blanks it (the "flashing pin" fix).
            cachePolicy="memory-disk"
            recyclingKey={coverUri}
            transition={0}
          />
        ) : (
          <View
            className="items-center justify-center bg-primary/15"
            style={{ height: IMAGE_HEIGHT }}
          >
            <Text variant="heading" tone="primary">
              {name.slice(0, 1).toUpperCase()}
            </Text>
          </View>
        )}
        {/* Date badge — floats over the cover so it reads at a glance without
            stealing room from the name/spend rows below. A translucent dark
            chip keeps it legible over any photo or the tinted placeholder. */}
        {monthLabel ? (
          <View
            className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5"
            style={{ backgroundColor: 'rgba(17, 24, 39, 0.62)' }}
          >
            <Text
              numberOfLines={1}
              className="text-[9px] font-bold uppercase leading-[12px] tracking-wider text-white"
            >
              {monthLabel}
            </Text>
          </View>
        ) : null}
        {/* Labels, separated from the image on the card surface. */}
        <View className="items-center px-2 py-1.5">
          <Text variant="caption" numberOfLines={1} className="font-medium text-foreground">
            {name}
          </Text>
          {spendLabel ? (
            <Text
              numberOfLines={1}
              className="mt-0.5 text-xs font-extrabold leading-tight text-primary"
            >
              {spendLabel}
            </Text>
          ) : null}
        </View>
      </View>
      {/* Downward tail pointing at the exact coordinate. */}
      <View
        style={{
          width: 0,
          height: 0,
          marginTop: -1,
          borderLeftWidth: 6,
          borderRightWidth: 6,
          borderTopWidth: 7,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: themeColors.card,
        }}
      />
    </Pressable>
  );
});
