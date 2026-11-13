import { Image } from 'expo-image';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
import { REPLAY_PRIVATE } from '~/components/ui/replayPrivacy';
import { avatarColor, personInitial } from '~/features/transactions/lib/personAvatar';

interface PersonAvatarProps {
  name: string | null;
  /**
   * The key the person's balance is grouped under (`debtPartyOf`), which gives
   * them the same colour everywhere; null for the user, who is drawn in the
   * theme's own tint.
   */
  partyKey: string | null;
  size: number;
  /** A photo to show in place of the initial (the user's Settings photo). */
  imageUri?: string | null;
}

/** A person's round initial: one colour per person, the theme tint for the user. */
export function PersonAvatar({ name, partyKey, size, imageUri }: PersonAvatarProps) {
  const dimensions = { width: size, height: size, borderRadius: size / 2 };
  const fontSize = Math.max(10, Math.round(size * 0.4));
  // A photo that fails to load falls back to the initial.
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  if (imageUri && imageUri !== brokenUri) {
    return (
      <Image
        {...REPLAY_PRIVATE}
        source={{ uri: imageUri }}
        style={dimensions}
        contentFit="cover"
        onError={() => setBrokenUri(imageUri)}
      />
    );
  }
  if (partyKey === null) {
    return (
      <View className="items-center justify-center bg-primary/15" style={dimensions}>
        <Text className="font-semibold text-primary" style={{ fontSize }} numberOfLines={1}>
          {personInitial(name)}
        </Text>
      </View>
    );
  }
  return (
    <View
      className="items-center justify-center"
      style={[dimensions, { backgroundColor: avatarColor(partyKey) }]}
    >
      <Text className="font-semibold" style={{ fontSize, color: '#fff' }} numberOfLines={1}>
        {personInitial(name)}
      </Text>
    </View>
  );
}
