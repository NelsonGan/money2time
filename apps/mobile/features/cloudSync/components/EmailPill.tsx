import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { withColorAlpha } from '~/utils/color';

/** The signed-in address, under the status. */
export function EmailPill({ email }: { email: string }) {
  const colors = useThemeColors();
  return (
    <View style={[styles.pill, { backgroundColor: withColorAlpha(colors.text, 0.05) }]}>
      <Text variant="caption" tone="muted" numberOfLines={1}>
        {email}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    maxWidth: '100%',
  },
});
