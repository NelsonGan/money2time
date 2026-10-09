import { CalendarDays } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface FinancialMonthShowcaseProps {
  width: number;
}

/** Sample strip: the month rolls over on the 25th, so 23 and 24 belong to the previous one. */
const DAY_STRIP = [23, 24, 25, 26, 27, 28, 29];
const MONTH_START_DAY = 25;
/** Relative widths of the two cycle segments, split at the sample start day. */
const PREVIOUS_CYCLE_FLEX = 0.26;

export function FinancialMonthShowcase({ width }: FinancialMonthShowcaseProps) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { width }]}>
      {/* Financial month: the strip shows the cycle starting on payday, not the 1st. */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
        ]}
      >
        <View style={styles.row}>
          <View style={[styles.iconBadge, { backgroundColor: withColorAlpha(colors.sky, 0.14) }]}>
            <CalendarDays size={19} color={colors.sky} strokeWidth={2.2} />
          </View>
          <View style={styles.textCol}>
            <Text variant="bodyStrong" numberOfLines={1} style={{ color: colors.text }}>
              {I18n.t('settings.first_day_of_month')}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {I18n.t('news.showcase.month_starts_on_payday')}
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: withColorAlpha(colors.sky, 0.14) }]}>
            <Text variant="mono" style={{ color: colors.sky }}>
              {MONTH_START_DAY}
            </Text>
          </View>
        </View>

        <View style={styles.dayStrip}>
          {DAY_STRIP.map((day) => {
            const isStart = day === MONTH_START_DAY;
            const isPreviousMonth = day < MONTH_START_DAY;
            return (
              <View
                key={day}
                style={[
                  styles.dayPill,
                  {
                    backgroundColor: isStart
                      ? colors.sky
                      : withColorAlpha(colors.text, isPreviousMonth ? 0.04 : 0.07),
                  },
                ]}
              >
                <Text
                  variant="mono"
                  style={[
                    styles.dayText,
                    {
                      color: isStart
                        ? colors.card
                        : isPreviousMonth
                          ? colors.textMuted
                          : colors.textSoft,
                    },
                  ]}
                >
                  {day}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Cycle bar: the faint stub is the tail of the previous month, the tinted
            run is the new one. Purely visual so it needs no sample copy. */}
        <View style={styles.cycleRow}>
          <View
            style={[
              styles.cycleSegment,
              { flex: PREVIOUS_CYCLE_FLEX, backgroundColor: withColorAlpha(colors.text, 0.08) },
            ]}
          />
          <View
            style={[
              styles.cycleSegment,
              { flex: 1 - PREVIOUS_CYCLE_FLEX, backgroundColor: withColorAlpha(colors.sky, 0.55) },
            ]}
          />
        </View>
      </View>
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
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  dayStrip: {
    flexDirection: 'row',
    gap: 5,
  },
  dayPill: {
    flex: 1,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 12,
  },
  cycleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cycleSegment: {
    height: 5,
    borderRadius: 999,
  },
});
