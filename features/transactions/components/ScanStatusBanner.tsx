import { AlertTriangle, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { LoadingDots } from '~/components/feedback/LoadingDots';
import { CategoryEmoji, Text } from '~/components/ui';
import { type ScanJob, useReceiptScans } from '~/context/ReceiptScanContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

// The scan is a single, indeterminate request (no progress events), so we show
// a perceived-progress bar: ease toward ~92% over a typical inference window.
// On success the transaction is added and the job disappears (no 100% state).
const PROGRESS_TARGET = 0.92;
const PROGRESS_DURATION_MS = 14000;

// Placeholder text rotates through these as the bar fills, so a slow scan still
// feels like it's making progress. The trailing ellipsis is stripped and shown
// as animated dots instead.
const SCAN_STAGE_KEYS = [
  'receiptScan.banner_scanning',
  'receiptScan.banner_scanning_2',
  'receiptScan.banner_scanning_3',
  'receiptScan.banner_scanning_4',
] as const;

function stageMessageForPct(pct: number): string {
  const index = pct < 30 ? 0 : pct < 60 ? 1 : pct < 88 ? 2 : 3;
  // Drop the trailing "…" — animated dots stand in for it.
  return I18n.t(SCAN_STAGE_KEYS[index]).replace(/…\s*$/, '');
}

/**
 * Inline home-screen banner that surfaces background receipt scans. A snapped
 * receipt is parsed by the Worker while the user keeps using the app; the
 * scanned transaction is added automatically on success and the card vanishes.
 * A failed scan stays as a dismissible error. Renders nothing when idle.
 */
export function ScanStatusBanner() {
  const { jobs, dismissJob } = useReceiptScans();

  if (jobs.length === 0) return null;

  return (
    // No horizontal padding: the home header already insets this row (px-5).
    <View className="gap-2">
      {jobs.map((job) => (
        <ScanJobCard key={job.id} job={job} onDismiss={() => dismissJob(job.id)} />
      ))}
    </View>
  );
}

function ScanJobCard({ job, onDismiss }: { job: ScanJob; onDismiss: () => void }) {
  const themeColors = useThemeColors();

  const isError = job.status === 'error';

  const handlePress = () => {
    if (!isError) return;
    void triggerHaptic('selection');
    onDismiss();
  };

  return (
    <Pressable
      accessibilityRole={isError ? 'button' : undefined}
      onPress={handlePress}
      disabled={!isError}
      style={({ pressed }) => ({ opacity: pressed && isError ? 0.9 : 1 })}
      className="flex-row items-center gap-3 rounded-2xl border border-border/50 bg-card px-3 py-2.5 shadow-soft"
    >
      {/* Leading status glyph in a soft-tinted tile */}
      <View
        className={cn(
          'h-11 w-11 items-center justify-center rounded-2xl',
          isError ? 'bg-destructive/10' : 'bg-secondary/40',
        )}
      >
        {isError ? (
          <AlertTriangle size={19} color={themeColors.error} />
        ) : (
          // Custom hand-drawn receipt/invoice icon (🧾 → invoice.png).
          <CategoryEmoji icon="🧾" size={26} />
        )}
      </View>

      {isError ? (
        <>
          <View className="flex-1">
            <Text variant="body" className="font-semibold text-foreground" numberOfLines={1}>
              {errorTitle(job)}
            </Text>
            <Text variant="caption" tone="muted" className="mt-0.5" numberOfLines={1}>
              {I18n.t('receiptScan.banner_dismiss_hint')}
            </Text>
          </View>
          <View className="h-7 w-7 items-center justify-center rounded-full bg-secondary/60">
            <X size={15} color={themeColors.textMuted} />
          </View>
        </>
      ) : (
        <ScanProgress />
      )}
    </Pressable>
  );
}

/** The scanning row: rotating (fading) placeholder text + animated dots, a live
 *  percentage, and a progress bar. */
function ScanProgress() {
  const themeColors = useThemeColors();
  const progress = useSharedValue(0);
  const lastPct = useSharedValue(-1);
  const textOpacity = useSharedValue(1);
  const [pct, setPct] = useState(0);

  useEffect(() => {
    progress.value = withTiming(PROGRESS_TARGET, {
      duration: PROGRESS_DURATION_MS,
      easing: Easing.out(Easing.cubic),
    });
    return () => cancelAnimation(progress);
  }, [progress]);

  // Mirror the animated value onto React state only when the whole-number
  // percentage changes (setState bails on an unchanged value).
  useDerivedValue(() => {
    const p = Math.round(progress.value * 100);
    if (p !== lastPct.value) {
      lastPct.value = p;
      runOnJS(setPct)(p);
    }
  });

  const message = stageMessageForPct(pct);

  // Cross-fade the text each time the stage message changes.
  useEffect(() => {
    textOpacity.value = 0;
    textOpacity.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [message, textOpacity]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const textStyle = useAnimatedStyle(() => ({ opacity: textOpacity.value }));

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center">
          <Animated.View style={[textStyle, { flexShrink: 1 }]}>
            <Text variant="caption" className="font-medium text-foreground" numberOfLines={1}>
              {message}
            </Text>
          </Animated.View>
          <LoadingDots size="small" color={themeColors.textMuted} style={{ marginLeft: 5 }} />
        </View>
        <Text variant="caption" tone="muted">
          {pct}%
        </Text>
      </View>
      <View className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary/60">
        <Animated.View
          style={[
            { height: '100%', borderRadius: 999, backgroundColor: themeColors.primary },
            fillStyle,
          ]}
        />
      </View>
    </View>
  );
}

function errorTitle(job: ScanJob): string {
  if (job.error === 'empty') return I18n.t('receiptScan.empty_title');
  if (job.error === 'capacity') return I18n.t('receiptScan.busy_title');
  return I18n.t('receiptScan.error_title');
}
