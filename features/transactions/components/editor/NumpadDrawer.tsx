import React, { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useThemeColors } from '~/hooks/useThemeColors';

import { NumpadPanel } from './NumpadPanel';

/** Height of the always-visible grab handle strip (the peek when collapsed). */
export const NUMPAD_HANDLE_HEIGHT = 30;

interface NumpadDrawerProps {
  /** Whether the drawer is snapped open. Controlled by the parent. */
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Optional row rendered above the pad (e.g. currency chips); must be
   *  `headerHeight` tall so the collapse offset stays exact. */
  header?: React.ReactNode;
  headerHeight: number;
  /** Fixed height of the numpad body below the handle + header. */
  numpadHeight: number;
  // NumpadPanel passthrough.
  initialExpression: string;
  resetNonce?: number;
  onValueChange: (expression: string) => void;
  onConfirm: (formatted: string) => void;
}

function clampY(value: number, max: number): number {
  'worklet';
  if (value < 0) return 0;
  if (value > max) return max;
  return value;
}

/**
 * A bottom drawer that holds the amount numpad. It never fully leaves the
 * screen: collapsing tucks the pad below the fold and leaves a grab handle
 * peeking, which the user can drag or tap to pull the pad back up. `expanded`
 * is controlled so the editor can pop it open when the amount row is tapped.
 */
export function NumpadDrawer({
  expanded,
  onExpandedChange,
  header,
  headerHeight,
  numpadHeight,
  initialExpression,
  resetNonce,
  onValueChange,
  onConfirm,
}: NumpadDrawerProps) {
  const themeColors = useThemeColors();
  const fullHeight = NUMPAD_HANDLE_HEIGHT + headerHeight + numpadHeight;
  const collapsedOffset = fullHeight - NUMPAD_HANDLE_HEIGHT;

  const translateY = useSharedValue(expanded ? 0 : collapsedOffset);
  const startY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withTiming(expanded ? 0 : collapsedOffset, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    });
  }, [expanded, collapsedOffset, translateY]);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .onStart(() => {
        startY.value = translateY.value;
      })
      .onUpdate((event) => {
        translateY.value = clampY(startY.value + event.translationY, collapsedOffset);
      })
      .onEnd((event) => {
        // Fast flick wins; otherwise snap to whichever half we're closest to.
        const collapse =
          event.velocityY > 400 ||
          (event.velocityY >= -400 && translateY.value > collapsedOffset / 2);
        runOnJS(onExpandedChange)(!collapse);
      });
    const tap = Gesture.Tap().onEnd(() => {
      const expand = translateY.value > collapsedOffset / 2;
      runOnJS(onExpandedChange)(expand);
    });
    return Gesture.Race(pan, tap);
  }, [collapsedOffset, onExpandedChange, startY, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.drawer,
        {
          height: fullHeight,
          backgroundColor: themeColors.card,
          borderColor: themeColors.border,
        },
        animatedStyle,
      ]}
    >
      <GestureDetector gesture={gesture}>
        <View style={styles.handleArea}>
          <View style={[styles.grabber, { backgroundColor: themeColors.border }]} />
        </View>
      </GestureDetector>
      {header ? <View style={{ height: headerHeight }}>{header}</View> : null}
      <View style={{ height: numpadHeight }}>
        <NumpadPanel
          resetNonce={resetNonce}
          initialExpression={initialExpression}
          onValueChange={onValueChange}
          onConfirm={onConfirm}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  drawer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    // Lift the drawer off the fields behind it.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
  },
  handleArea: {
    height: NUMPAD_HANDLE_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grabber: {
    height: 4,
    width: 40,
    borderRadius: 999,
  },
});
