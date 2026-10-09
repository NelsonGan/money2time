import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AccountLogo } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { withColorAlpha } from '~/utils/color';

interface AccountLogoShowcaseProps {
  width: number;
}

// Mostly Malaysian, with a couple of US and China logos for the announcement.
const SHOWCASE_LOGO_IDS = [
  'malaysia/maybank',
  'malaysia/cimb',
  'malaysia/touch-n-go-ewallet',
  'malaysia/grabpay',
  'malaysia/boost-bank',
  'united-states/chase',
  'united-states/cash-app',
  'china/alipay',
];

export function AccountLogoShowcase({ width }: AccountLogoShowcaseProps) {
  const colors = useThemeColors();
  const tile = Math.min(64, Math.floor((width - 3 * 14) / 4));

  return (
    <View style={[styles.grid, { width }]}>
      {SHOWCASE_LOGO_IDS.map((id) => (
        <View
          key={id}
          style={[
            styles.tile,
            {
              width: tile,
              height: tile,
              backgroundColor: colors.card,
              borderColor: withColorAlpha(colors.text, 0.08),
            },
          ]}
        >
          <AccountLogo logoId={id} size={Math.round(tile * 0.7)} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 14,
  },
  tile: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
