import { ChevronRight } from 'lucide-react-native';
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
  SettingsSection,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { consumePendingLiveEarningsStart } from '~/services/liveEarningsNavigation';
import { getPermissionStatus, requestPermissions } from '~/services/notifications';
import type { Weekday } from '~/types';
import { formatTimeOfDay } from '~/utils/formatters';

import { HoursWheelSheet } from '../components/HoursWheelSheet';
import { LiveEarningsPreview } from '../components/LiveEarningsPreview';
import { StartTimeWheelSheet } from '../components/StartTimeWheelSheet';
import {
  clampStartAt,
  type LiveEarningsSession,
  MS_PER_HOUR,
  sessionEndFor,
  startedMinutesAgoFor,
} from '../lib/liveEarnings';
import { toggleScheduleDay, weekdaysFrom } from '../lib/liveEarningsSchedule';
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
  const schedule = notificationPrefs.liveEarningsStart;

  const currencySymbol = settings?.currencySymbol ?? '$';
  const hourlyRate = useMemo(
    () => getTrueHourlyRateForDate(new Date().toISOString()),
    [getTrueHourlyRateForDate],
  );
  const hasWage = hourlyRate > 0;

  const { available, hydrated, enabled, session, busy, start, stop } =
    useLiveEarningsActivity(hourlyRate);

  // The duration lives on the schedule so it survives leaving the screen and
  // so the reminder starts the session length the user actually picked. One
  // control drives both rather than two that can disagree.
  const hours = schedule.hours;
  const [hoursSheetVisible, setHoursSheetVisible] = useState(false);
  const [startSheetVisible, setStartSheetVisible] = useState(false);
  // The wall-clock time the shift began, or null while it is still "just now".
  // Per-start, not persisted: "I clocked in at nine" is true of this shift
  // only, and carrying it into the next one would silently skip time.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<
    'granted' | 'denied' | 'undetermined' | null
  >(null);
  // Anchored once so the sample keeps counting from when the screen opened
  // rather than restarting every time the duration changes.
  const [sampleStartedAt] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), PREVIEW_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    void getPermissionStatus().then(setPermissionStatus);
  }, []);

  const setSchedule = useCallback(
    (updates: Partial<typeof schedule>) => {
      updateNotificationPrefs({ liveEarningsStart: { ...schedule, ...updates } });
    },
    [schedule, updateNotificationPrefs],
  );

  // Shortening the duration can strand a start past the end of the session, so
  // it is re-clamped on read rather than only when it is picked.
  const pickedStartedAt = startedAt === null ? null : clampStartAt(startedAt, now, hours);

  // Once an activity is running the card stops being a mock-up and becomes the
  // live view of it, so the screen shows one number rather than two that
  // disagree. Before then the picked start drives the sample, so choosing an
  // earlier one visibly moves the amount the card will open at.
  const previewStartedAt = pickedStartedAt ?? sampleStartedAt;
  const previewSession: LiveEarningsSession = session ?? {
    startedAt: previewStartedAt,
    endsAt: sessionEndFor(previewStartedAt, hours),
    hourlyRate: hasWage ? hourlyRate : SAMPLE_HOURLY_RATE,
  };

  const endsText = useMemo(() => {
    const end = new Date(previewSession.endsAt);
    return I18n.t('widgets.live.ends_at', {
      time: formatTimeOfDay(end.getHours(), end.getMinutes()),
    });
  }, [previewSession.endsAt]);

  const handleStart = useCallback(async () => {
    // Measured against the clock at the moment of starting, not at the moment
    // of picking: minutes can pass between the two, and it is the wall-clock
    // time the user chose that has to survive them.
    const startingAt = Date.now();
    const offsetMinutes =
      startedAt === null
        ? 0
        : startedMinutesAgoFor(clampStartAt(startedAt, startingAt, hours), startingAt);
    const started = await start(hours, offsetMinutes);
    setFailed(!started);
    if (started) {
      void triggerHaptic('success');
      // The start belongs to the session that just began; the next one runs
      // from "just now" unless the user says otherwise.
      setStartedAt(null);
    }
  }, [hours, start, startedAt]);

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
  // start is always "now": the offset picker describes a start the user is
  // making by hand.
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

  const startedLabel = useMemo(() => {
    if (pickedStartedAt === null) return I18n.t('widgets.live.offset_none');
    const at = new Date(pickedStartedAt);
    return formatTimeOfDay(at.getHours(), at.getMinutes());
  }, [pickedStartedAt]);

  const toggleAutoStart = useCallback(
    async (value: boolean) => {
      void triggerHaptic('selection');
      if (value) {
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
    [permissionStatus, setSchedule],
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
              onPress={() => void (running ? handleStop() : handleStart())}
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

        {/* How long, and how much of it has already gone: both describe the
            same session, so they sit under one header. */}
        {canRun && hydrated ? (
          <SettingsSection title={I18n.t('widgets.live.session_section')} showAccent={false}>
            {/* The duration is fixed for the life of a session, so the row goes
                read-only rather than offering a change that cannot be applied. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={I18n.t('widgets.live.duration_title')}
              accessibilityState={{ disabled: running }}
              disabled={running}
              onPress={() => {
                void triggerHaptic('selection');
                setHoursSheetVisible(true);
              }}
              className="h-[54px] flex-row items-center gap-3 rounded-3xl border border-border/40 bg-card/95 px-4"
              style={running ? styles.rowDisabled : undefined}
            >
              <Text variant="body" className="flex-1">
                {I18n.t('widgets.live.duration_title')}
              </Text>
              <Text variant="body" tone="muted">
                {hoursLabel(
                  running ? Math.round((session.endsAt - session.startedAt) / MS_PER_HOUR) : hours,
                )}
              </Text>
              {running ? null : <ChevronRight size={16} color={themeColors.textMuted} />}
            </Pressable>

            {/* Only meaningful while choosing a start: once a session is live
                its start time is already fixed. */}
            {running ? null : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={I18n.t('widgets.live.offset_title')}
                onPress={() => {
                  void triggerHaptic('selection');
                  setStartSheetVisible(true);
                }}
                className="h-[54px] flex-row items-center gap-3 rounded-3xl border border-border/40 bg-card/95 px-4"
              >
                <Text variant="body" className="flex-1">
                  {I18n.t('widgets.live.offset_title')}
                </Text>
                <Text variant="body" tone="muted">
                  {startedLabel}
                </Text>
                <ChevronRight size={16} color={themeColors.textMuted} />
              </Pressable>
            )}
          </SettingsSection>
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
            </View>
            <View className="gap-3 rounded-3xl border border-border/40 bg-card/95 px-4 py-3.5">
              <View className="flex-row items-center gap-3">
                <View className="flex-1 gap-0.5">
                  <Text variant="body">{I18n.t('widgets.live.schedule_title')}</Text>
                  <Text variant="caption" tone="muted">
                    {I18n.t('widgets.live.schedule_body')}
                  </Text>
                </View>
                <Switch
                  value={schedule.enabled}
                  onValueChange={(value) => void toggleAutoStart(value)}
                  trackColor={{ false: `${themeColors.border}80`, true: themeColors.primary }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {schedule.enabled ? (
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

      <HoursWheelSheet
        visible={hoursSheetVisible}
        hours={hours}
        onSelect={(next) => {
          setFailed(false);
          setSchedule({ hours: next });
          setHoursSheetVisible(false);
        }}
        onClose={() => setHoursSheetVisible(false)}
      />

      <StartTimeWheelSheet
        visible={startSheetVisible}
        startedAt={startedAt}
        hours={hours}
        onSelect={(next) => {
          setFailed(false);
          setStartedAt(next);
          setStartSheetVisible(false);
        }}
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
  rowDisabled: {
    opacity: 0.6,
  },
});
