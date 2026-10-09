import { Minus, Plus } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { withColorAlpha } from '~/utils/color';

interface WorkingDaysShowcaseProps {
  width: number;
}

export function WorkingDaysShowcase({ width }: WorkingDaysShowcaseProps) {
  const colors = useThemeColors();
  const border = withColorAlpha(colors.text, 0.08);

  return (
    <View style={[styles.card, { width, backgroundColor: colors.card, borderColor: border }]}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text variant="bodyStrong" numberOfLines={2}>
            {I18n.t('settings.workday_display')}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {I18n.t('settings.workday_display_help')}
          </Text>
        </View>
        <View style={[styles.switchTrack, { backgroundColor: colors.sky }]}>
          <View style={[styles.switchThumb, { backgroundColor: colors.card }]} />
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: border }]} />

      <View style={styles.row}>
        <Text variant="bodyStrong" style={styles.copy} numberOfLines={2}>
          {I18n.t('settings.working_hours_per_day')}
        </Text>
        <View style={[styles.stepper, { borderColor: border }]}>
          <Minus size={15} color={colors.textMuted} />
          <Text variant="mono" style={{ color: colors.sky }}>
            8
          </Text>
          <Plus size={15} color={colors.textMuted} />
        </View>
      </View>

      <View style={[styles.preview, { backgroundColor: withColorAlpha(colors.sky, 0.13) }]}>
        <Text variant="caption" style={{ color: colors.sky }} numberOfLines={2}>
          {I18n.t('settings.working_hours_per_day_help', { days: 3, hours: 8 })}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: 999,
    padding: 3,
    alignItems: 'flex-end',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 999,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  stepper: {
    height: 36,
    minWidth: 105,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  preview: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
});
