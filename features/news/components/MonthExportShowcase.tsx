import { CalendarDays, FileSpreadsheet } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface MonthExportShowcaseProps {
  width: number;
}

/** Sample strip: the month rolls over on the 25th, so 23 and 24 belong to the previous one. */
const DAY_STRIP = [23, 24, 25, 26, 27, 28, 29];
const MONTH_START_DAY = 25;
/** Relative widths of the fake spreadsheet cells, per row. */
const SHEET_ROWS = [
  [0.42, 0.28, 0.3],
  [0.34, 0.36, 0.3],
  [0.46, 0.22, 0.32],
];

export function MonthExportShowcase({ width }: MonthExportShowcaseProps) {
  const colors = useThemeColors();
  const cardStyle = {
    backgroundColor: colors.card,
    borderColor: withColorAlpha(colors.text, 0.08),
  };

  return (
    <View style={[styles.container, { width }]}>
      {/* Financial month: the strip shows the cycle starting on payday, not the 1st. */}
      <View style={[styles.card, cardStyle]}>
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
      </View>

      {/* Excel export: a stylized sheet so the row reads without any sample copy. */}
      <View style={[styles.card, cardStyle]}>
        <View style={styles.row}>
          <View
            style={[styles.iconBadge, { backgroundColor: withColorAlpha(colors.success, 0.14) }]}
          >
            <FileSpreadsheet size={19} color={colors.success} strokeWidth={2.2} />
          </View>
          <View style={styles.textCol}>
            <Text variant="bodyStrong" numberOfLines={1} style={{ color: colors.text }}>
              {I18n.t('settings.export_excel_title')}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {I18n.t('news.showcase.excel_sheets')}
            </Text>
          </View>
          <View style={[styles.chip, { backgroundColor: withColorAlpha(colors.success, 0.14) }]}>
            <Text variant="caption" style={{ color: colors.success }}>
              .xlsx
            </Text>
          </View>
        </View>
        <View
          style={[
            styles.sheet,
            {
              borderColor: withColorAlpha(colors.text, 0.08),
              backgroundColor: withColorAlpha(colors.text, 0.02),
            },
          ]}
        >
          <View
            style={[styles.sheetRow, { backgroundColor: withColorAlpha(colors.success, 0.12) }]}
          >
            {SHEET_ROWS[0]!.map((flex, index) => (
              <View key={index} style={{ flex }}>
                <View
                  style={[styles.sheetBar, { backgroundColor: colors.success, opacity: 0.5 }]}
                />
              </View>
            ))}
          </View>
          {SHEET_ROWS.slice(1).map((row, rowIndex) => (
            <View
              key={rowIndex}
              style={[
                styles.sheetRow,
                styles.sheetBodyRow,
                { borderTopColor: withColorAlpha(colors.text, 0.06) },
              ]}
            >
              {row.map((flex, index) => (
                <View key={index} style={{ flex }}>
                  <View
                    style={[
                      styles.sheetBar,
                      { backgroundColor: withColorAlpha(colors.text, 0.18) },
                    ]}
                  />
                </View>
              ))}
            </View>
          ))}
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
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 12,
  },
  sheet: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  sheetBodyRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetBar: {
    height: 6,
    borderRadius: 999,
  },
});
