import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface MonthCycleShowcaseProps {
  width: number;
}

/** Sample cycle: most months start on payday, two were pulled somewhere else. */
const DEFAULT_DAY = 25;
const SAMPLE_MONTHS: readonly { month: number; day: number }[] = [
  { month: 0, day: DEFAULT_DAY },
  { month: 1, day: DEFAULT_DAY },
  { month: 2, day: 20 },
  { month: 3, day: DEFAULT_DAY },
  { month: 4, day: DEFAULT_DAY },
  { month: 5, day: 28 },
];

/**
 * The month grid from the Month cycle page, cut to six tiles. The 006/009
 * financial-month page showed a single start day for every month; the point of
 * this one is the two tiles that differ, so the customized days carry the tint
 * and the rest stay muted, exactly as the real grid does.
 */
export function MonthCycleShowcase({ width }: MonthCycleShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const border = withColorAlpha(colors.text, 0.08);
  const locale = settings.locale ?? I18n.locale ?? 'en';

  const months = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'short' });
    // Year is arbitrary — only the month name is read off it.
    return SAMPLE_MONTHS.map(({ month, day }) => ({
      key: String(month),
      label: formatter.format(new Date(2026, month, 1)),
      day,
      isCustom: day !== DEFAULT_DAY,
    }));
  }, [locale]);

  return (
    <View style={[styles.container, { width }]}>
      <View style={[styles.defaultRow, { backgroundColor: colors.card, borderColor: border }]}>
        <View style={[styles.dayBadge, { backgroundColor: withColorAlpha(colors.sky, 0.14) }]}>
          <Text variant="mono" style={{ color: colors.sky }}>
            {DEFAULT_DAY}
          </Text>
        </View>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.defaultLabel}>
          {I18n.t('settings.month_cycle.default_row')}
        </Text>
      </View>

      <View style={styles.grid}>
        {months.map((month) => (
          <View
            key={month.key}
            style={[
              styles.tile,
              {
                backgroundColor: colors.card,
                borderColor: month.isCustom ? withColorAlpha(colors.sky, 0.4) : border,
              },
            ]}
          >
            <Text variant="caption" tone="muted" numberOfLines={1} style={styles.tileMonth}>
              {month.label}
            </Text>
            <Text
              variant="monoLg"
              tone={month.isCustom ? 'default' : 'muted'}
              style={month.isCustom ? { color: colors.sky } : undefined}
            >
              {month.day}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dayBadge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultLabel: {
    flex: 1,
    minWidth: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  tile: {
    flexGrow: 1,
    flexBasis: '30%',
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 4,
    gap: 1,
  },
  tileMonth: {
    fontSize: 11,
  },
});
