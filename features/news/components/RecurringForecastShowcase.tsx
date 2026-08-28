import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface RecurringForecastShowcaseProps {
  width: number;
}

/** Commitments falling due on each of the seven days, starting today. */
const DUE_COUNTS = [1, 0, 0, 2, 0, 1, 0];
/** The day the strip is drawn as selected, so the filter affordance is visible. */
const SELECTED_INDEX = 3;
const MS_PER_DAY = 86_400_000;

function StatTile({ label, value }: { label: string; value: string }) {
  const colors = useThemeColors();
  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.1) },
      ]}
    >
      <Text variant="label" tone="muted" style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text variant="mono" style={styles.tileValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/**
 * The forecast hero: the monthly cost bare above its three stat tiles, over the
 * seven-day strip that dots what falls due when.
 */
export function RecurringForecastShowcase({ width }: RecurringForecastShowcaseProps) {
  const colors = useThemeColors();
  const { settings } = useApp();
  const symbol = settings.currencySymbol;

  const days = useMemo(() => {
    const today = new Date();
    const weekdayFormat = new Intl.DateTimeFormat(I18n.locale, { weekday: 'narrow' });
    return DUE_COUNTS.map((count, index) => {
      const date = new Date(today.getTime() + index * MS_PER_DAY);
      return {
        key: date.toISOString(),
        weekday: weekdayFormat.format(date),
        day: String(date.getDate()),
        count,
      };
    });
  }, []);

  return (
    <View style={[styles.wrapper, { width }]}>
      <View style={styles.headline}>
        <Text variant="display" numberOfLines={1}>
          {`${symbol}248`}
        </Text>
        <Text variant="label" tone="muted" style={styles.suffix}>
          {I18n.t('recurring.per_month_suffix')}
        </Text>
      </View>

      <View style={styles.tiles}>
        <StatTile label={I18n.t('recurring.left_this_month')} value={`${symbol}86`} />
        <StatTile label={I18n.t('recurring.per_year')} value={`${symbol}2,976`} />
        <StatTile label={I18n.t('recurring.active_count')} value="7" />
      </View>

      <View style={styles.strip}>
        <Text variant="label" tone="muted">
          {I18n.t('recurring.week_strip_label')}
        </Text>
        <View style={styles.pills}>
          {days.map((day, index) => {
            const selected = index === SELECTED_INDEX;
            const inert = day.count === 0;
            return (
              <View
                key={day.key}
                style={[
                  styles.pill,
                  {
                    backgroundColor: selected
                      ? colors.sky
                      : withColorAlpha(colors.text, index === 0 ? 0.09 : 0.05),
                    opacity: inert && !selected ? 0.5 : 1,
                  },
                  index === 0 && !selected
                    ? { borderWidth: 1, borderColor: withColorAlpha(colors.sky, 0.4) }
                    : null,
                ]}
              >
                <Text
                  variant="label"
                  style={[styles.pillWeekday, { color: selected ? colors.card : colors.textMuted }]}
                >
                  {day.weekday}
                </Text>
                <Text
                  variant="caption"
                  style={{
                    color: selected ? colors.card : index === 0 ? colors.sky : colors.text,
                  }}
                >
                  {day.day}
                </Text>
                <View style={styles.dots}>
                  {Array.from({ length: day.count }, (_, dot) => (
                    <View
                      key={dot}
                      style={[styles.dot, { backgroundColor: selected ? colors.card : colors.sky }]}
                    />
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 13,
  },
  headline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  suffix: {
    letterSpacing: 0,
  },
  tiles: {
    flexDirection: 'row',
    gap: 8,
  },
  tile: {
    flex: 1,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  tileLabel: {
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0,
    minHeight: 24,
  },
  tileValue: {
    fontSize: 13,
    marginTop: 4,
  },
  strip: {
    gap: 8,
  },
  pills: {
    flexDirection: 'row',
    gap: 6,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderRadius: 16,
    paddingVertical: 8,
  },
  pillWeekday: {
    fontSize: 9,
  },
  dots: {
    height: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  dot: {
    height: 4,
    width: 4,
    borderRadius: 999,
  },
});
