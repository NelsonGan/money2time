import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
  ZoomOut,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import {
  ADD_FAB_RIGHT_MARGIN,
  ADD_FAB_SIZE,
  getAboveFabRowInset,
} from '~/components/navigation/AddFab';
import { Text } from '~/components/ui';
import { BottomSheetModal } from '~/components/ui/bottom-sheet-modal';
import { ClayIcon, type ClayIconName } from '~/components/ui/ClayIcon';
import { springPresets } from '~/constants/motion';
import { type ScanJob, useReceiptScans } from '~/context/ReceiptScanContext';
import {
  NotificationReviewCard,
  useNotificationReviewState,
} from '~/features/autoLog/components/NotificationReviewBanner';
import { ScanStatusBanner } from '~/features/transactions/components/ScanStatusBanner';
import { groupScanJobs } from '~/features/transactions/lib/receiptScanBatch';
import { TABLET_CONTENT_MAX_WIDTH, useDeviceLayout } from '~/hooks/useDeviceLayout';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

const BUBBLE_SIZE = 52;
const RING_STROKE = 3;
const RING_RADIUS = (BUBBLE_SIZE - RING_STROKE) / 2;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** A finished scan, the user has something to look at (or act on). */
const isSettled = (job: ScanJob) => job.status !== 'scanning';

/**
 * Home's activity circle: one small floating button above the + that stands
 * for everything happening in the background, receipt and screenshot scans
 * and payment alerts waiting for review. While something runs, a ring spins
 * around it; when it finishes the circle pops and a badge counts what is
 * ready. Tapping it opens the Activity sheet with each scan's progress or
 * result and the review reminder. Closing the sheet clears the results that
 * were seen there (logged scans and failures); scans still running, split
 * scans waiting to be opened and notifications to review stay. Renders
 * nothing when there is no activity.
 */
export function HomeActivity({ shown }: { shown: boolean }) {
  const { jobs, dismissJob } = useReceiptScans();
  const review = useNotificationReviewState();
  const [open, setOpen] = useState(false);

  const entries = groupScanJobs(jobs);
  const scanning = jobs.some((job) => job.status === 'scanning');
  const running = scanning || review.reviewing > 0;
  const settledRows =
    entries.filter((entry) =>
      entry.kind === 'batch' ? entry.jobs.every(isSettled) : isSettled(entry.job),
    ).length + (review.visible && review.reviewing === 0 ? 1 : 0);
  const hasActivity = jobs.length > 0 || review.visible;

  // Nothing left (the last row was opened or cleared): close the sheet too.
  useEffect(() => {
    if (open && !hasActivity) setOpen(false);
  }, [hasActivity, open]);

  const close = () => {
    setOpen(false);
    // What was shown is seen: logged scans and failures leave, and AI's
    // review results move to History. Running scans and split scans that wait
    // to be opened stay.
    jobs
      .filter((job) => job.status === 'created' || job.status === 'error')
      .filter((job) => !job.batchId || jobs.every((j) => j.batchId !== job.batchId || isSettled(j)))
      .forEach((job) => dismissJob(job.id));
    review.markResultsSeen();
  };

  const icon: ClayIconName = scanning
    ? 'money-time/receipt'
    : review.reviewing > 0
      ? 'settings/notifications'
      : jobs.some((job) => job.status === 'created')
        ? 'status/success'
        : jobs.length > 0
          ? 'money-time/receipt'
          : 'settings/notifications';

  return (
    <>
      {shown && hasActivity ? (
        <ActivityBubble
          icon={icon}
          running={running}
          count={settledRows}
          onPress={() => {
            void triggerHaptic('selection');
            setOpen(true);
          }}
        />
      ) : null}
      <ActivitySheet visible={open} onClose={close} review={review} />
    </>
  );
}

