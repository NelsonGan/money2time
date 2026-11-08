import { AlertTriangle, ChevronDown, ChevronRight, ChevronUp, X } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
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
import { ClayIcon, Text } from '~/components/ui';
import { type ScanJob, useReceiptScans } from '~/context/ReceiptScanContext';
import { groupScanJobs, summarizeScanBatch } from '~/features/transactions/lib/receiptScanBatch';
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
 * receipt is parsed by the Worker while the user keeps using the app. A normal
 * or screenshot scan stays as a session-only completion card that opens the
 * saved expense. A split scan opens the split editor for review. A failed scan
 * stays as a dismissible error.
 * Renders nothing when idle.
 */
export function ScanStatusBanner() {
  const { jobs, dismissJob, openReadyJob, openReadyJobAsSplit, openCreatedJob } = useReceiptScans();

  if (jobs.length === 0) return null;

  return (
    // No horizontal padding: the home header already insets this row (px-5).
    <View className="gap-2">
      {groupScanJobs(jobs).map((entry) =>
        entry.kind === 'batch' ? (
          <ScanBatchCard
            key={entry.batchId}
            jobs={entry.jobs}
            onDismissJob={dismissJob}
            onOpenCreated={openCreatedJob}
          />
        ) : (
          <ScanJobCard
            key={entry.job.id}
            job={entry.job}
            onDismiss={() => dismissJob(entry.job.id)}
            onOpen={() => openReadyJob(entry.job.id)}
            onOpenSplit={() => openReadyJobAsSplit(entry.job.id)}
            onOpenCreated={() => openCreatedJob(entry.job.id)}
          />
        ),
      )}
    </View>
  );
}

