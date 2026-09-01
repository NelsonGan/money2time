import { Check } from 'lucide-react-native';
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { appIconById } from '~/constants/appIcons';
import { useResolvedTheme } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import type { AppIconId } from '~/types';

interface AppIconShowcaseProps {
  width: number;
}

/**
 * `purse` is picked, because the news here is that the old artwork is back and
 * free. `classic` sits beside it so the two read as a choice rather than a
 * replacement, and one Pro tile shows the rest of the grid exists.
 */
const SHOWN: readonly AppIconId[] = ['classic', 'purse', 'party'];
const SELECTED: AppIconId = 'purse';

/** Three tiles from the icon picker, laid out as that screen lays them out. */
export function AppIconShowcase({ width }: AppIconShowcaseProps) {
  const colors = useThemeColors();
  const isDark = useResolvedTheme() === 'dark';
  const tileSize = Math.min(80, Math.floor((width - 28) / 3));

  return (
    <View style={[styles.row, { width }]}>
      {SHOWN.map((id) => {
        const variant = appIconById(id);
        const selected = id === SELECTED;
        return (
          <View key={id} style={styles.cell}>
            <View style={styles.tileWrap}>
              <View
                style={[
                  styles.tile,
                  {
                    width: tileSize,
                    height: tileSize,
                    borderColor: selected ? colors.primary : colors.border,
                    borderWidth: selected ? 2.5 : StyleSheet.hairlineWidth,
                  },
                ]}
              >
                <Image
                  source={isDark ? variant.previewDark : variant.previewLight}
                  style={styles.tileImage}
                  resizeMode="cover"
                />
              </View>
              {selected ? (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Check size={11} color="#FFFFFF" strokeWidth={3} />
                </View>
              ) : null}
            </View>
            <Text variant="caption" tone={selected ? 'default' : 'muted'} numberOfLines={1}>
              {I18n.t(variant.labelKey)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 14,
  },
  cell: {
    alignItems: 'center',
    gap: 6,
  },
  tileWrap: {
    position: 'relative',
  },
  tile: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  tileImage: {
    width: '100%',
    height: '100%',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
