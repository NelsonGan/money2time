import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Text, ThemeModal, WheelPicker } from '~/components/ui';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { formatCurrency, formatTimeOfDay } from '~/utils/formatters';

import {
  clampSessionHours,
  clampStartAt,
  floorToMinute,
  LIVE_EARNINGS_HOUR_OPTIONS,
  MS_PER_MINUTE,
  sessionEndFor,
  startHourBucketsFor,
  startMinuteOptionsFor,
} from '../lib/liveEarnings';

interface StartSessionSheetProps {
  visible: boolean;
  /** How long the last session ran for, as the duration to open on. */
  hours: number;
  /** True hourly rate, for the shift total. Zero hides it. */
  hourlyRate: number;
  currencySymbol: string;
  /** True while the activity layer is mid-request, so Start cannot be double-fired. */
  busy: boolean;
  /** `startedAt` is null when the session begins now rather than being backdated. */
  onStart: (hours: number, startedAt: number | null) => void;
  onClose: () => void;
}

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

function hoursLabel(hours: number) {
  return I18n.t(hours === 1 ? 'widgets.live.hours_one' : 'widgets.live.hours_other', {
    count: hours,
  });
}

/**
 * Everything a hand-started shift needs, asked for at the moment it is started:
 * how long it runs, and when it began.
 *
 * The two used to be rows on the screen behind this, set before the button was
 * ever pressed. That put the settings for one session next to the settings for
 * every future one (the schedule) with nothing but a header between them, and it
 * left the screen carrying draft state for a session that might never start.
 * Asking here instead means the questions are only ever asked of someone who has
 * already said they are clocking in.
 *
 * Times, not "2h ago": someone backdating a shift knows they clocked in at half
 * nine, and made to work out the difference themselves they would only be doing
 * arithmetic the app can do. The wheels only ever offer the window the duration
 * allows, so every combination they can land on is a legal start.
 *
 * The footer states what the two controls add up to, because neither says it on
 * its own: a length and a start time are the inputs, and when the shift ends
 * (and what it is worth) is the thing actually being decided.
 */
