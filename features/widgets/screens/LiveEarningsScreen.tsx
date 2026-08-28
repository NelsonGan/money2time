import { ChevronRight } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Mascot } from '~/components/feedback/Mascot';
import {
  Button,
  Card,
  FatButton,
  SETTINGS_FORM_BOTTOM_PADDING,
  SETTINGS_HORIZONTAL_PADDING,
  SettingsHeader,
  SettingsPageLayout,
  Text,
  useSettingsBottomNavInset,
} from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useApp } from '~/context/AppContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { formatTimeOfDay } from '~/utils/formatters';

import { HoursWheelSheet } from '../components/HoursWheelSheet';
import { LiveEarningsPreview } from '../components/LiveEarningsPreview';
import { type LiveEarningsSession, MS_PER_HOUR, sessionEndFor } from '../lib/liveEarnings';
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

const DEFAULT_HOURS = 4;

function hoursLabel(hours: number) {
  return I18n.t(hours === 1 ? 'widgets.live.hours_one' : 'widgets.live.hours_other', {
    count: hours,
  });
}

export function LiveEarningsScreen({ onBack, onOpenHourlyValue }: LiveEarningsScreenProps) {
  const { settings, getTrueHourlyRateForDate } = useApp();
  const bottomNavInset = useSettingsBottomNavInset();
  const themeColors = useThemeColors();

  const currencySymbol = settings?.currencySymbol ?? '$';
  const hourlyRate = useMemo(
    () => getTrueHourlyRateForDate(new Date().toISOString()),
    [getTrueHourlyRateForDate],
  );
  const hasWage = hourlyRate > 0;

  const { available, hydrated, enabled, session, busy, start, stop } =
    useLiveEarningsActivity(hourlyRate);

  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [hoursSheetVisible, setHoursSheetVisible] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);
  // Anchored once so the sample keeps counting from when the screen opened
  // rather than restarting every time the duration changes.
  const [sampleStartedAt] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), PREVIEW_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Once an activity is running the card stops being a mock-up and becomes the
  // live view of it, so the screen shows one number rather than two that
  // disagree.
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

  const handleStart = useCallback(async () => {
    const started = await start(hours);
    setFailed(!started);
    if (started) void triggerHaptic('success');
  }, [hours, start]);

  const handleStop = useCallback(async () => {
    setFailed(false);
    await stop();
  }, [stop]);

  const canRun = available && hasWage && enabled;
  const running = session !== null;

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
          ) : !hydrated ? null : !enabled ? (
            <Card variant="outline" className="gap-2 p-5">
              <Text variant="bodyStrong">{I18n.t('widgets.live.disabled_title')}</Text>
              <Text variant="caption" tone="muted">
                {I18n.t('widgets.live.disabled_body')}
              </Text>
            </Card>
          ) : (
            // The duration is fixed for the life of a session, so the row goes
            // read-only rather than offering a change that cannot be applied.
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
          )}
        </View>
      </ScrollView>

      <HoursWheelSheet
        visible={hoursSheetVisible}
        hours={hours}
        onSelect={(next) => {
          setFailed(false);
          setHours(next);
          setHoursSheetVisible(false);
        }}
        onClose={() => setHoursSheetVisible(false)}
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
