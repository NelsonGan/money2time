import { AlertTriangle, Check, ChevronRight, ScanLine, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LoadingDots } from '~/components/feedback/LoadingDots';
import { Text } from '~/components/ui';
import { type ScanJob, useReceiptScans } from '~/context/ReceiptScanContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

interface ScanStatusBannerProps {
  /** Open the review list for a finished ("ready") scan job. */
  onReview: (job: ScanJob) => void;
}

/**
 * Floating home-screen banner that surfaces background receipt scans. A snapped
 * receipt is parsed by the Worker while the user keeps using the app; each job
 * shows here as `scanning → ready`, and tapping a ready job opens the review
 * list. Renders nothing when there are no active jobs.
 */
export function ScanStatusBanner({ onReview }: ScanStatusBannerProps) {
  const { jobs, dismissJob } = useReceiptScans();
  const insets = useSafeAreaInsets();

  if (jobs.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: insets.top + 8, left: 0, right: 0 }}
      className="px-4"
    >
      <View className="gap-2">
        {jobs.map((job) => (
          <ScanJobCard
            key={job.id}
            job={job}
            onReview={() => onReview(job)}
            onDismiss={() => dismissJob(job.id)}
          />
        ))}
      </View>
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
      style={({ pressed }) => ({
        opacity: pressed && pressable ? 0.85 : 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 6,
      })}
      className="flex-row items-center gap-3 rounded-[22px] border border-border/40 bg-card px-4 py-3"
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-full"
        style={{
          backgroundColor: isReady
            ? `${themeColors.success}22`
            : isError
              ? `${themeColors.error}22`
              : `${themeColors.primary}18`,
        }}
      >
        {job.status === 'scanning' ? (
          <LoadingDots size="small" color={themeColors.primary} />
        ) : isReady ? (
          <Check size={18} color={themeColors.success} />
        ) : (
          <AlertTriangle size={18} color={themeColors.error} />
        )}
      </View>

      <View className="flex-1">
        <Text variant="body" className="font-semibold">
          {titleFor(job)}
        </Text>
        <Text variant="caption" tone="muted">
          {subtitleFor(job)}
        </Text>
      </View>

      {job.status === 'scanning' ? (
        <ScanLine size={18} color={themeColors.textMuted} />
      ) : isReady ? (
        <ChevronRight size={18} color={themeColors.textMuted} />
      ) : (
        <View className="h-8 w-8 items-center justify-center">
          <X size={18} color={themeColors.textMuted} />
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
