import { Image } from 'expo-image';
import React, { memo, useState } from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { useThemeColors } from '~/hooks/useThemeColors';

import type { LedgerPerson } from '../lib/ledgerPeople';

interface PersonAvatarProps {
  person: LedgerPerson;
  size: number;
  /** A ring in the card colour, for a badge laid over another icon. */
  ring?: boolean;
  /** The initial's disc colour, when a chart gives someone another one. */
  color?: string;
}

/** A person in a shared ledger: their Settings photo, else their initial. */
export const PersonAvatar = memo(function PersonAvatarImpl({
  person,
  size,
  ring,
  color,
}: PersonAvatarProps) {
  const themeColors = useThemeColors();
  // Resolved once by the people store, not with a file check on every row.
  const uri = person.avatarFileUri;
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const ringWidth = ring ? Math.max(1.5, size / 9) : 0;
  const outer = size + ringWidth * 2;
  // By code point, so a name starting with an emoji keeps it whole.
  const initial = Array.from(person.name.trim())[0]?.toUpperCase() ?? '?';
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
            backgroundColor: color ?? person.color,
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