function ScanJobCard({
  job,
  onDismiss,
  onOpen,
  onOpenSplit,
  onOpenCreated,
}: {
  job: ScanJob;
  onDismiss: () => void;
  onOpen: () => void;
  onOpenSplit: () => void;
  onOpenCreated: () => void;
}) {
  const themeColors = useThemeColors();

  const isError = job.status === 'error';
  const isReady = job.status === 'ready';
  const isCreated = job.status === 'created';
  const tappable = isError || isReady || isCreated;
  // A split-intent scan opens Split by Item as its primary action; a quick
  // scan that parsed line items offers it as a secondary chip.
  const splitPrimary = isReady && job.intent === 'split' && !!job.splitPayload;
  const splitChip = isReady && !splitPrimary && !!job.splitPayload;

  const handlePress = () => {
    if (isCreated) {
      onOpenCreated();
      return;
    }
    if (isReady) {
      if (splitPrimary) {
        onOpenSplit();
        return;
      }
      onOpen();
      return;
    }
    if (isError) {
      void triggerHaptic('selection');
      onDismiss();
    }
  };

  return (
    <Pressable
      accessibilityRole={tappable ? 'button' : undefined}
      onPress={handlePress}
      disabled={!tappable}
      style={({ pressed }) => ({ opacity: pressed && tappable ? 0.9 : 1 })}
      className="flex-row items-center gap-3 rounded-2xl border border-border/50 bg-card px-3 py-2.5 shadow-soft"
    >
      {/* Leading status glyph. The clay art carries its own colour, so only the
          error state (a Lucide glyph) needs a tinted tile behind it. */}
      <View
        className={cn(
          'h-11 w-11 items-center justify-center rounded-2xl',
          isError ? 'bg-destructive/10' : null,
        )}
      >
        {isError ? (
          <AlertTriangle size={19} color={themeColors.error} />
        ) : (
          <ClayIcon
            name={isCreated ? 'status/success' : 'money-time/receipt'}
            size={32}
            flatSize={22}
          />
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
      ) : isReady || isCreated ? (
        <>
          <View className="flex-1">
            <Text variant="body" className="font-semibold text-foreground" numberOfLines={1}>
              {I18n.t(isCreated ? 'receiptScan.logged_title' : 'receiptScan.review_ready_title')}
            </Text>
            <Text variant="caption" tone="muted" className="mt-0.5" numberOfLines={1}>
              {I18n.t(isCreated ? 'receiptScan.logged_hint' : 'receiptScan.review_ready_hint')}
            </Text>
          </View>
          {/* Secondary action: open the parsed line items in Split by Item.
              Nested Pressable so it doesn't bubble to the card's open-on-tap. */}
          {splitChip ? (
            <Pressable
              accessibilityRole="button"
              onPress={onOpenSplit}
              hitSlop={6}
              className="rounded-full bg-primary/15 px-2.5 py-1.5"
            >
              <Text variant="caption" tone="primary" className="font-medium" numberOfLines={1}>
                {I18n.t('transactions.receiptSplit.split_by_item')}
              </Text>
            </Pressable>
          ) : null}
          {/* Dismiss the notice; a nested Pressable so it doesn't bubble to the
              card's open-on-tap. Created transactions retain their receipt. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.close')}
            onPress={() => {
              void triggerHaptic('selection');
              onDismiss();
            }}
            hitSlop={8}
            className="h-7 w-7 items-center justify-center rounded-full bg-secondary/60"
          >
            <X size={15} color={themeColors.textMuted} />
          </Pressable>
          <View className="h-7 w-7 items-center justify-center rounded-full bg-primary/15">
            <ChevronRight size={16} color={themeColors.primary} />
          </View>
        </>
      ) : (
        <ScanProgress />
      )}
    </Pressable>
  );
}

/**
 * One card for the receipts of a multi-select album pick, so ten receipts do
 * not push the calendar off screen. While they scan it shows how many are done;
 * afterwards how many expenses were logged and how many receipts failed. Tapping
 * it lists each receipt: a logged one opens its expense, a failed one can be
 * dismissed. The close button clears the whole batch once nothing is scanning.
 */
function ScanBatchCard({
  jobs,
  onDismissJob,
  onOpenCreated,
}: {
  jobs: ScanJob[];
  onDismissJob: (id: string) => void;
  onOpenCreated: (id: string) => void;
}) {
  const themeColors = useThemeColors();
  const [expanded, setExpanded] = useState(false);
  const summary = summarizeScanBatch(jobs);
  const running = summary.scanning > 0;
  const allFailed = !running && summary.createdJobs === 0;
  // Opened rows leave the batch, so remember that it logged something: a batch
  // whose logged rows were all opened must not claim "No expenses logged".
  const loggedRef = useRef(false);
  if (summary.createdJobs > 0) loggedRef.current = true;

  const toggle = () => {
    void triggerHaptic('selection');
    setExpanded((value) => !value);
  };

  const failedLabel =
    summary.failed > 0
      ? I18n.t(
          summary.failed === 1 ? 'receiptScan.batch_failed_one' : 'receiptScan.batch_failed_other',
          { count: summary.failed },
        )
      : null;
  // Only failed rows left after the logged ones were opened: lead with them.
  const onlyFailedLeft = summary.createdTransactions === 0 && loggedRef.current;
  const title =
    summary.createdTransactions > 0
      ? I18n.t(
          summary.createdTransactions === 1
            ? 'receiptScan.batch_logged_one'
            : 'receiptScan.batch_logged_other',
          { count: summary.createdTransactions },
        )
      : onlyFailedLeft && failedLabel
        ? failedLabel
        : I18n.t('receiptScan.batch_none_logged');
  const hint = failedLabel && !onlyFailedLeft ? failedLabel : I18n.t('receiptScan.batch_hint');
  const Chevron = expanded ? ChevronUp : ChevronDown;

  return (
    <View className="rounded-2xl border border-border/50 bg-card shadow-soft">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={toggle}
        style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
        className="flex-row items-center gap-3 px-3 py-2.5"
      >
        <View
          className={cn(
            'h-11 w-11 items-center justify-center rounded-2xl',
            allFailed ? 'bg-destructive/10' : null,
          )}
        >
          {allFailed ? (
            <AlertTriangle size={19} color={themeColors.error} />
          ) : (
            <ClayIcon
              name={running ? 'money-time/receipt' : 'status/success'}
              size={32}
              flatSize={22}
            />
          )}
        </View>

        {running ? (
          <BatchProgress done={summary.total - summary.scanning} total={summary.total} />
        ) : (
          <>
            <View className="flex-1">
              <Text variant="body" className="font-semibold text-foreground" numberOfLines={1}>
                {title}
              </Text>
              <Text variant="caption" tone="muted" className="mt-0.5" numberOfLines={1}>
                {hint}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={I18n.t('common.close')}
              onPress={() => {
                void triggerHaptic('selection');
                jobs.forEach((job) => onDismissJob(job.id));
              }}
              hitSlop={8}
              className="h-7 w-7 items-center justify-center rounded-full bg-secondary/60"
            >
              <X size={15} color={themeColors.textMuted} />
            </Pressable>
          </>
        )}
        <View className="h-7 w-7 items-center justify-center rounded-full bg-primary/15">
          <Chevron size={16} color={themeColors.primary} />
        </View>
      </Pressable>

      {expanded ? (
        <View className="border-t border-border/40 px-3 py-1">
          {jobs.map((job) => (
            <ScanBatchRow
              key={job.id}
              job={job}
              onOpen={() => onOpenCreated(job.id)}
              onDismiss={() => onDismissJob(job.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ScanBatchRow({
  job,
  onOpen,
  onDismiss,
}: {
  job: ScanJob;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const themeColors = useThemeColors();

  if (job.status === 'created') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        className="min-h-[44px] flex-row items-center gap-2.5 py-1.5"
      >
        <ClayIcon name="status/success" size={22} flatSize={16} />
        <Text variant="body" className="flex-1 text-foreground" numberOfLines={1}>
          {job.createdNote?.trim() || I18n.t('receiptScan.logged_title')}
        </Text>
        {job.createdAmountLabel ? (
          <Text variant="bodyStrong" className="text-foreground" numberOfLines={1}>
            {job.createdAmountLabel}
          </Text>
        ) : null}
        <ChevronRight size={16} color={themeColors.textMuted} />
      </Pressable>
    );
  }

  if (job.status === 'error') {
    return (
      <View className="min-h-[44px] flex-row items-center gap-2.5 py-1.5">
        <AlertTriangle size={16} color={themeColors.error} />
        <Text variant="body" className="flex-1 text-foreground" numberOfLines={1}>
          {errorTitle(job)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={I18n.t('common.close')}
          onPress={() => {
            void triggerHaptic('selection');
            onDismiss();
          }}
          hitSlop={8}
          className="h-7 w-7 items-center justify-center rounded-full bg-secondary/60"
        >
          <X size={15} color={themeColors.textMuted} />
        </Pressable>
      </View>
    );
  }

  return (
    <View className="min-h-[44px] flex-row items-center gap-2.5 py-1.5">
      <ClayIcon name="money-time/receipt" size={22} flatSize={16} />
      <Text variant="body" tone="muted" numberOfLines={1} className="shrink">
        {I18n.t('receiptScan.banner_scanning').replace(/…\s*$/, '')}
      </Text>
      <LoadingDots size="small" color={themeColors.textMuted} />
    </View>
  );
}

/** A batch's scanning row: how many receipts are done, on a real progress bar. */
function BatchProgress({ done, total }: { done: number; total: number }) {
  const themeColors = useThemeColors();
  const progress = useSharedValue(0);

  useEffect(() => {
    // A sliver before the first result lands, so the bar reads as started.
    progress.value = withTiming(Math.max(0.06, total > 0 ? done / total : 0), {
      duration: 420,
      easing: Easing.out(Easing.cubic),
    });
  }, [done, total, progress]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between gap-2">
        <View className="min-w-0 flex-1 flex-row items-center">
          <Text variant="caption" className="shrink font-medium text-foreground" numberOfLines={1}>
            {I18n.t('receiptScan.batch_scanning')}
          </Text>
          <LoadingDots size="small" color={themeColors.textMuted} style={{ marginLeft: 5 }} />
        </View>
        <Text variant="caption" tone="muted">
          {done}/{total}
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

/** The scanning row: rotating (fading) placeholder text + animated dots, a live
 *  percentage, and a progress bar. Other AI work (notification review) passes
 *  its own `label` and gets the same look. */
export function ScanProgress({ label }: { label?: string } = {}) {
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

  // Mirror the animated value onto React state in 5-point steps — the label
  // and stage message don't need per-percent fidelity, and each runOnJS hop is
  // a JS-thread re-render. The bar itself animates on the UI thread regardless.
  useDerivedValue(() => {
    const p = Math.round((progress.value * 100) / 5) * 5;
    if (p !== lastPct.value) {
      lastPct.value = p;
      runOnJS(setPct)(p);
    }
  });

  const message = label ? label.replace(/…\s*$/, '') : stageMessageForPct(pct);

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
  if (job.error === 'too_large') return I18n.t('receiptScan.too_large_title');
  return I18n.t('receiptScan.error_title');
}
