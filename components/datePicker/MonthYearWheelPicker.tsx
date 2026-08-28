import { X } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';

import { Text } from '~/components/ui';
import { WheelPicker } from '~/components/ui/WheelPicker';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

const YEAR_RANGE_HALF = 50;

interface MonthYearWheelPickerProps {
  visible: boolean;
  year: number;
  monthIndex: number;
  baseYear: number;
  monthLabels: string[];
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

export function MonthYearWheelPicker({
  visible,
  year,
  monthIndex,
  baseYear,
  monthLabels,
  onSelect,
  onClose,
}: MonthYearWheelPickerProps) {
  const themeColors = useThemeColors();
  const years = useMemo(
    () => Array.from({ length: YEAR_RANGE_HALF * 2 + 1 }, (_, i) => baseYear - YEAR_RANGE_HALF + i),
    [baseYear],
  );
  const yearItems = useMemo(() => years.map((y) => String(y)), [years]);
  const yearStartValue = years[0];

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
    onSelect(tempYear, tempMonth);
  };

  const handleCancel = () => {
    void triggerHaptic('selection');
    onClose();
  };

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
            <Text variant="subheading">{I18n.t('settings.select_year_month')}</Text>
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
                  selectedIndex={tempYear - yearStartValue}
                  onChange={(index) => setTempYear(yearStartValue + index)}
                />
              </View>
              <View className="flex-1">
                <WheelPicker
                  items={monthLabels}
                  selectedIndex={tempMonth}
                  onChange={setTempMonth}
                />
              </View>
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
