import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { CategoryEmoji } from '~/components/ui';

import { SHARED_LEDGER_ART } from './art';

/** The sharing illustration, with the ledger's own icon on a badge. */
export function SharedLedgerHero({ icon }: { icon: string | null }) {
  return (
    <View className="items-center pt-1">
      <Image
        source={SHARED_LEDGER_ART}
        style={styles.hero}
        resizeMode="contain"
        accessible={false}
      />
      {icon ? (
        <View className="-mt-6 h-12 w-12 items-center justify-center rounded-full border-4 border-background bg-card">
          <CategoryEmoji icon={icon} size={24} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { width: 280, height: 140 },
});
