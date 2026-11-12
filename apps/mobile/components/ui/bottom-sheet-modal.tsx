import React, { useEffect, useRef, useState } from 'react';
import {
  type DimensionValue,
  Pressable,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
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
  // The panel's height, so it starts just below the screen edge; until it is
  // measured, a whole screen.
  const panelHeight = useSharedValue(windowHeight);

  // Keeps what the sheet last showed while it slides away.
  const shownChildren = useRef(children);
  const shownOverlay = useRef(overlay);
  if (visible) {
    shownChildren.current = children;
    shownOverlay.current = overlay;
  }

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.set(withTiming(1, { duration: OPEN_MS, easing: EASE_SHEET }));
      return;
    }
    progress.set(
      withTiming(0, { duration: CLOSE_MS, easing: EASE_SHEET }, (finished) => {
        if (finished) scheduleOnRN(setMounted, false);
      }),
    );
  }, [progress, visible]);

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
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end" pointerEvents={visible ? 'auto' : 'none'}>
        <Animated.View style={[StyleSheet.absoluteFill, dimStyle]}>
          <Pressable accessible={false} className="flex-1 bg-black/40" onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[sheetColumnStyle, maxHeight != null ? { maxHeight } : null, panelStyle]}
          onLayout={(event) => panelHeight.set(event.nativeEvent.layout.height)}
        >
          <View
            className={cn('shrink overflow-hidden rounded-t-[28px] bg-background', className)}
            style={style}
          >
            {shownChildren.current}
          </View>
        </Animated.View>
        {shownOverlay.current}
      </View>
    </ThemeModal>
  );
}
