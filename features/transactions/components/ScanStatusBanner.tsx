import { AlertTriangle, Check, ChevronRight, Receipt, X } from 'lucide-react-native';
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

import { Text } from '~/components/ui';
import { type ScanJob, useReceiptScans } from '~/context/ReceiptScanContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { requestOpenScanReview } from '~/services/scanReviewNavigation';
import { cn } from '~/utils';

// The scan is a single, indeterminate request (no progress events), so we show
// a perceived-progress bar: ease toward ~92% over a typical inference window and
// let completion (the card flipping to "ready") stand in for 100%.
const PROGRESS_TARGET = 0.92;
const PROGRESS_DURATION_MS = 14000;

/**
 * Inline home-screen banner that surfaces background receipt scans. A snapped
 * receipt is parsed by the Worker while the user keeps using the app; each job
 * shows here as `scanning → ready`, and tapping a ready job opens the review
 * list (via the scanReviewNavigation bridge, handled by the root shell).
 * Renders nothing when there are no active jobs.
 */
export function ScanStatusBanner() {
  const { jobs, dismissJob } = useReceiptScans();

  if (jobs.length === 0) return null;

  return (
    // No horizontal padding: the home header already insets this row (px-5).
    <View className="gap-2">
      {jobs.map((job) => (
        <ScanJobCard
          key={job.id}
          job={job}
          onReview={() => requestOpenScanReview(job.id)}
          onDismiss={() => dismissJob(job.id)}
        />
      ))}
    </View>
  );
}

function ScanJobCard({
  job,
  onReview,
  onDismiss,
}: {
  job: ScanJob;
  onReview: () => void;
  onDismiss: () => void;
}) {
  const themeColors = useThemeColors();

  const isScanning = job.status === 'scanning';
  const isReady = job.status === 'ready';
  const isError = job.status === 'error';
  const pressable = isReady || isError;

  const handlePress = () => {
    if (!pressable) return;
    void triggerHaptic('selection');
    if (isReady) onReview();
    else onDismiss();
  };

  return (
    <Pressable
      accessibilityRole={pressable ? 'button' : undefined}
      onPress={handlePress}
      disabled={!pressable}
      style={({ pressed }) => ({ opacity: pressed && pressable ? 0.9 : 1 })}
      className={cn(
        'flex-row items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-soft',
        // The ready state is a call to action, so give it a soft accent wash.
        isReady ? 'border-primary/25 bg-primary/5' : 'border-border/50 bg-card',
      )}
    >
      {/* Leading status glyph in a soft-tinted tile */}
      <View
        className={cn(
          'h-11 w-11 items-center justify-center rounded-2xl',
          isReady ? 'bg-success/15' : isError ? 'bg-destructive/10' : 'bg-primary/10',
        )}
      >
        {isReady ? (
          <Check size={20} color={themeColors.success} strokeWidth={2.5} />
        ) : isError ? (
          <AlertTriangle size={19} color={themeColors.error} />
        ) : (
          <Receipt size={19} color={themeColors.primary} />
        )}
      </View>

      {isScanning ? (
        <ScanProgress />
      ) : (
        <>
          <View className="flex-1">
            <Text variant="body" className="font-semibold text-foreground" numberOfLines={1}>
              {isReady ? I18n.t('receiptScan.banner_ready') : errorTitle(job)}
            </Text>
            <Text variant="caption" tone="muted" className="mt-0.5" numberOfLines={1}>
              {isReady
                ? I18n.t('receiptScan.banner_ready_hint', { count: job.drafts.length })
                : I18n.t('receiptScan.banner_dismiss_hint')}
            </Text>
          </View>
          {isReady ? (
            <View className="h-7 w-7 items-center justify-center rounded-full bg-primary/12">
              <ChevronRight size={18} color={themeColors.primary} />
            </View>
          ) : (
            <View className="h-7 w-7 items-center justify-center rounded-full bg-secondary/60">
              <X size={15} color={themeColors.textMuted} />
            </View>
          )}
        </>
      )}
    </Pressable>
  );
}

/** The scanning row: placeholder text + a progress bar + a live percentage. */
function ScanProgress() {
  const themeColors = useThemeColors();
  const progress = useSharedValue(0);
  const lastPct = useSharedValue(-1);
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

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between gap-2">
        <Text variant="body" className="font-semibold text-foreground" numberOfLines={1}>
          {I18n.t('receiptScan.banner_scanning')}
        </Text>
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
