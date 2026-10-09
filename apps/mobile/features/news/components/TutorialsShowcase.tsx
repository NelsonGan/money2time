import { Search } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { ClayIcon, type ClayIconName, Text } from '~/components/ui';
import { getTutorial } from '~/features/tutorials/content/tutorials';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface TutorialsShowcaseProps {
  width: number;
}

/**
 * Rows pulled from the real catalog, so the preview cannot describe a tutorial
 * that does not exist. The icons mirror what `TutorialRow` draws for these ids.
 */
const SHOWCASE_ROWS: { id: string; icon: ClayIconName }[] = [
  { id: 'scan-a-receipt', icon: 'entry/scan-receipt' },
  { id: 'split-a-bill', icon: 'money-time/split-bill' },
  { id: 'recurring', icon: 'settings/recurring' },
];

export function TutorialsShowcase({ width }: TutorialsShowcaseProps) {
  const colors = useThemeColors();
  const border = withColorAlpha(colors.text, 0.08);

  return (
    <View style={[styles.wrapper, { width }]}>
      <View style={[styles.search, { backgroundColor: colors.card, borderColor: border }]}>
        <Search size={15} color={colors.textMuted} />
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {I18n.t('tutorials.search_placeholder')}
        </Text>
      </View>

      {SHOWCASE_ROWS.map((row) => {
        const tutorial = getTutorial(row.id);
        if (!tutorial) return null;
        return (
          <View
            key={row.id}
            style={[styles.row, { backgroundColor: colors.card, borderColor: border }]}
          >
            <ClayIcon name={row.icon} size={30} flatSize={18} />
            <View style={styles.copy}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {tutorial.title}
              </Text>
              <Text variant="caption" style={{ color: colors.lavender }} numberOfLines={1}>
                {I18n.t('tutorials.step_count', { count: tutorial.steps.length })}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
});
