import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  type DimensionValue,
  type LayoutChangeEvent,
  Pressable,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useSheetColumnStyle } from '~/hooks/useSheetColumnStyle';
import { cn } from '~/utils';

import { ThemeModal } from './theme-modal';

// The iOS sheet curve. Opening runs a little longer than closing, as iOS does.
const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1);
const OPEN_MS = 320;
const CLOSE_MS = 240;
// The timings always run: with Reduce Motion on, the panel fades instead of
// sliding (see panelStyle), and a timing that honoured the setting would jump
// straight to its end, so nothing would fade at all.
const FADE = ReduceMotion.Never;
const ignore = () => {};

interface BottomSheetModalProps {
  visible: boolean;
  /** A tap on the dimmed screen, and the Android back button. */
  onClose: () => void;
  children: React.ReactNode;
  /** Classes for the panel, added to its rounded top and background. */
  className?: string;
  style?: StyleProp<ViewStyle>;
  /** Caps the panel's height (a share of the screen, or points). */
  maxHeight?: DimensionValue;
  /**
   * Drawn over the whole screen above the panel and its dim, and not slid
   * with it: a picker sheet that opens from inside this one (`overlay`).
   */
  overlay?: React.ReactNode;
}

/**
 * A panel at the bottom over a dimmed screen. The dim fades in and out where
 * it is and only the panel slides, the way iOS presents a sheet. A Modal's own
 * `slide` moves everything inside it, so a dim drawn inside a sliding Modal
 * rose up the screen with the panel like a curtain.
 *
 * The Modal stays up until the panel has slid away, showing what it showed
 * when it was closed, so callers can clear their state the moment it closes.
 */
export function BottomSheetModal({
  visible,
  onClose,
  children,
  className,
  style,
  maxHeight,
  overlay,
}: BottomSheetModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const sheetColumnStyle = useSheetColumnStyle();
  const reducedMotion = useReducedMotion();

  const [mounted, setMounted] = useState(visible);
  // 0 hidden, 1 shown: the dim's opacity and how far the panel has risen.
  const progress = useSharedValue(0);
  // The panel's height, so it starts just below the screen edge.
  const panelHeight = useSharedValue(windowHeight);
  // Whether the panel has been laid out since the Modal last mounted. An open
  // waits for it, so the panel slides its own height from its first frame
  // instead of starting a screen away and jumping when it is measured.
  const measured = useRef(false);
  const openPending = useRef(false);
  const visibleRef = useRef(visible);

  // What the sheet last showed, kept while it slides away. Recorded once a
  // visible render has committed.
  const shownChildren = useRef(children);
  const shownOverlay = useRef(overlay);
  useLayoutEffect(() => {
    if (!visible) return;
    shownChildren.current = children;
    shownOverlay.current = overlay;
  });

  const slideIn = useCallback(() => {
    progress.set(withTiming(1, { duration: OPEN_MS, easing: EASE_SHEET, reduceMotion: FADE }));
  }, [progress]);

  const finishClose = useCallback(() => {
    // Opened again while it was sliding away: stay up.
    if (visibleRef.current) return;
    measured.current = false;
    setMounted(false);
  }, []);

  useEffect(() => {
    visibleRef.current = visible;
    if (visible) {
      if (measured.current) {
        slideIn();
      } else {
        openPending.current = true;
        setMounted(true);
      }
      return;
    }
    openPending.current = false;
    // Never shown (first mount hidden, or closed before it was laid out).
    if (progress.get() === 0) {
      finishClose();
      return;
    }
    progress.set(
      withTiming(0, { duration: CLOSE_MS, easing: EASE_SHEET, reduceMotion: FADE }, (finished) => {
        if (finished) scheduleOnRN(finishClose);
      }),
    );
  }, [finishClose, progress, slideIn, visible]);

  const handleLayout = (event: LayoutChangeEvent) => {
    panelHeight.set(event.nativeEvent.layout.height);
    measured.current = true;
    if (openPending.current) {
      openPending.current = false;
      slideIn();
    }
  };

  const dimStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const panelStyle = useAnimatedStyle(() =>
    reducedMotion
      ? { opacity: progress.get() }
      : { transform: [{ translateY: (1 - progress.get()) * panelHeight.get() }] },
  );

  return (
    <ThemeModal
      visible={mounted}
      transparent
      animationType="none"
      presentationStyle="overFullScreen"
      // A sheet already sliding away is closed; Back must not close it twice.
      onRequestClose={visible ? onClose : ignore}
    >
      <View className="flex-1 justify-end" pointerEvents={visible ? 'auto' : 'none'}>
        <Animated.View style={[StyleSheet.absoluteFill, dimStyle]}>
          <Pressable accessible={false} className="flex-1 bg-black/40" onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[sheetColumnStyle, maxHeight != null ? { maxHeight } : null, panelStyle]}
          onLayout={handleLayout}
        >
          <View
            className={cn('shrink overflow-hidden rounded-t-[28px] bg-background', className)}
            style={style}
          >
            {visible ? children : shownChildren.current}
          </View>
        </Animated.View>
        {visible ? overlay : shownOverlay.current}
      </View>
    </ThemeModal>
  );
}
