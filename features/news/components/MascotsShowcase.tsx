import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Mascot, type MascotName } from '~/components/feedback/Mascot';
import { useThemeColors } from '~/hooks/useThemeColors';
import { withColorAlpha } from '~/utils/color';

interface MascotsShowcaseProps {
  width: number;
}

const POSES: MascotName[] = ['waving', 'save-3', 'grow-3'];

export function MascotsShowcase({ width }: MascotsShowcaseProps) {
  const colors = useThemeColors();
  const size = Math.min(94, Math.floor((width - 32) / 3));
  const backgrounds = [colors.sky, colors.accent, colors.lavender];

  return (
    <View style={[styles.row, { width }]}>
      {POSES.map((pose, index) => (
        <View
          key={pose}
          style={[
            styles.pose,
            {
              width: size,
              height: size,
              backgroundColor: withColorAlpha(backgrounds[index] ?? colors.primary, 0.16),
              borderColor: withColorAlpha(backgrounds[index] ?? colors.primary, 0.28),
            },
          ]}
        >
          <Mascot name={pose} size={size - 6} animate={false} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  pose: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
