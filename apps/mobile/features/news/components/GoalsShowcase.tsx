import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CategoryEmoji, Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';
import { formatAmount } from '~/utils/formatters';

interface GoalsShowcaseProps {
  width: number;
}

interface SampleGoal {
  labelKey: string;
  emoji: string;
  saved: number;
  target: number;
  achieved: boolean;
}

// Static samples mirroring the real GoalCard layout; only the currency symbol
// follows the user's settings so the progress idea reads the same everywhere.
const GOALS: SampleGoal[] = [
  {
    labelKey: 'news.showcase.goal_trip',
    emoji: '🎌',
    saved: 3400,
    target: 5000,
    achieved: false,
  },
  {
    labelKey: 'news.showcase.goal_emergency',
    emoji: '🛟',
    saved: 2000,
    target: 2000,
    achieved: true,
  },
];

export function GoalsShowcase({ width }: GoalsShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const money = { currencySymbol: settings.currencySymbol, displayMode: 'money' as const };

  return (
    <View style={[styles.container, { width }]}>
      {GOALS.map((goal) => {
        const ratio = Math.min(1, goal.saved / goal.target);
        const fillColor = goal.achieved ? colors.success : colors.primary;
        const chipLabel = goal.achieved
          ? I18n.t('goals.pace_achieved')
          : I18n.t('goals.pace_on_track');
        return (
          <View
            key={goal.labelKey}
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
            ]}
          >
            <View style={styles.row}>
              <View
                style={[styles.emojiBadge, { backgroundColor: withColorAlpha(colors.text, 0.05) }]}
              >
                <CategoryEmoji icon={goal.emoji} style={styles.emoji} />
              </View>
              <View style={styles.textCol}>
                <Text variant="bodyStrong" numberOfLines={1} style={{ color: colors.text }}>
                  {I18n.t(goal.labelKey)}
                </Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>
                  {I18n.t('goals.saved_of_target', {
                    saved: formatAmount(goal.saved, money, { showSign: false }),
                    target: formatAmount(goal.target, money, { showSign: false }),
                  })}
                </Text>
              </View>
              <View style={styles.rightCol}>
                <Text variant="mono" style={{ color: fillColor }}>
                  {Math.round(ratio * 100)}%
                </Text>
                <View style={[styles.chip, { backgroundColor: withColorAlpha(fillColor, 0.14) }]}>
                  <Text variant="caption" style={{ color: fillColor }}>
                    {chipLabel}
                  </Text>
                </View>
              </View>
            </View>
            <View style={[styles.track, { backgroundColor: withColorAlpha(colors.text, 0.08) }]}>
              <View
                style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: fillColor }]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emojiBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 20,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: 4,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 999,
  },
});
