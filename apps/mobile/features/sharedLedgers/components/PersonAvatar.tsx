import { Image } from 'expo-image';
import React, { memo, useMemo, useState } from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { useThemeColors } from '~/hooks/useThemeColors';
import { getProfileAvatarUri } from '~/services/userAssets';

import type { LedgerPerson } from '../lib/ledgerPeople';

// Soft, mid-tone discs that keep a white initial readable in both themes.
const INITIAL_COLORS = ['#4F8A8B', '#B0505F', '#7A6FB0', '#C07A3A', '#5C8A5A', '#4E78A8'];

/** The same colour for the same person on every row and every phone. */
function colorFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return INITIAL_COLORS[Math.abs(hash) % INITIAL_COLORS.length] ?? INITIAL_COLORS[0];
}

interface PersonAvatarProps {
  person: LedgerPerson;
  size: number;
  /** A ring in the card colour, for a badge laid over another icon. */
  ring?: boolean;
}

/** A person in a shared ledger: their Settings photo, else their initial. */
export const PersonAvatar = memo(function PersonAvatarImpl({
  person,
  size,
  ring,
}: PersonAvatarProps) {
  const themeColors = useThemeColors();
  const uri = useMemo(() => getProfileAvatarUri(person.avatarUri), [person.avatarUri]);
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const ringWidth = ring ? Math.max(1.5, size / 9) : 0;
  const outer = size + ringWidth * 2;
  const initial = person.name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={{
        width: outer,
        height: outer,
        borderRadius: outer / 2,
        padding: ringWidth,
        backgroundColor: ring ? themeColors.card : 'transparent',
      }}
    >
      {uri && uri !== brokenUri ? (
        <Image
          {...REPLAY_PRIVATE}
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          onError={() => setBrokenUri(uri)}
        />
      ) : (
        <View
          className="items-center justify-center"
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: colorFor(person.memberId ?? `owner:${person.name}`),
          }}
        >
          <Text
            className="font-bold text-white"
            style={{ fontSize: Math.round(size * 0.5), lineHeight: Math.round(size * 0.62) }}
            allowFontScaling={false}
          >
            {initial}
          </Text>
        </View>
      )}
    </View>
  );
});
