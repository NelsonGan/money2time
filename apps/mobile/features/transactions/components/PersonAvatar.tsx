import React from 'react';
import { View } from 'react-native';

import { Text } from '~/components/ui';
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
}

/** A person's round initial: one colour per person, the theme tint for the user. */
export function PersonAvatar({ name, partyKey, size }: PersonAvatarProps) {
  const dimensions = { width: size, height: size, borderRadius: size / 2 };
  const fontSize = Math.max(10, Math.round(size * 0.4));
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
