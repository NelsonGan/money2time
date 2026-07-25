import { FileSpreadsheet } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface ExcelExportShowcaseProps {
  width: number;
}

/** Relative widths of the fake spreadsheet cells, per row. */
const SHEET_ROWS = [
  [0.42, 0.28, 0.3],
  [0.34, 0.36, 0.3],
  [0.46, 0.22, 0.32],
];

/** One tab per sheet the export writes, matching `excelExportService`. */
const SHEET_TABS = [
  'data_management.excel.sheet_transactions',
  'data_management.excel.sheet_accounts',
  'data_management.excel.sheet_categories',
  'data_management.excel.sheet_recurring',
] as const;

export function ExcelExportShowcase({ width }: ExcelExportShowcaseProps) {
  const colors = useThemeColors();

  return (
    <View style={[styles.container, { width }]}>
      {/* Excel export: a stylized sheet so the row reads without any sample copy. */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: withColorAlpha(colors.text, 0.08) },
        ]}
      >
        <View style={styles.row}>
          <View
            style={[styles.iconBadge, { backgroundColor: withColorAlpha(colors.success, 0.14) }]}
          >
            <FileSpreadsheet size={19} color={colors.success} strokeWidth={2.2} />
          </View>
          <View style={styles.textCol}>
            <Text variant="bodyStrong" numberOfLines={1} style={{ color: colors.text }}>
              {I18n.t('data_management.export_excel_title')}
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

        {/* Sheet tabs: one per exported sheet, so "each on its own sheet" reads visually. */}
        <View style={styles.tabsRow}>
          {SHEET_TABS.map((key, index) => {
            const isActive = index === 0;
            return (
              <View
                key={key}
                style={[
                  styles.tab,
                  {
                    backgroundColor: isActive
                      ? withColorAlpha(colors.success, 0.16)
                      : withColorAlpha(colors.text, 0.05),
                  },
                ]}
              >
                <Text
                  variant="caption"
                  numberOfLines={1}
                  style={[styles.tabText, { color: isActive ? colors.success : colors.textMuted }]}
                >
                  {I18n.t(key)}
                </Text>
              </View>
            );
          })}
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
  tabsRow: {
    flexDirection: 'row',
    gap: 5,
  },
  tab: {
    flex: 1,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 5,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 9,
  },
});
