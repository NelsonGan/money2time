import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { HomeIcon, InsightsIcon, WalletIcon } from '~/components/icons/NavIcons';
import { Text } from '~/components/ui';
import { CLAY_ICON_SOURCES, type ClayIconName } from '~/constants/clayIcons.generated';
import { FLAT_ICON_FOR_CLAY } from '~/constants/flatIcons';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface IconStyleShowcaseProps {
  width: number;
}

/** Three Settings tiles, shown in both styles so the pairing is obvious. */
const TILE_ICONS: ClayIconName[] = ['settings/display', 'settings/budget', 'settings/recurring'];

/**
 * The two icon styles side by side.
 *
 * Neither column goes through `ClayIcon`: that component follows the user's
 * setting, and this card has to show the style they are *not* using. The flat
 * tiles still resolve through `FLAT_ICON_FOR_CLAY` so the preview cannot
 * promise an icon the setting would not actually produce. The tab row is the
 * one place that legitimately differs — `BottomNav` draws its own SVG pair
 * rather than the map — so it names those components directly.
 */
export function IconStyleShowcase({ width }: IconStyleShowcaseProps) {
  const colors = useThemeColors();
  const border = withColorAlpha(colors.text, 0.08);
  const plate = withColorAlpha(colors.primary, 0.1);

  return (
    <View style={[styles.row, { width }]}>
      <View style={[styles.column, { backgroundColor: colors.card, borderColor: border }]}>
        <View style={styles.tileRow}>
          {TILE_ICONS.map((name) => (
            <Image key={name} source={CLAY_ICON_SOURCES[name]} style={styles.clay} />
          ))}
        </View>
        <View style={[styles.divider, { backgroundColor: border }]} />
        <View style={styles.tileRow}>
          <Image source={CLAY_ICON_SOURCES['nav/home-active']} style={styles.clayNav} />
          <Image
            source={CLAY_ICON_SOURCES['nav/wallet']}
            style={[styles.clayNav, styles.resting]}
          />
          <Image
            source={CLAY_ICON_SOURCES['nav/insights']}
            style={[styles.clayNav, styles.resting]}
          />
        </View>
        <Text variant="caption" tone="muted">
          {I18n.t('settings.icon_style_clay')}
        </Text>
      </View>

      <View style={[styles.column, { backgroundColor: colors.card, borderColor: border }]}>
        <View style={styles.tileRow}>
          {TILE_ICONS.map((name) => {
            const Icon = FLAT_ICON_FOR_CLAY[name].icon;
            return (
              <View key={name} style={[styles.plate, { backgroundColor: plate }]}>
                <Icon size={20} color={colors.primary} />
              </View>
            );
          })}
        </View>
        <View style={[styles.divider, { backgroundColor: border }]} />
        <View style={styles.tileRow}>
          <HomeIcon size={26} color={colors.primary} strokeWidth={2.2} filled />
          <WalletIcon size={26} color={colors.textMuted} strokeWidth={1.6} />
          <InsightsIcon size={26} color={colors.textMuted} strokeWidth={1.6} />
        </View>
        <Text variant="caption" tone="muted">
          {I18n.t('settings.icon_style_flat')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: 12,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 18,
  },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 40,
  },
  divider: {
    width: '62%',
    height: StyleSheet.hairlineWidth,
  },
  clay: {
    width: 34,
    height: 34,
    resizeMode: 'contain',
  },
  clayNav: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
  },
  resting: {
    opacity: 0.72,
  },
  plate: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
