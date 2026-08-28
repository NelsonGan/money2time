import { useCallback, useEffect, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';

export const WHEEL_ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
export const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * VISIBLE_ITEMS;
const VERTICAL_PAD = ((VISIBLE_ITEMS - 1) / 2) * WHEEL_ITEM_HEIGHT;
const MAX_VISIBLE_DISTANCE = (VISIBLE_ITEMS - 1) / 2;

const styles = StyleSheet.create({
  wheelOuter: {
    height: WHEEL_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  wheelHighlight: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: VERTICAL_PAD,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: 10,
  },
  wheelDivider: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: StyleSheet.hairlineWidth,
  },
  wheelContent: {
    paddingTop: VERTICAL_PAD,
    paddingBottom: VERTICAL_PAD,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

interface WheelItemProps {
  label: string;
  index: number;
  scrollY: SharedValue<number>;
  selectedColor: string;
  baseColor: string;
}

function WheelItem({ label, index, scrollY, selectedColor, baseColor }: WheelItemProps) {
  const animatedStyle = useAnimatedStyle(() => {
    const itemCenter = index * WHEEL_ITEM_HEIGHT;
    const relative = (itemCenter - scrollY.value) / WHEEL_ITEM_HEIGHT;
    const clamped = Math.max(
      -MAX_VISIBLE_DISTANCE - 1,
      Math.min(MAX_VISIBLE_DISTANCE + 1, relative),
    );
    const abs = Math.abs(clamped);
    const opacity =
      abs >= MAX_VISIBLE_DISTANCE
        ? Math.max(0, 1 - (abs - MAX_VISIBLE_DISTANCE + 1) * 0.9)
        : 1 - abs * 0.45;
    const scale = 1 - Math.min(0.25, abs * 0.12);
    const rotateDeg = clamped * 22;
    const translateY = -Math.sign(clamped) * Math.min(8, abs * 4);
    return {
      opacity,
      transform: [{ perspective: 600 }, { translateY }, { rotateX: `${rotateDeg}deg` }, { scale }],
    };
  });

  const labelStyle = useAnimatedStyle(() => {
    const itemCenter = index * WHEEL_ITEM_HEIGHT;
    const distance = Math.abs((itemCenter - scrollY.value) / WHEEL_ITEM_HEIGHT);
    return {
      color: distance < 0.5 ? selectedColor : baseColor,
      fontWeight: distance < 0.5 ? '600' : '400',
    };
  });

  return (
    <Animated.View style={[styles.wheelItem, animatedStyle]}>
      <Animated.Text style={[{ fontSize: 16 }, labelStyle]}>{label}</Animated.Text>
    </Animated.View>
  );
}

interface WheelPickerProps {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

/**
 * One scrollable wheel column: snapping, curved item transforms and a haptic
 * tick per detent. Shared so every wheel in the app rolls the same way rather
 * than each surface tuning its own copy.
 */
export function WheelPicker({ items, selectedIndex, onChange }: WheelPickerProps) {
  const themeColors = useThemeColors();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(selectedIndex * WHEEL_ITEM_HEIGHT);
  const lastHapticIndexSv = useSharedValue(selectedIndex);
  const suppressHapticRef = useRef(false);
  const initialOffsetRef = useRef({ x: 0, y: selectedIndex * WHEEL_ITEM_HEIGHT });
  const itemsLength = items.length;

  useEffect(() => {
    const targetY = selectedIndex * WHEEL_ITEM_HEIGHT;
    suppressHapticRef.current = true;
    lastHapticIndexSv.value = selectedIndex;
    // Scroll the view first, then mirror the shared value in the same tick so the
    // wheel-item transforms stay aligned with the actual scroll position. Without
    // this, items in the viewport briefly compute opacity for a position the
    // ScrollView hasn't reached yet and disappear until the user nudges it.
    scrollRef.current?.scrollTo({ y: targetY, animated: false });
    scrollY.value = targetY;
    const handle = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressHapticRef.current = false;
      });
    });
    return () => cancelAnimationFrame(handle);
  }, [lastHapticIndexSv, scrollRef, scrollY, selectedIndex]);

  const fireHaptic = useCallback(() => {
    if (suppressHapticRef.current) return;
    void triggerHaptic('selection');
  }, []);

  const scrollHandler = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        scrollY.value = event.contentOffset.y;
        const rounded = Math.round(event.contentOffset.y / WHEEL_ITEM_HEIGHT);
        const clamped = Math.max(0, Math.min(itemsLength - 1, rounded));
        if (clamped !== lastHapticIndexSv.value) {
          lastHapticIndexSv.value = clamped;
          runOnJS(fireHaptic)();
        }
      },
    },
    [fireHaptic, itemsLength, lastHapticIndexSv, scrollY],
  );

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event.nativeEvent.contentOffset.y;
      const idx = Math.round(offsetY / WHEEL_ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      onChange(clamped);
    },
    [items.length, onChange],
  );

  return (
    <View style={styles.wheelOuter}>
      <View
        style={[styles.wheelHighlight, { backgroundColor: themeColors.surface }]}
        pointerEvents="none"
      />
      <View
        style={[styles.wheelDivider, { top: VERTICAL_PAD, backgroundColor: themeColors.border }]}
        pointerEvents="none"
      />
      <View
        style={[
          styles.wheelDivider,
          { top: VERTICAL_PAD + WHEEL_ITEM_HEIGHT, backgroundColor: themeColors.border },
        ]}
        pointerEvents="none"
      />
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        nestedScrollEnabled
        contentContainerStyle={styles.wheelContent}
        contentOffset={initialOffsetRef.current}
        onScroll={scrollHandler}
        onMomentumScrollEnd={handleMomentumEnd}
        scrollEventThrottle={16}
      >
        {items.map((item, i) => (
          <WheelItem
            key={`${item}-${i}`}
            label={item}
            index={i}
            scrollY={scrollY}
            selectedColor={themeColors.primary}
            baseColor={themeColors.text}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}
