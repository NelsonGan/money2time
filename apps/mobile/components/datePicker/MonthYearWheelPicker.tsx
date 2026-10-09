import { X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';

import { Text } from '~/components/ui';
import { WheelPicker } from '~/components/ui/WheelPicker';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { buildMonthLabels, clampYearMonth, type YearMonth } from './monthJump';

const YEAR_RANGE_HALF = 50;

interface MonthYearWheelPickerProps {
  visible: boolean;
  /** `month` shows a year wheel and a month wheel; `year` shows the year wheel only. */
  mode?: 'month' | 'year';
  year: number;
  /** Ignored in `year` mode. */
  monthIndex?: number;
  /** Centre of the default year range (±50). Defaults to `year`. */
  baseYear?: number;
  /** Earliest pickable month (or year, in `year` mode). Narrows the year wheel. */
  min?: YearMonth;
  /** Latest pickable month (or year, in `year` mode). Narrows the year wheel. */
  max?: YearMonth;
  /** Short month names; derived from `locale` when omitted. */
  monthLabels?: string[];
  locale?: string;
  onSelect: (year: number, monthIndex: number) => void;
  onClose: () => void;
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 22,
    overflow: 'hidden',
  },
});

/**
 * Jump straight to a month (or a year) instead of paging one step at a time.
 * Every month/year pager opens this from its label, so the wheels roll the
 * same way everywhere.
 */
export function MonthYearWheelPicker({
  visible,
  mode = 'month',
  year,
  monthIndex = 0,
  baseYear,
  min,
  max,
  monthLabels,
  locale,
  onSelect,
  onClose,
}: MonthYearWheelPickerProps) {
  const themeColors = useThemeColors();
  const centerYear = baseYear ?? year;
  // Without explicit bounds the range always reaches the current year, so a
  // pager paged far past ±50 years still opens on the year it shows.
  const firstYear = min?.year ?? Math.min(year, centerYear - YEAR_RANGE_HALF);
  const lastYear = Math.max(firstYear, max?.year ?? Math.max(year, centerYear + YEAR_RANGE_HALF));
  const yearItems = useMemo(
    () => Array.from({ length: lastYear - firstYear + 1 }, (_, i) => String(firstYear + i)),
    [firstYear, lastYear],
  );
  const resolvedMonthLabels = useMemo(
    () => monthLabels ?? buildMonthLabels(locale ?? I18n.locale ?? 'en'),
    [locale, monthLabels],
  );

  const [tempYear, setTempYear] = useState(year);
  const [tempMonth, setTempMonth] = useState(monthIndex);

  useEffect(() => {
    if (visible) {
      setTempYear(year);
      setTempMonth(monthIndex);
    }
  }, [visible, year, monthIndex]);

  const handleDone = () => {
    void triggerHaptic('medium');
    const picked = clampYearMonth(
      { year: tempYear, monthIndex: mode === 'year' ? monthIndex : tempMonth },
      min,
      max,
    );
    onSelect(picked.year, picked.monthIndex);
  };

  const handleCancel = () => {
    void triggerHaptic('selection');
    onClose();
  };

  const yearIndex = Math.max(0, Math.min(yearItems.length - 1, tempYear - firstYear));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <View style={styles.centerWrap}>
        <TouchableWithoutFeedback onPress={handleCancel}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.card, { backgroundColor: themeColors.card }]}>
          <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
            <Text variant="subheading">
              {I18n.t(mode === 'year' ? 'settings.select_year' : 'settings.select_year_month')}
            </Text>
            <Pressable
              onPress={handleCancel}
              accessibilityLabel={I18n.t('common.close')}
              className="w-8 h-8 rounded-full items-center justify-center bg-secondary/60"
            >
              <X size={14} color={themeColors.textSoft} />
            </Pressable>
          </View>

          <View className="px-3 py-2">
            <View className="flex-row">
              <View className="flex-1">
                <WheelPicker
                  items={yearItems}
                  selectedIndex={yearIndex}
                  onChange={(index) => setTempYear(firstYear + index)}
                />
              </View>
              {mode === 'month' ? (
                <View className="flex-1">
                  <WheelPicker
                    items={resolvedMonthLabels}
                    selectedIndex={tempMonth}
                    onChange={setTempMonth}
                  />
                </View>
              ) : null}
            </View>
          </View>

          <View className="flex-row gap-2 px-4 pt-2 pb-4">
            <Pressable
              onPress={handleCancel}
              accessibilityRole="button"
              className="flex-1 rounded-2xl py-3 items-center justify-center bg-secondary/60 active:opacity-70"
            >
              <Text variant="caption" tone="muted">
                {I18n.t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDone}
              accessibilityRole="button"
              className="flex-1 rounded-2xl py-3 items-center justify-center active:opacity-70"
              style={{ backgroundColor: themeColors.primary }}
            >
              <Text variant="caption" style={{ color: '#FFFFFF', fontWeight: '600' }}>
                {I18n.t('common.done')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
