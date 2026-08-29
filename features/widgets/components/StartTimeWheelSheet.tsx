import { X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, TouchableWithoutFeedback, View } from 'react-native';

import { Text, WheelPicker } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import {
  clampStartAt,
  floorToMinute,
  MS_PER_MINUTE,
  startHourBucketsFor,
  startMinuteOptionsFor,
} from '../lib/liveEarnings';

interface StartTimeWheelSheetProps {
  visible: boolean;
  /** Epoch ms of the picked start, or null while it is still "just now". */
  startedAt: number | null;
  /** Session length: it is what bounds how far back the wheels reach. */
  hours: number;
  onSelect: (startedAt: number | null) => void;
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
  column: {
    flex: 1,
  },
});

/**
 * `hour: 'numeric'` alone, so the locale decides both the clock (13 vs 1 PM)
 * and where the period sits. A full time format would repeat the minutes the
 * second wheel already owns.
 *
 * Built once per open rather than per row: constructing an `Intl` formatter is
 * expensive enough that doing it inside a map is a real cost on a wheel that
 * re-renders on every detent.
 */
function hourFormatter() {
  return new Intl.DateTimeFormat(I18n.locale || 'en', { hour: 'numeric' });
}

/**
 * Two-column wheel for when the session actually began, in wall-clock time.
 *
 * Times, not "2h ago": someone backdating a shift knows they clocked in at
 * half nine, and made to work out the difference themselves they would only be
 * doing arithmetic the app can do. The wheels only ever offer the window the
 * session allows, so every combination they can land on is a legal start.
 */
export function StartTimeWheelSheet({
  visible,
  startedAt,
  hours,
  onSelect,
  onClose,
}: StartTimeWheelSheetProps) {
  const themeColors = useThemeColors();
  // Snapped when the sheet opens rather than read live: the window's far edge
  // moves with the clock, and wheels that re-index under the user's finger
  // would fight the scroll.
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState(() => floorToMinute(Date.now()));

  // Reopening after a cancel should show what is actually set, not the time the
  // user scrolled to and then backed out of.
  useEffect(() => {
    if (!visible) return;
    const opened = Date.now();
    setNow(opened);
    setDraft(startedAt === null ? floorToMinute(opened) : clampStartAt(startedAt, opened, hours));
  }, [hours, startedAt, visible]);

  const hourBuckets = useMemo(() => startHourBucketsFor(now, hours), [hours, now]);
  const selectedBucket = useMemo(() => {
    const top = new Date(draft);
    top.setMinutes(0, 0, 0);
    return top.getTime();
  }, [draft]);
  const minuteOptions = useMemo(
    () => startMinuteOptionsFor(now, hours, selectedBucket),
    [hours, now, selectedBucket],
  );
  const draftMinute = useMemo(() => new Date(draft).getMinutes(), [draft]);
  const hourLabels = useMemo(() => {
    const formatter = hourFormatter();
    return hourBuckets.map((at) => formatter.format(new Date(at)));
  }, [hourBuckets]);

  const handleHourChange = useCallback(
    (index: number) => {
      const bucket = hourBuckets[index];
      if (bucket === undefined) return;
      // The first and last hours of the window are partial, so a minute that
      // was fine in one hour can be out of reach in the next; keep the nearest
      // one it does offer rather than snapping back to o'clock.
      const options = startMinuteOptionsFor(now, hours, bucket);
      if (options.length === 0) return;
      const minute = Math.min(options[options.length - 1], Math.max(options[0], draftMinute));
      setDraft(bucket + minute * MS_PER_MINUTE);
    },
    [draftMinute, hourBuckets, hours, now],
  );

  const handleMinuteChange = useCallback(
    (index: number) => {
      const minute = minuteOptions[index];
      if (minute === undefined) return;
      setDraft(selectedBucket + minute * MS_PER_MINUTE);
    },
    [minuteOptions, selectedBucket],
  );

  const handleDone = () => {
    void triggerHaptic('medium');
    // Landing on the current minute is not a backdate, it is the default, so it
    // reads back as "just now" rather than freezing a time that is about to be
    // in the past.
    onSelect(draft >= floorToMinute(now) ? null : draft);
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
            <Text variant="subheading">{I18n.t('widgets.live.offset_title')}</Text>
            <Pressable
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.close')}
              className="h-8 w-8 items-center justify-center rounded-full bg-secondary/60"
            >
              <X size={14} color={themeColors.textSoft} />
            </Pressable>
          </View>

          <View className="flex-row gap-2 px-3 py-2">
            <View style={styles.column}>
              <WheelPicker
                items={hourLabels}
                selectedIndex={Math.max(0, hourBuckets.indexOf(selectedBucket))}
                onChange={handleHourChange}
              />
            </View>
            <View style={styles.column}>
              <WheelPicker
                items={minuteOptions.map((minute) => String(minute).padStart(2, '0'))}
                selectedIndex={Math.max(0, minuteOptions.indexOf(draftMinute))}
                onChange={handleMinuteChange}
              />
            </View>
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
