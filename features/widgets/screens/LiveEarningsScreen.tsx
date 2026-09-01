import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Mascot } from '~/components/feedback/Mascot';
import {
  Button,
  Card,
  FatButton,
  InfoTooltipButton,
  SelectField,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useProGate } from '~/hooks/useProGate';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { getLiveActivityPushToStartToken } from '~/services/liveActivity';
import { consumePendingLiveEarningsStart } from '~/services/liveEarningsNavigation';
import { getPermissionStatus, requestPermissions } from '~/services/notifications';
import type { Weekday } from '~/types';
import { formatTimeOfDay } from '~/utils/formatters';

import { LiveEarningsPreview } from '../components/LiveEarningsPreview';
import { StartSessionSheet } from '../components/StartSessionSheet';
import {
  clampStartAt,
  LIVE_EARNINGS_HOUR_OPTIONS,
  type LiveEarningsSession,
  sessionEndFor,
  startedMinutesAgoFor,
} from '../lib/liveEarnings';
import { scheduleEndClock, toggleScheduleDay, weekdaysFrom } from '../lib/liveEarningsSchedule';
import { useLiveEarningsActivity } from '../useLiveEarningsActivity';

interface LiveEarningsScreenProps {
  onBack: () => void;
  onOpenHourlyValue: () => void;
}

/** Fast enough that cents visibly move, slow enough to stay off the hot path. */
const PREVIEW_TICK_MS = 250;

/**
 * What the preview counts at before the user has set an hourly value. The card
 * is the pitch for the feature, and a card sitting at 0.00 sells nothing.
 */
const SAMPLE_HOURLY_RATE = 20;

/** Half-hourly, matching the other reminder time pickers in settings. */
function buildTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let hour = 0; hour < 24; hour += 1) {
    for (const minute of [0, 30]) {
      options.push({ value: `${hour}:${minute}`, label: formatTimeOfDay(hour, minute) });
    }
  }
  return options;
}

function hoursLabel(hours: number) {
  return I18n.t(hours === 1 ? 'widgets.live.hours_one' : 'widgets.live.hours_other', {
    count: hours,
  });
}

