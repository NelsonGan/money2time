import { AlertTriangle, Check, ChevronRight, Receipt, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';

import { LoadingDots } from '~/components/feedback/LoadingDots';
import { Text } from '~/components/ui';
import { type ScanJob, useReceiptScans } from '~/context/ReceiptScanContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { requestOpenScanReview } from '~/services/scanReviewNavigation';
import { cn } from '~/utils';

/**
 * Inline home-screen banner that surfaces background receipt scans. A snapped
 * receipt is parsed by the Worker while the user keeps using the app; each job
 * shows here as `scanning → ready`, and tapping a ready job opens the review
 * list (via the scanReviewNavigation bridge, handled by the root shell).
 * Renders nothing when there are no active jobs. Sits between the income/expense
 * summary and the transaction list on the home view.
 */
export function ScanStatusBanner() {
  const { jobs, dismissJob } = useReceiptScans();

  if (jobs.length === 0) return null;

  return (
    // No horizontal padding: the home header already insets this row (px-5) to
    // line up with the income/expense summary above it.
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

      {/* Title + supporting line */}
      <View className="flex-1">
        <Text variant="body" className="font-semibold text-foreground" numberOfLines={1}>
          {titleFor(job)}
        </Text>
        <Text variant="caption" tone="muted" className="mt-0.5" numberOfLines={1}>
          {subtitleFor(job)}
        </Text>
      </View>

      {/* Trailing affordance */}
      {isScanning ? (
        <View className="pr-1">
          <LoadingDots size="small" color={themeColors.primary} />
        </View>
      ) : isReady ? (
        <View className="h-7 w-7 items-center justify-center rounded-full bg-primary/12">
          <ChevronRight size={18} color={themeColors.primary} />
        </View>
      ) : (
        <View className="h-7 w-7 items-center justify-center rounded-full bg-secondary/60">
          <X size={15} color={themeColors.textMuted} />
        </View>
      )}
    </Pressable>
  );
}

function titleFor(job: ScanJob): string {
  switch (job.status) {
    case 'scanning':
      return I18n.t('receiptScan.banner_scanning');
    case 'ready':
      return I18n.t('receiptScan.banner_ready');
    case 'error':
      if (job.error === 'empty') return I18n.t('receiptScan.empty_title');
      if (job.error === 'capacity') return I18n.t('receiptScan.busy_title');
      return I18n.t('receiptScan.error_title');
  }
}

function subtitleFor(job: ScanJob): string {
  switch (job.status) {
    case 'scanning':
      return I18n.t('receiptScan.banner_scanning_hint');
    case 'ready':
      return I18n.t('receiptScan.banner_ready_hint', { count: job.drafts.length });
    case 'error':
      return I18n.t('receiptScan.banner_dismiss_hint');
  }
}
