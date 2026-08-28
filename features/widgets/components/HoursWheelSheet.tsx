import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';

import { Text, WheelPicker } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { clampSessionHours, LIVE_EARNINGS_HOUR_OPTIONS } from '../lib/liveEarnings';

interface HoursWheelSheetProps {
  visible: boolean;
  hours: number;
  onSelect: (hours: number) => void;
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

function hoursLabel(hours: number) {
  return I18n.t(hours === 1 ? 'widgets.live.hours_one' : 'widgets.live.hours_other', {
    count: hours,
  });
}

/** Wheel picker for how long the live-earnings session should run. */
export function HoursWheelSheet({ visible, hours, onSelect, onClose }: HoursWheelSheetProps) {
  const themeColors = useThemeColors();
  const [draft, setDraft] = useState(hours);

  // Reopening after a cancel should show what is actually set, not the value
  // the user scrolled to and then backed out of.
  useEffect(() => {
    if (visible) setDraft(clampSessionHours(hours));
  }, [hours, visible]);

  const handleDone = () => {
    void triggerHaptic('medium');
    onSelect(draft);
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
          <View className="flex-row items-center justify-between px-4 pb-2 pt-4">
            <Text variant="subheading">{I18n.t('widgets.live.duration_title')}</Text>
            <Pressable
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.close')}
              className="h-8 w-8 items-center justify-center rounded-full bg-secondary/60"
            >
              <X size={14} color={themeColors.textSoft} />
            </Pressable>
          </View>

          <View className="px-3 py-2">
            <WheelPicker
              items={LIVE_EARNINGS_HOUR_OPTIONS.map(hoursLabel)}
              selectedIndex={LIVE_EARNINGS_HOUR_OPTIONS.indexOf(clampSessionHours(draft))}
              onChange={(index) => setDraft(LIVE_EARNINGS_HOUR_OPTIONS[index] ?? draft)}
            />
          </View>

          <View className="flex-row gap-2 px-4 pb-4 pt-2">
            <Pressable
              onPress={handleCancel}
              accessibilityRole="button"
              className="flex-1 items-center justify-center rounded-2xl bg-secondary/60 py-3 active:opacity-70"
            >
              <Text variant="caption" tone="muted">
                {I18n.t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDone}
              accessibilityRole="button"
              className="flex-1 items-center justify-center rounded-2xl bg-primary py-3 active:opacity-80"
            >
              <Text variant="caption" style={{ color: themeColors.card }}>
                {I18n.t('common.done')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
