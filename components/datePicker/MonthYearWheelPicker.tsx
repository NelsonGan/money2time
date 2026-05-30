import { X } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  type SharedValue,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

const ITEM_HEIGHT = 40;
const VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ITEMS;
const VERTICAL_PAD = ((VISIBLE_ITEMS - 1) / 2) * ITEM_HEIGHT;
const MAX_VISIBLE_DISTANCE = (VISIBLE_ITEMS - 1) / 2;
const YEAR_RANGE_HALF = 50;

interface MonthYearWheelPickerProps {
  visible: boolean;
  year: number;
  monthIndex: number;
  baseYear: number;
  monthLabels: string[];
  onSelect: (year: number, monthIndex: number) => void;
  onClose: () => void;
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 22,
    overflow: 'hidden',
  },
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
    height: ITEM_HEIGHT,
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
    height: ITEM_HEIGHT,
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
    const itemCenter = index * ITEM_HEIGHT;
    const relative = (itemCenter - scrollY.value) / ITEM_HEIGHT;
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
    const itemCenter = index * ITEM_HEIGHT;
    const distance = Math.abs((itemCenter - scrollY.value) / ITEM_HEIGHT);
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

interface WheelProps {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
}

function Wheel({ items, selectedIndex, onChange }: WheelProps) {
  const themeColors = useThemeColors();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue(selectedIndex * ITEM_HEIGHT);
  const lastHapticIndexSv = useSharedValue(selectedIndex);
  const suppressHapticRef = useRef(false);
  const initialOffsetRef = useRef({ x: 0, y: selectedIndex * ITEM_HEIGHT });
  const itemsLength = items.length;

  useEffect(() => {
    const targetY = selectedIndex * ITEM_HEIGHT;
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
        const rounded = Math.round(event.contentOffset.y / ITEM_HEIGHT);
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
      const idx = Math.round(offsetY / ITEM_HEIGHT);
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
          { top: VERTICAL_PAD + ITEM_HEIGHT, backgroundColor: themeColors.border },
        ]}
        pointerEvents="none"
      />
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
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

export function MonthYearWheelPicker({
  visible,
  year,
  monthIndex,
  baseYear,
  monthLabels,
  onSelect,
  onClose,
}: MonthYearWheelPickerProps) {
  const themeColors = useThemeColors();
  const years = useMemo(
    () => Array.from({ length: YEAR_RANGE_HALF * 2 + 1 }, (_, i) => baseYear - YEAR_RANGE_HALF + i),
    [baseYear],
  );
  const yearItems = useMemo(() => years.map((y) => String(y)), [years]);
  const yearStartValue = years[0];

  const [tempYear, setTempYear] = useState(year);
  const [tempMonth, setTempMonth] = useState(monthIndex);

  useEffect(() => {
    if (visible) {
      setTempYear(year);
      setTempMonth(monthIndex);
    }
  }, [visible, year, monthIndex]);

  const handleDone = () => {
    void triggerHaptic('medium');
    onSelect(tempYear, tempMonth);
  };

  const handleCancel = () => {
    void triggerHaptic('selection');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <View style={styles.centerWrap}>
        <TouchableWithoutFeedback onPress={handleCancel}>
          <View style={styles.backdrop} />
        </TouchableWithoutFeedback>
        <View style={[styles.card, { backgroundColor: themeColors.card }]}>
          <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
            <Text variant="subheading">{I18n.t('settings.select_year_month')}</Text>
            <Pressable
              onPress={handleCancel}
              accessibilityLabel={I18n.t('common.close')}
              className="w-8 h-8 rounded-full items-center justify-center bg-secondary/60"
            >
              <X size={14} color={themeColors.textSoft} />
            </Pressable>
          </View>

          <View className="px-3 py-2">
            <View className="flex-row">
              <View className="flex-1">
                <Wheel
                  items={yearItems}
                  selectedIndex={tempYear - yearStartValue}
                  onChange={(index) => setTempYear(yearStartValue + index)}
                />
              </View>
              <View className="flex-1">
                <Wheel items={monthLabels} selectedIndex={tempMonth} onChange={setTempMonth} />
              </View>
            </View>
          </View>

          <View className="flex-row gap-2 px-4 pt-2 pb-4">
            <Pressable
              onPress={handleCancel}
              accessibilityRole="button"
              className="flex-1 rounded-2xl py-3 items-center justify-center bg-secondary/60 active:opacity-70"
            >
              <Text variant="caption" tone="muted">
                {I18n.t('common.cancel')}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDone}
              accessibilityRole="button"
              className="flex-1 rounded-2xl py-3 items-center justify-center active:opacity-70"
              style={{ backgroundColor: themeColors.primary }}
            >
              <Text variant="caption" style={{ color: '#FFFFFF', fontWeight: '600' }}>
                {I18n.t('common.done')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
