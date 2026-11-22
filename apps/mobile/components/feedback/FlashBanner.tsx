import { X } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  type EntryExitAnimationFunction,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Text } from '~/components/ui';
import { springPresets } from '~/constants/motion';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

/** How far down (pt) a swipe has to go, or how fast, before it dismisses. */
const SWIPE_DISMISS_DISTANCE = 28;
const SWIPE_DISMISS_VELOCITY = 600;

// Rises in from below, out of the navigation bar's direction.
const enterFromBelow: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 28 }, { scale: 0.96 }] },
    animations: {
      opacity: withTiming(1, { duration: 180 }),
      transform: [
        { translateY: withSpring(0, springPresets.softIn) },
        { scale: withSpring(1, springPresets.softIn) },
      ],
    },
  };
};

const exitDownwards: EntryExitAnimationFunction = () => {
  'worklet';
  return {
    initialValues: { opacity: 1, transform: [{ translateY: 0 }, { scale: 1 }] },
    animations: {
      opacity: withTiming(0, { duration: 160 }),
      transform: [
        { translateY: withTiming(20, { duration: 200, easing: Easing.in(Easing.cubic) }) },
        { scale: withTiming(0.96, { duration: 200 }) },
      ],
    },
  };
};

const REFLOW = LinearTransition.springify().damping(20).stiffness(240).mass(0.8);

export interface FlashBannerAction {
  label: string;
  onPress: () => void;
  /** Filled for the main action, tinted for a secondary one. */
  tone?: 'primary' | 'soft';
}

export interface FlashBannerProps {
  icon: React.ReactNode;
  /** Tints the icon tile, for a failure. */
  tone?: 'default' | 'error';
  title?: string;
  subtitle?: string | null;
  /** Replaces the title and subtitle (a progress row). */
  body?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityState?: { expanded?: boolean };
  actions?: (FlashBannerAction | null | false)[];
  /** A small round X before the actions. */
  onClose?: () => void;
  closeLabel?: string;
  /** Swipe down (or the accessibility escape gesture) to put the banner away. */
  onSwipeAway?: () => void;
  /**
   * Hides the banner after this long, drawing the time left as a thin line
   * along its bottom edge. Null keeps it until the user acts.
   */
  autoHideMs?: number | null;
  onAutoHide?: () => void;
  /** After the actions, e.g. an expand chevron. */
  trailing?: React.ReactNode;
  /** Below the main row, e.g. a batch's receipts. */
  children?: React.ReactNode;
  testID?: string;
}

/**
 * A floating banner that rises in over the bottom of a screen, above the
 * navigation bar, to say something just happened (a scan logged an expense,
 * notifications wait for review) and goes away again: it springs in from
 * below, can be swiped back down, and can hide itself after a while, with the
 * time left drawn along its bottom edge. Stack several in a
 * `FlashBannerStack`, which floats them over the content instead of pushing it
 * aside.
 */