function ActivityBubble({
  icon,
  running,
  count,
  onPress,
}: {
  icon: ClayIconName;
  running: boolean;
  count: number;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const { bottom: safeBottom } = useSafeAreaInsets();
  const { isTablet, navPlacement } = useDeviceLayout();

  // The ring: an arc that spins while something runs, then closes into a full
  // circle and fades once it is done, while the bubble pops.
  const spin = useSharedValue(0);
  const ringOpacity = useSharedValue(running ? 1 : 0);
  const pop = useSharedValue(1);
  const wasRunning = useRef(running);
  useEffect(() => {
    if (running) {
      ringOpacity.value = withTiming(1, { duration: 160 });
      spin.value = 0;
      spin.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1);
    } else {
      cancelAnimation(spin);
      if (wasRunning.current) {
        ringOpacity.value = withSequence(
          withTiming(1, { duration: 280 }),
          withTiming(0, { duration: 420 }),
        );
        pop.value = withSequence(
          withTiming(1.14, { duration: 140 }),
          withSpring(1, springPresets.wobble),
        );
      }
    }
    wasRunning.current = running;
  }, [pop, ringOpacity, running, spin]);

  const spinStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  // Svg props are not animated here: the arc length steps through React state
  // only twice (running and done), the rotation does the motion.
  const [arcShare, setArcShare] = useState(running ? 0.28 : 1);
  useEffect(() => {
    setArcShare(running ? 0.28 : 1);
  }, [running]);

  const label = count > 0 ? `${I18n.t('common.activity')}, ${count}` : I18n.t('common.activity');

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: getAboveFabRowInset(safeBottom, navPlacement),
        zIndex: 20,
      }}
    >
      <View
        pointerEvents="box-none"
        style={[
          {
            flexDirection: 'row',
            justifyContent: 'flex-end',
            // Centred over the + below it.
            paddingRight: ADD_FAB_RIGHT_MARGIN + (ADD_FAB_SIZE - BUBBLE_SIZE) / 2,
          },
          isTablet && {
            maxWidth: TABLET_CONTENT_MAX_WIDTH,
            alignSelf: 'center',
            width: '100%',
          },
        ]}
      >
        <Animated.View entering={ZoomIn.springify().damping(14)} exiting={ZoomOut.duration(180)}>
          <Animated.View style={popStyle}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ busy: running }}
              testID="home-activity-circle"
              onPress={onPress}
              style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }] })}
            >
              <View
                style={{
                  width: BUBBLE_SIZE,
                  height: BUBBLE_SIZE,
                  borderRadius: BUBBLE_SIZE / 2,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.16,
                  shadowRadius: 10,
                  elevation: 6,
                }}
                className="items-center justify-center border border-border bg-card"
              >
                <ClayIcon name={icon} size={30} flatSize={22} />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    {
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: BUBBLE_SIZE,
                      height: BUBBLE_SIZE,
                    },
                    spinStyle,
                  ]}
                >
                  <Svg width={BUBBLE_SIZE} height={BUBBLE_SIZE}>
                    <Circle
                      cx={BUBBLE_SIZE / 2}
                      cy={BUBBLE_SIZE / 2}
                      r={RING_RADIUS}
                      stroke={colors.primary}
                      strokeWidth={RING_STROKE}
                      strokeLinecap="round"
                      fill="none"
                      strokeDasharray={`${RING_LENGTH * arcShare} ${RING_LENGTH}`}
                    />
                  </Svg>
                </Animated.View>
              </View>
            </Pressable>
          </Animated.View>
          {count > 0 ? (
            <Animated.View
              key={count}
              entering={ZoomIn.springify().damping(12)}
              pointerEvents="none"
              style={{ position: 'absolute', top: -3, right: -3 }}
              className="h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-background bg-primary px-1"
            >
              <Text variant="caption" className="text-[11px] font-bold text-primary-foreground">
                {count > 9 ? '9+' : count}
              </Text>
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

function ActivitySheet({
  visible,
  onClose,
  review,
}: {
  visible: boolean;
  onClose: () => void;
  review: ReturnType<typeof useNotificationReviewState>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      maxHeight="75%"
      style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
    >
      <View className="items-center pt-2.5">
        <View className="h-1 w-10 rounded-full bg-border/60" />
      </View>
      <View className="px-5 pb-3 pt-4">
        <Text variant="headingSm" className="text-foreground" accessibilityRole="header">
          {I18n.t('common.activity')}
        </Text>
      </View>
      <View className="gap-2 px-4">
        <ScanStatusBanner onNavigate={onClose} />
        <NotificationReviewCard review={review} onOpen={onClose} />
      </View>
    </BottomSheetModal>
  );
}
