import { View } from 'react-native';

import { Text } from '~/components/ui';
import { FONT } from '~/utils/fonts';

/** The small PRO tag beside a ledger action a free user cannot take yet. */
export function ProChip() {
  return (
    <View className="rounded-full bg-primary/15 px-2 py-[3px]">
      <Text
        tone="primary"
        className="text-[10px] tracking-[1.5px]"
        style={{ fontFamily: FONT.extrabold, fontWeight: '800' }}
      >
        PRO
      </Text>
    </View>
  );
}
