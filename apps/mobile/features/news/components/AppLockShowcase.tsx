import { Fingerprint, Lock } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';
import { FONT } from '~/utils/fonts';

interface AppLockShowcaseProps {
  width: number;
}

// Mirrors the PRO ribbon used on the home-widget showcase so the app-lock
// (a Pro feature) carries the same "sticker".
function ProRibbon() {
  const colors = useThemeColors();
  return (
    <View style={[styles.ribbon, { backgroundColor: colors.accent }]} pointerEvents="none">
      <Text allowFontScaling={false} style={styles.ribbonText}>
        PRO
      </Text>
    </View>
  );
}

export function AppLockShowcase({ width }: AppLockShowcaseProps) {
  const colors = useThemeColors();

  return (
    <View
      style={[
        styles.card,
        { width, backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
      ]}
    >
      <ProRibbon />
      <View style={[styles.lockBubble, { backgroundColor: withColorAlpha(colors.primary, 0.14) }]}>
        <Lock size={34} color={colors.primary} strokeWidth={2.2} />
      </View>
      <View style={styles.dotsRow}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.dot, { backgroundColor: withColorAlpha(colors.text, 0.5) }]}
          />
        ))}
      </View>
      <View style={[styles.biometricRow, { borderColor: withColorAlpha(colors.text, 0.1) }]}>
        <Fingerprint size={18} color={colors.textSoft} strokeWidth={2.2} />
        <Text variant="caption" tone="muted">
          {I18n.t('settings.app_lock.unlock_action')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: 16,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 28,
    overflow: 'hidden',
  },
  lockBubble: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 999,
  },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  ribbon: {
    position: 'absolute',
    top: 18,
    right: -26,
    width: 100,
    alignItems: 'center',
    paddingVertical: 4,
    transform: [{ rotate: '45deg' }],
  },
  ribbonText: {
    fontSize: 11,
    lineHeight: 14,
    color: '#fff',
    fontFamily: FONT.bold,
    letterSpacing: 1,
  },
});
