import { Mic, ReceiptText, SlidersHorizontal, Zap } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface AddSplitShowcaseProps {
  width: number;
}

// Static mock of the + button's action sheet: the Add/Split tab header over a
// grid of entry tiles. Illustrative only — no live data.
export function AddSplitShowcase({ width }: AddSplitShowcaseProps) {
  const colors = useThemeColors();

  const tiles: Array<{ key: string; icon: React.ReactNode; title: string }> = [
    {
      key: 'quick',
      icon: <Zap size={20} color={colors.primary} />,
      title: I18n.t('add_action.quick_title'),
    },
    {
      key: 'full',
      icon: <SlidersHorizontal size={20} color={colors.primary} />,
      title: I18n.t('add_action.full_title'),
    },
    {
      key: 'scan',
      icon: <ReceiptText size={20} color={colors.primary} />,
      title: I18n.t('add_action.scan_title'),
    },
    {
      key: 'voice',
      icon: <Mic size={20} color={colors.primary} />,
      title: I18n.t('add_action.voice_title'),
    },
  ];

  return (
    <View
      style={[
        styles.card,
        { width, backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
      ]}
    >
      <View style={styles.tabs}>
        <View style={styles.tab}>
          <Text variant="bodyStrong" style={{ color: colors.text }}>
            {I18n.t('add_action.tab_add')}
          </Text>
          <View style={[styles.tabUnderline, { backgroundColor: colors.primary }]} />
        </View>
        <Text variant="bodyStrong" tone="muted">
          {I18n.t('add_action.tab_split')}
        </Text>
      </View>

      <View style={styles.grid}>
        {tiles.map((tile) => (
          <View
            key={tile.key}
            style={[
              styles.tile,
              {
                backgroundColor: withColorAlpha(colors.text, 0.04),
                borderColor: withColorAlpha(colors.text, 0.08),
              },
            ]}
          >
            <View
              style={[styles.tileIcon, { backgroundColor: withColorAlpha(colors.primary, 0.12) }]}
            >
              {tile.icon}
            </View>
            <Text variant="caption" style={{ color: colors.text }} numberOfLines={1}>
              {tile.title}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  tab: {
    alignItems: 'center',
    gap: 6,
  },
  tabUnderline: {
    height: 3,
    width: 22,
    borderRadius: 999,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '46%',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 8,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