export function LiveEarningsScreen({ onBack, onOpenHourlyValue }: LiveEarningsScreenProps) {
  const { settings, getTrueHourlyRateForDate, notificationPrefs, updateNotificationPrefs } =
    useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const themeColors = useThemeColors();
  const { isPro, requirePro } = useProGate();
  const schedule = notificationPrefs.liveEarningsStart;

  const currencySymbol = settings?.currencySymbol ?? '$';
  const hourlyRate = useMemo(
    () => getTrueHourlyRateForDate(new Date().toISOString()),
    [getTrueHourlyRateForDate],
  );
  const hasWage = hourlyRate > 0;

  const { available, hydrated, enabled, session, busy, start, stop } =
    useLiveEarningsActivity(hourlyRate);

  // How long a session started from this screen runs for. It is persisted on
  // the schedule blob so the sheet opens on the last shift the user worked,
  // but it is NOT the scheduled shift's length: clocking in for two hours of
  // overtime on a Saturday must not rewrite every weekday the schedule covers.
  const hours = schedule.hours;
  const [startSheetVisible, setStartSheetVisible] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<
    'granted' | 'denied' | 'undetermined' | null
  >(null);
  // Whether this device can have its shift started for it. Null until asked:
  // the two modes promise different things, and flashing the wrong promise
  // while ActivityKit is still answering would be worse than a blank moment.
  const [canPushStart, setCanPushStart] = useState<boolean | null>(null);
  // Anchored once so the sample keeps counting from when the screen opened
  // rather than restarting on every re-render.
  const [sampleStartedAt] = useState(() => Date.now());

  // Held while the start sheet is up. The preview is behind a full-screen modal
  // at that point, so the tick buys nothing, and it is not free: this screen
  // owns the sheet, so every tick re-renders both of its wheels and all sixty
  // rows in them, under the user's finger.
  useEffect(() => {
    if (startSheetVisible) return;
    const timer = setInterval(() => setNow(Date.now()), PREVIEW_TICK_MS);
    return () => clearInterval(timer);
  }, [startSheetVisible]);

  useEffect(() => {
    void getPermissionStatus().then(setPermissionStatus);
    // A push-to-start token means the Worker can raise the card by itself
    // (iOS 17.2+); without one the schedule falls back to a reminder to tap.
    void getLiveActivityPushToStartToken().then((token) => setCanPushStart(token !== null));
  }, []);

  const setSchedule = useCallback(
    (updates: Partial<typeof schedule>) => {
      updateNotificationPrefs({ liveEarningsStart: { ...schedule, ...updates } });
    },
    [schedule, updateNotificationPrefs],
  );

  // Once an activity is running the card stops being a mock-up and becomes the
  // live view of it, so the screen shows one number rather than two that
  // disagree. Before then it counts from when the screen opened, which is the
  // pitch for the feature rather than a claim about any particular shift.
  const previewSession: LiveEarningsSession = session ?? {
    startedAt: sampleStartedAt,
    endsAt: sessionEndFor(sampleStartedAt, hours),
    hourlyRate: hasWage ? hourlyRate : SAMPLE_HOURLY_RATE,
  };

  const endsText = useMemo(() => {
    const end = new Date(previewSession.endsAt);
    return I18n.t('widgets.live.ends_at', {
      time: formatTimeOfDay(end.getHours(), end.getMinutes()),
    });
  }, [previewSession.endsAt]);

  const handleStart = useCallback(
    async (pickedHours: number, startedAt: number | null) => {
      setStartSheetVisible(false);
      // Measured against the clock at the moment of starting, not at the moment
      // of picking: minutes can pass between the two, and it is the wall-clock
      // time the user chose that has to survive them.
      const startingAt = Date.now();
      const offsetMinutes =
        startedAt === null
          ? 0
          : startedMinutesAgoFor(clampStartAt(startedAt, startingAt, pickedHours), startingAt);
      const started = await start(pickedHours, offsetMinutes);
      setFailed(!started);
      if (!started) return;
      void triggerHaptic('success');
      // Remembered so the next shift opens on the same length, and only once
      // the shift is actually running: a length dialled in for a start that
      // ActivityKit then refused is not one the user worked. The start time is
      // deliberately not remembered at all: "I clocked in at nine" is true of
      // this shift only, and carrying it into the next one would skip time.
      if (pickedHours !== hours) setSchedule({ hours: pickedHours });
    },
    [hours, setSchedule, start],
  );

  const handleStop = useCallback(async () => {
    setFailed(false);
    await stop();
  }, [stop]);

  const canRun = available && hasWage && enabled;
  // Hydration is not a blocker, it is a "not known yet": showing the
  // Live-Activities-are-off card while ActivityKit is still being asked would
  // flash a wrong explanation on every open.
  const blocker = !available || !hasWage || (hydrated && !enabled);
  const running = session !== null;
  // Read inside the auto-start effect without making it re-run as the flags
  // settle, which would re-check a request it has already claimed.
  const canRunRef = useRef(canRun);
  canRunRef.current = canRun;

  // The reminder's deep link left a pending start here. It is claimed once the
  // activity layer has hydrated (so an already-running session is visible and
  // is not restarted) and exactly once, since `consume` clears it. A reminder
  // start is always "now" and never opens the sheet: the sheet is for a shift
  // the user is starting by hand.
  const autoStartAttempted = useRef(false);
  useEffect(() => {
    if (!hydrated || autoStartAttempted.current) return;
    const pending = consumePendingLiveEarningsStart();
    if (!pending) return;
    autoStartAttempted.current = true;
    if (session || !canRunRef.current) return;
    void (async () => {
      const started = await start(pending.hours);
      setFailed(!started);
      if (started) void triggerHaptic('success');
    })();
  }, [hydrated, session, start]);

  const activeLocale = settings?.locale ?? I18n.locale ?? 'en';

  const weekdayOrder = useMemo(
    () => weekdaysFrom(settings?.weekStartsOn ?? 0),
    [settings?.weekStartsOn],
  );
  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(activeLocale, {
      weekday: 'narrow',
      timeZone: 'UTC',
    });
    // 2024-01-07 is a Sunday in UTC, so index 0 lines up with weekday 0.
    return weekdayOrder.map((day) => formatter.format(new Date(Date.UTC(2024, 0, 7 + day))));
  }, [activeLocale, weekdayOrder]);

  const timeOptions = useMemo(buildTimeOptions, []);

  const shiftHourOptions = useMemo(
    () =>
      LIVE_EARNINGS_HOUR_OPTIONS.map((value) => ({
        value: String(value),
        label: hoursLabel(value),
      })),
    [],
  );

  // Pure wall-clock arithmetic, so a shift ending at 02:00 says 02:00 without
  // dragging the calendar - or a daylight-saving change - into a label.
  const scheduleEndsText = useMemo(() => {
    const end = scheduleEndClock(schedule);
    return I18n.t('widgets.live.ends_at', {
      time: formatTimeOfDay(end.hour, end.minute),
    });
  }, [schedule]);

  const toggleAutoStart = useCallback(
    async (value: boolean) => {
      void triggerHaptic('selection');
      // Pro-only, and checked before anything else: a free user who taps this
      // should get the paywall, not a permission prompt for a reminder they
      // will not be allowed to arm. Starting the clock by hand stays free.
      if (value && !requirePro('live_earnings_auto_start')) return;
      // Read again rather than trusting what the screen learned on mount: on a
      // fresh install the push-to-start token is minted asynchronously and is
      // often not there yet, and treating that as "no push" would send someone
      // down the notification-permission path for a card that will in fact
      // start on its own.
      let pushable = canPushStart;
      if (value) {
        pushable = (await getLiveActivityPushToStartToken()) !== null;
        setCanPushStart(pushable);
      }
      // Only the reminder fallback needs permission. A push-to-start carries no
      // banner and no sound and is delivered whatever the notification settings
      // say, so asking for permission there would be asking for nothing.
      if (value && !pushable) {
        // A reminder that the OS will never deliver is worse than no reminder,
        // so the toggle only turns on once notifications are actually allowed.
        let status = permissionStatus;
        if (status !== 'granted') {
          status = await requestPermissions();
          setPermissionStatus(status);
        }
        if (status !== 'granted') {
          Alert.alert(
            I18n.t('notifications.permission_denied_title'),
            I18n.t('notifications.permission_denied_message'),
            [
              { text: I18n.t('common.cancel'), style: 'cancel' },
              {
                text: I18n.t('notifications.open_settings'),
                onPress: () => void Linking.openSettings(),
              },
            ],
          );
          return;
        }
      }
      setSchedule({ enabled: value });
    },
    [canPushStart, permissionStatus, requirePro, setSchedule],
  );

  const handleToggleDay = useCallback(
    (day: Weekday) => {
      void triggerHaptic('selection');
      setSchedule({ days: toggleScheduleDay(schedule.days, day) });
    },
    [schedule.days, setSchedule],
  );

  return (
    <SettingsPageLayout
      actionBar={
        canRun && hydrated ? (
          <View style={[styles.actionBar, bottomNavInset]}>
            {failed ? (
              <Text variant="caption" tone="error" className="pb-2">
                {I18n.t('widgets.live.start_failed')}
              </Text>
            ) : null}
            <FatButton
              label={I18n.t(running ? 'widgets.live.stop' : 'widgets.live.start')}
              color={running ? themeColors.surfaceMuted : undefined}
              textColor={running ? themeColors.text : undefined}
              disabled={busy}
              haptic="medium"
              onPress={() => {
                if (running) {
                  void handleStop();
                  return;
                }
                setFailed(false);
                setStartSheetVisible(true);
              }}
            />
          </View>
        ) : null
      }
    >
      <SettingsHeader
        className="px-5 pt-5 pb-3"
        onBack={onBack}
        title={I18n.t('widgets.live.title')}
      />
      <ScrollView className="flex-1" contentContainerStyle={styles.scrollContent}>
        <View className="flex-row items-center gap-3 pb-4 pt-1">
          <Mascot size={56} name="excited" />
          <Text variant="caption" tone="muted" className="flex-1">
            {I18n.t('widgets.live.subtitle')}
          </Text>
        </View>

        <LiveEarningsPreview
          session={previewSession}
          now={now}
          currencySymbol={currencySymbol}
          endsText={endsText}
        />

        {blocker ? (
          <View className="pt-4">
            {!available ? (
              <Card variant="outline" className="p-5">
                <Text variant="caption" tone="muted">
                  {I18n.t('widgets.live.unavailable')}
                </Text>
              </Card>
            ) : !hasWage ? (
              <Card variant="accent" className="gap-3 p-5">
                <Text variant="bodyStrong">{I18n.t('widgets.live.wage_title')}</Text>
                <Text variant="caption" tone="muted">
                  {I18n.t('widgets.live.wage_body')}
                </Text>
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onPress={onOpenHourlyValue}
                >
                  <Text variant="caption">{I18n.t('widgets.live.wage_action')}</Text>
                </Button>
              </Card>
            ) : (
              <Card variant="outline" className="gap-2 p-5">
                <Text variant="bodyStrong">{I18n.t('widgets.live.disabled_title')}</Text>
                <Text variant="caption" tone="muted">
                  {I18n.t('widgets.live.disabled_body')}
                </Text>
              </Card>
            )}
          </View>
        ) : null}

        {canRun && hydrated ? (
          <View className="mt-7 gap-3">
            {/* Hand-rolled rather than SettingsSection: its `title` takes a
                string, and this header needs the info button beside it. The
                label styling is copied from there so the two read alike. */}
            <View className="flex-row items-center gap-2 px-1">
              <Text variant="label" className="text-[12px] tracking-widest text-muted-foreground">
                {I18n.t('widgets.live.schedule_section')}
              </Text>
              <InfoTooltipButton
                title={I18n.t('widgets.live.schedule_section')}
                infoTooltip={I18n.t('widgets.live.schedule_tooltip')}
                iconSize={14}
              />
              {/* Shown rather than hidden: the section is the pitch, and a free
                  user tapping the switch gets the paywall. */}
              {isPro ? null : (
                <View className="rounded-full bg-primary/15 px-2 py-0.5">
                  <Text variant="caption" className="text-primary">
                    PRO
                  </Text>
                </View>
              )}
            </View>
            <View className="gap-3 rounded-3xl border border-border/40 bg-card/95 px-4 py-3.5">
              <View className="flex-row items-center gap-3">
                <View className="flex-1 gap-0.5">
                  <Text variant="body">{I18n.t('widgets.live.schedule_title')}</Text>
                  {/* Two different promises: the card appearing by itself, or a
                      notification to tap. Say which one this device gets. */}
                  {canPushStart === null ? null : (
                    <Text variant="caption" tone="muted">
                      {I18n.t(
                        canPushStart
                          ? 'widgets.live.schedule_body_auto'
                          : 'widgets.live.schedule_body',
                      )}
                    </Text>
                  )}
                </View>
                <Switch
                  // Off for a free account even if the flag is set: a lapsed
                  // subscription disarms the schedule on the next foreground,
                  // and a switch left showing "on" would promise a card that
                  // is no longer coming.
                  value={schedule.enabled && isPro}
                  onValueChange={(value) => void toggleAutoStart(value)}
                  trackColor={{ false: `${themeColors.border}80`, true: themeColors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {schedule.enabled && isPro ? (
                <>
                  <View className="flex-row justify-between gap-1.5">
                    {weekdayOrder.map((day, index) => {
                      const selected = schedule.days.includes(day);
                      return (
                        <Pressable
                          key={day}
                          accessibilityRole="button"
                          accessibilityLabel={weekdayLabels[index]}
                          accessibilityState={{ selected }}
                          onPress={() => handleToggleDay(day)}
                          className={
                            selected
                              ? 'h-10 flex-1 items-center justify-center rounded-2xl bg-primary'
                              : 'h-10 flex-1 items-center justify-center rounded-2xl border border-border/50'
                          }
                        >
                          <Text
                            variant="caption"
                            className={selected ? 'text-primary-foreground' : 'text-foreground/70'}
                          >
                            {weekdayLabels[index]}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <SelectField
                    label={I18n.t('widgets.live.schedule_time')}
                    value={`${schedule.hour}:${schedule.minute}`}
                    options={timeOptions}
                    onChange={(value) => {
                      const [hour, minute] = value.split(':').map(Number);
                      void triggerHaptic('selection');
                      setSchedule({ hour, minute });
                    }}
                  />

                  {/* A shift is a start and a length, so the two sit together
                      and the end time is spelled out underneath rather than
                      left as arithmetic. Editable while a card is running: it
                      describes the next shift, not the one on screen. */}
                  <SelectField
                    label={I18n.t('widgets.live.schedule_duration')}
                    value={String(schedule.shiftHours)}
                    options={shiftHourOptions}
                    helperText={scheduleEndsText}
                    onChange={(value) => {
                      void triggerHaptic('selection');
                      setSchedule({ shiftHours: Number(value) });
                    }}
                  />

                  {/* The only status worth a line: a schedule with no day
                      selected can never fire. */}
                  {schedule.days.length === 0 ? (
                    <Text variant="caption" tone="muted">
                      {I18n.t('widgets.live.schedule_no_days')}
                    </Text>
                  ) : null}
                </>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <StartSessionSheet
        visible={startSheetVisible}
        hours={hours}
        hourlyRate={hourlyRate}
        currencySymbol={currencySymbol}
        busy={busy}
        onStart={(pickedHours, startedAt) => void handleStart(pickedHours, startedAt)}
        onClose={() => setStartSheetVisible(false)}
      />
    </SettingsPageLayout>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingBottom: SETTINGS_FORM_BOTTOM_PADDING,
    gap: spacing.xs,
  },
  actionBar: {
    paddingHorizontal: SETTINGS_HORIZONTAL_PADDING,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
});
