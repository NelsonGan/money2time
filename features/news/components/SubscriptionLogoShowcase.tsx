import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { SubscriptionLogo } from '~/components/ui/SubscriptionLogo';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface SubscriptionLogoShowcaseProps {
  width: number;
}

/**
 * Brands recognised almost anywhere, so the grid reads the same whichever
 * country the user's own catalog opens on.
 */
const SHOWCASE_LOGO_IDS = [
  'global/netflix',
  'global/spotify',
  'global/youtube-premium',
  'global/icloud',
  'global/chatgpt',
  'global/disney-plus',
];

/**
 * The one rule under the grid, showing where a picked mark ends up. The name is
 * the brand's own, so it is not an i18n key.
 */
const SAMPLE_RULE = { logoId: 'global/netflix', name: 'Netflix', amount: 15.99 };

export function SubscriptionLogoShowcase({ width }: SubscriptionLogoShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const border = withColorAlpha(colors.text, 0.08);
  const tile = Math.min(58, Math.floor((width - 5 * 10) / 6));

  return (
    <View style={[styles.wrapper, { width }]}>
      <View style={styles.grid}>
        {SHOWCASE_LOGO_IDS.map((id) => (
          <View
            key={id}
            style={[
              styles.tile,
              { width: tile, height: tile, backgroundColor: colors.card, borderColor: border },
            ]}
          >
            <SubscriptionLogo logoId={id} size={Math.round(tile * 0.68)} />
          </View>
        ))}
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: border }]}>
        <SubscriptionLogo logoId={SAMPLE_RULE.logoId} size={30} />
        <View style={styles.copy}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {SAMPLE_RULE.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {I18n.t('transactions.editor.monthly')}
          </Text>
        </View>
        <Text variant="mono" style={{ color: colors.coral }}>
          {`${settings.currencySymbol}${SAMPLE_RULE.amount.toFixed(2)}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  tile: {
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