export function FlashBanner({
  icon,
  tone = 'default',
  title,
  subtitle,
  body,
  onPress,
  accessibilityLabel,
  accessibilityState,
  actions,
  onClose,
  closeLabel,
  onSwipeAway,
  autoHideMs = null,
  onAutoHide,
  trailing,
  children,
  testID,
}: FlashBannerProps) {
  const colors = useThemeColors();
  const dragY = useSharedValue(0);
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
    opacity: 1 - Math.max(0, dragY.value) / 80,
  }));

  const swipe = Gesture.Pan()
    .enabled(!!onSwipeAway)
    .activeOffsetY([-8, 8])
    .failOffsetX([-16, 16])
    .onUpdate((event) => {
      // Down follows the finger; up only gives a little, as a rubber band.
      dragY.value = event.translationY > 0 ? event.translationY : event.translationY * 0.2;
    })
    .onEnd((event) => {
      if (
        onSwipeAway &&
        (event.translationY > SWIPE_DISMISS_DISTANCE || event.velocityY > SWIPE_DISMISS_VELOCITY)
      ) {
        dragY.value = withTiming(120, { duration: 180 }, (finished) => {
          if (finished) scheduleOnRN(onSwipeAway);
        });
        return;
      }
      dragY.value = withSpring(0, springPresets.snappy);
    });

  const shownActions = (actions ?? []).filter((action): action is FlashBannerAction => !!action);

  return (
    <Animated.View entering={enterFromBelow} exiting={exitDownwards} layout={REFLOW}>
      <GestureDetector gesture={swipe}>
        <Animated.View style={dragStyle}>
          <View
            className="overflow-hidden rounded-[22px] border border-primary/25 bg-card shadow-float-lg"
            testID={testID}
          >
            <Pressable
              accessibilityRole={onPress ? 'button' : undefined}
              accessibilityLabel={accessibilityLabel}
              accessibilityState={accessibilityState}
              onAccessibilityEscape={onSwipeAway}
              disabled={!onPress}
              onPress={onPress}
              style={({ pressed }) => ({ opacity: pressed && onPress ? 0.9 : 1 })}
              className={cn(
                'min-h-[60px] flex-row items-center gap-3 pl-2.5 pr-3',
                // Room for the time-left line along the bottom edge.
                autoHideMs ? 'pb-4 pt-2.5' : 'py-2.5',
              )}
            >
              <View
                className={cn(
                  'h-10 w-10 items-center justify-center rounded-2xl',
                  tone === 'error' ? 'bg-destructive/10' : null,
                )}
              >
                {icon}
              </View>
              <View className="h-7 w-px bg-border/70" />
              {body ?? (
                <View className="min-w-0 flex-1">
                  {title ? (
                    <Text
                      variant="body"
                      className="font-semibold text-foreground"
                      // Alone, a long title (or a long language) may wrap once.
                      numberOfLines={subtitle ? 1 : 2}
                    >
                      {title}
                    </Text>
                  ) : null}
                  {subtitle ? (
                    <Text variant="caption" tone="muted" className="mt-0.5" numberOfLines={1}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
              )}
              {onClose ? (
                // Nested Pressables, so neither bubbles to the banner's own tap.
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={closeLabel ?? I18n.t('common.close')}
                  hitSlop={8}
                  onPress={() => {
                    void triggerHaptic('selection');
                    onClose();
                  }}
                  className="h-7 w-7 items-center justify-center rounded-full bg-secondary/70"
                >
                  <X size={15} color={colors.textMuted} />
                </Pressable>
              ) : null}
              {shownActions.map((action) => (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => {
                    void triggerHaptic('selection');
                    action.onPress();
                  }}
                  style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
                  className={cn(
                    'rounded-full px-3.5 py-1.5',
                    action.tone === 'soft' ? 'bg-primary/15' : 'bg-primary',
                  )}
                >
                  <Text
                    variant="caption"
                    className={cn(
                      'font-semibold',
                      action.tone === 'soft' ? 'text-primary' : 'text-primary-foreground',
                    )}
                    numberOfLines={1}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
              {trailing}
            </Pressable>
            {children}
            {autoHideMs && onAutoHide ? (
              <AutoHideLine durationMs={autoHideMs} onDone={onAutoHide} />
            ) : null}
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

/** The time left before the banner hides itself, shrinking to nothing. */
function AutoHideLine({ durationMs, onDone }: { durationMs: number; onDone: () => void }) {
  const colors = useThemeColors();
  const left = useSharedValue(1);

  useEffect(() => {
    left.value = 1;
    left.value = withTiming(0, { duration: durationMs, easing: Easing.linear }, (finished) => {
      if (finished) scheduleOnRN(onDone);
    });
    return () => cancelAnimation(left);
    // `onDone` is read when the line runs out; a new callback must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs, left]);

  const lineStyle = useAnimatedStyle(() => ({ width: `${left.value * 100}%` }));

  return (
    <View
      pointerEvents="none"
      className="absolute bottom-1.5 left-14 right-4 h-[3px] overflow-hidden rounded-full bg-secondary/60"
    >
      <Animated.View
        style={[{ height: '100%', borderRadius: 999, backgroundColor: colors.primary }, lineStyle]}
      />
    </View>
  );
}

/**
 * Floats flash banners over the bottom of a screen, above the navigation bar
 * and its floating buttons, so they never push the content aside. Taps between
 * and around the banners reach the screen below.
 */
export function FlashBannerStack({
  bottom,
  right = 0,
  children,
}: {
  /** Distance from the bottom of the screen, clear of the bar and its buttons. */
  bottom: number;
  /** Extra room on the right, e.g. a second pane. */
  right?: number;
  children: React.ReactNode;
}) {
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', bottom, left: 0, right, zIndex: 50, elevation: 50 }}
      className="items-center px-3"
    >
      <View pointerEvents="box-none" className="w-full max-w-[560px] gap-2">
        {children}
      </View>
    </View>
  );
}