export function StartSessionSheet({
  visible,
  hours,
  hourlyRate,
  currencySymbol,
  busy,
  onStart,
  onClose,
}: StartSessionSheetProps) {
  // Snapped when the sheet opens rather than read live: the window's far edge
  // moves with the clock, and wheels that re-index under the user's finger
  // would fight the scroll.
  const [now, setNow] = useState(() => Date.now());
  const [draftHours, setDraftHours] = useState(() => clampSessionHours(hours));
  const [draftStart, setDraftStart] = useState(() => floorToMinute(Date.now()));
  /** Latched for the life of one open, so Start can only be fired once. */
  const submittedRef = useRef(false);

  // Reopening after a cancel should show what is actually set, not the shift the
  // user dialled in and then backed out of.
  useEffect(() => {
    if (!visible) return;
    const opened = Date.now();
    setNow(opened);
    setDraftHours(clampSessionHours(hours));
    setDraftStart(floorToMinute(opened));
    submittedRef.current = false;
  }, [hours, visible]);

  const hourBuckets = useMemo(() => startHourBucketsFor(now, draftHours), [draftHours, now]);
  const selectedBucket = useMemo(() => {
    const top = new Date(draftStart);
    top.setMinutes(0, 0, 0);
    return top.getTime();
  }, [draftStart]);
  const minuteOptions = useMemo(
    () => startMinuteOptionsFor(now, draftHours, selectedBucket),
    [draftHours, now, selectedBucket],
  );
  const draftMinute = useMemo(() => new Date(draftStart).getMinutes(), [draftStart]);
  const hourLabels = useMemo(() => {
    const formatter = hourFormatter();
    return hourBuckets.map((at) => formatter.format(new Date(at)));
  }, [hourBuckets]);

  const endsAtText = useMemo(() => {
    const end = new Date(sessionEndFor(draftStart, draftHours));
    return formatTimeOfDay(end.getHours(), end.getMinutes());
  }, [draftHours, draftStart]);

  // Through `formatCurrency`, not `formatAmount`, for the reason the card behind
  // this one gives: in time display mode the latter would divide the figure by
  // the very rate that produced it and hand back the duration already on screen.
  const totalText = hourlyRate > 0 ? formatCurrency(hourlyRate * draftHours, currencySymbol) : null;

  // A shorter shift pulls the window's far edge forward, which can strand a
  // start the user picked under the old one behind it.
  const handleHoursChange = useCallback(
    (next: number) => {
      void triggerHaptic('selection');
      setDraftHours(next);
      setDraftStart((current) => clampStartAt(current, now, next));
    },
    [now],
  );

  const handleHourChange = useCallback(
    (index: number) => {
      const bucket = hourBuckets[index];
      if (bucket === undefined) return;
      // The first and last hours of the window are partial, so a minute that
      // was fine in one hour can be out of reach in the next; keep the nearest
      // one it does offer rather than snapping back to o'clock.
      const options = startMinuteOptionsFor(now, draftHours, bucket);
      if (options.length === 0) return;
      const minute = Math.min(options[options.length - 1], Math.max(options[0], draftMinute));
      setDraftStart(bucket + minute * MS_PER_MINUTE);
    },
    [draftHours, draftMinute, hourBuckets, now],
  );

  const handleMinuteChange = useCallback(
    (index: number) => {
      const minute = minuteOptions[index];
      if (minute === undefined) return;
      setDraftStart(selectedBucket + minute * MS_PER_MINUTE);
    },
    [minuteOptions, selectedBucket],
  );

  const handleStart = () => {
    // `busy` alone cannot hold this: it only turns true once the screen behind
    // has already closed the sheet, so a second press landing in the same frame
    // as the first still reads false and would request a second activity.
    if (busy || submittedRef.current) return;
    submittedRef.current = true;
    // Landing on the current minute is not a backdate, it is the default, so it
    // is handed back as "now" rather than as a time that is about to be past.
    onStart(draftHours, draftStart >= floorToMinute(now) ? null : draftStart);
  };

  const handleCancel = useCallback(() => {
    void triggerHaptic('selection');
    onClose();
  }, [onClose]);

  return (
    <ThemeModal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <View className="flex-1 items-center justify-center px-6">
        {/* The scrim is a sibling of the card, not its parent. Wrapping the
            card in a Pressable puts a press responder above the two wheels,
            and it wins the touch often enough that a scroll simply does not
            start: the wheel reads as frozen and the time cannot be changed. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.close')}
          onPress={handleCancel}
          style={StyleSheet.absoluteFill}
          className="bg-black/45"
        />
        <View className="w-full max-w-[360px] gap-5 rounded-[26px] border border-border/45 bg-background px-5 py-6 shadow-soft">
          <Text variant="subheading">{I18n.t('widgets.live.start_sheet_title')}</Text>

          {/* A segmented track rather than eight loose chips: the options are
              one choice along one axis, and the track is what says so. */}
          <View className="gap-2">
            {/* The unit is named once, beside the header, rather than stamped
                on all eight cells. Eight cells share one 360pt modal, so a cell
                is barely wider than its own label, and `common.hour_unit` is one
                letter in English but two full-width glyphs in ja/ko/zh and three
                in th/uk — enough to wrap mid-word inside a fixed-height cell.
                Spelling the choice out in full here says more than the suffix
                did, in every locale, and leaves the cells holding one digit. */}
            <View className="flex-row items-baseline justify-between gap-3">
              <Text variant="label" tone="muted">
                {I18n.t('widgets.live.duration_title')}
              </Text>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                {hoursLabel(draftHours)}
              </Text>
            </View>
            <View className="flex-row gap-1 rounded-2xl border border-border/40 bg-secondary/40 p-1">
              {LIVE_EARNINGS_HOUR_OPTIONS.map((value) => {
                const selected = value === draftHours;
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={hoursLabel(value)}
                    accessibilityState={{ selected }}
                    onPress={() => handleHoursChange(value)}
                    className={
                      selected
                        ? 'h-9 flex-1 items-center justify-center rounded-xl bg-primary'
                        : 'h-9 flex-1 items-center justify-center rounded-xl active:opacity-60'
                    }
                  >
                    <Text
                      variant="caption"
                      numberOfLines={1}
                      className={selected ? 'text-primary-foreground' : 'text-foreground/70'}
                    >
                      {value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="gap-2">
            <Text variant="label" tone="muted">
              {I18n.t('widgets.live.offset_title')}
            </Text>
            <View className="flex-row">
              <View className="flex-1">
                <WheelPicker
                  items={hourLabels}
                  selectedIndex={Math.max(0, hourBuckets.indexOf(selectedBucket))}
                  onChange={handleHourChange}
                />
              </View>
              <View className="flex-1">
                <WheelPicker
                  items={minuteOptions.map((minute) => String(minute).padStart(2, '0'))}
                  selectedIndex={Math.max(0, minuteOptions.indexOf(draftMinute))}
                  onChange={handleMinuteChange}
                />
              </View>
            </View>
          </View>

          <View className="flex-row gap-4 rounded-2xl border border-border/40 bg-card px-4 py-3">
            <View className="flex-1 gap-1">
              <Text variant="label" tone="muted">
                {I18n.t('widgets.live.summary_ends')}
              </Text>
              <Text variant="bodyStrong" numberOfLines={1}>
                {endsAtText}
              </Text>
            </View>
            {totalText === null ? null : (
              <View className="flex-1 items-end gap-1">
                <Text variant="label" tone="muted">
                  {I18n.t('widgets.live.summary_total')}
                </Text>
                <Text variant="mono" tone="primary" numberOfLines={1} adjustsFontSizeToFit>
                  {totalText}
                </Text>
              </View>
            )}
          </View>

          <View className="flex-row gap-3">
            <Button variant="secondary" className="flex-1" onPress={handleCancel}>
              <Text>{I18n.t('common.cancel')}</Text>
            </Button>
            <Button className="flex-1" haptic="medium" disabled={busy} onPress={handleStart}>
              <Text>{I18n.t('widgets.live.start_confirm')}</Text>
            </Button>
          </View>
        </View>
      </View>
    </ThemeModal>
  );
}
