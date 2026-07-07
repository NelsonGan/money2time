import { Calendar, Delete } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

import {
  appendDecimal,
  appendDigit,
  appendOperator,
  evaluateExpression,
  formatMoney,
  sanitizeInitialAmount,
} from './calculatorEngine';

type Operator = '+' | '-' | '×' | '÷';
type KeyValue = string;

// Stable icon elements for the combo operator keys — hoisted so their identity
// doesn't change per keystroke, keeping NumpadKey's React.memo effective.
const MINUS_DIVIDE_ICON = (
  <Text variant="subheading" className="text-primary">
    {'−   ÷'}
  </Text>
);
const PLUS_TIMES_ICON = (
  <Text variant="subheading" className="text-primary">
    {'+   ×'}
  </Text>
);

interface NumpadPanelProps {
  initialExpression: string;
  /**
   * Bump to clear the pad in place (used by bulk create between saves). An
   * explicit signal because the pad deliberately ignores an emptied
   * `initialExpression` while it holds a value — and cheaper than a `key`
   * remount, which would rebuild every animated key inside the Save handler.
   */
  resetNonce?: number;
  onValueChange: (expression: string) => void;
  onConfirm: (formatted: string) => void;
  onBackgroundPress?: () => void;
  /**
   * Compact 4x4 layout: digits + decimal + delete + a single +/- pair, no
   * C / × / ÷ / Done. Used by the sticky amount drawer.
   */
  compact?: boolean;
  /** Compact only: turns the top-right key into a date-picker button. */
  onDatePress?: () => void;
  /** Compact only: label shown on the date button (e.g. "Jul 7"). */
  dateLabel?: string;
}

const NumpadKey = React.memo(function NumpadKey({
  value,
  onPress,
  onLongPress,
  variant = 'default',
  icon,
  className,
}: {
  value: KeyValue;
  onPress: (key: KeyValue) => void;
  onLongPress?: () => void;
  variant?: 'default' | 'operator' | 'utility' | 'confirm';
  icon?: React.ReactNode;
  className?: string;
}) {
  const pressProgress = useSharedValue(0);
  const pressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressProgress.value * 0.12 }],
    opacity: 1 - pressProgress.value * 0.32,
  }));
  const tapFlash = useSharedValue(0);
  const tapFlashStyle = useAnimatedStyle(() => ({
    opacity: tapFlash.value,
  }));
  const tapOverlayClassName =
    variant === 'confirm'
      ? 'bg-primary-foreground/28'
      : variant === 'operator'
        ? 'bg-primary/20'
        : 'bg-foreground/12';
  const rippleColor = variant === 'confirm' ? 'rgba(255,255,255,0.28)' : 'rgba(34, 138, 111, 0.2)';

  const handlePressIn = useCallback(() => {
    pressProgress.value = withTiming(1, {
      duration: 70,
      easing: Easing.out(Easing.quad),
    });
    tapFlash.value = withSequence(
      withTiming(0.32, {
        duration: 45,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(0, {
        duration: 160,
        easing: Easing.in(Easing.quad),
      }),
    );
    void triggerHaptic('light');
    onPress(value);
  }, [onPress, pressProgress, tapFlash, value]);

  const handlePressOut = useCallback(() => {
    pressProgress.value = withTiming(0, {
      duration: 120,
      easing: Easing.out(Easing.quad),
    });
  }, [pressProgress]);

  return (
    <View className={cn('flex-1', className)}>
      <Animated.View style={[pressAnimatedStyle, { flex: 1 }]}>
        <Pressable
          onPressIn={handlePressIn}
          onLongPress={onLongPress}
          onPressOut={handlePressOut}
          unstable_pressDelay={0}
          android_disableSound
          android_ripple={{ color: rippleColor, borderless: false }}
          className={cn(
            'relative flex-1 overflow-hidden rounded-[18px] items-center justify-center border',
            variant === 'confirm' && 'bg-primary border-primary/60',
            variant === 'operator' && 'bg-primary/10 border-primary/35',
            variant === 'utility' && 'bg-secondary border-border/45',
            variant === 'default' && 'bg-card border-border/40',
          )}
        >
          {icon ?? (
            <Text
              variant={variant === 'confirm' ? 'bodyStrong' : 'subheading'}
              className={cn(
                variant === 'confirm' ? 'text-primary-foreground' : 'text-foreground',
                variant === 'operator' && 'text-primary',
              )}
            >
              {value}
            </Text>
          )}
          <Animated.View
            pointerEvents="none"
            className={cn('absolute inset-0 rounded-[18px]', tapOverlayClassName)}
            style={tapFlashStyle}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
});

export function NumpadPanel({
  initialExpression,
  resetNonce,
  onValueChange,
  onConfirm,
  onBackgroundPress,
  compact = false,
  onDatePress,
  dateLabel,
}: NumpadPanelProps) {
  const themeColors = useThemeColors();
  const { bottom: bottomInset } = useSafeAreaInsets();
  // The live expression is held only in a ref: it drives the key handlers but is
  // never rendered (the entered value is displayed by the parent via
  // onValueChange / onConfirm), so keeping it out of state avoids re-rendering
  // the whole pad — and its ~16 animated keys — on every keystroke.
  const prevInitialRef = useRef(initialExpression);
  const expressionRef = useRef(sanitizeInitialAmount(initialExpression));
  const pristineRef = useRef(initialExpression.length > 0);

  useEffect(() => {
    if (initialExpression === prevInitialRef.current) return;
    prevInitialRef.current = initialExpression;
    if (expressionRef.current.length > 0) return;
    const sanitized = sanitizeInitialAmount(initialExpression);
    if (sanitized === expressionRef.current) return;
    expressionRef.current = sanitized;
    pristineRef.current = sanitized.length > 0;
  }, [initialExpression]);

  const prevResetNonceRef = useRef(resetNonce);
  useEffect(() => {
    if (resetNonce === prevResetNonceRef.current) return;
    prevResetNonceRef.current = resetNonce;
    expressionRef.current = '';
    pristineRef.current = false;
  }, [resetNonce]);

  const handleKeyPress = useCallback(
    (rawKey: KeyValue) => {
      // Combo operator keys cycle on repeated taps: first tap inserts the
      // primary operator, tapping again swaps it for the secondary.
      let key = rawKey;
      if (rawKey === 'plusTimes' || rawKey === 'minusDivide') {
        const primary = rawKey === 'plusTimes' ? '+' : '-';
        const secondary = rawKey === 'plusTimes' ? '×' : '÷';
        key = expressionRef.current.slice(-1) === primary ? secondary : primary;
      }

      let currentExpression = expressionRef.current;
      let nextExpression = currentExpression;

      // When the amount is pre-filled and user hasn't typed yet,
      // digits/decimal replace the value; operators append to it.
      if (pristineRef.current) {
        pristineRef.current = false;
        if ((key >= '0' && key <= '9') || key === '.') {
          currentExpression = '';
        }
      }

      if (key >= '0' && key <= '9') {
        nextExpression = appendDigit(currentExpression, key);
      } else if (key === '.') {
        nextExpression = appendDecimal(currentExpression);
      } else if (key === 'C') {
        nextExpression = '';
      } else if (key === 'del') {
        nextExpression = currentExpression.slice(0, -1);
      } else if (key === 'enter') {
        const formatted = formatMoney(evaluateExpression(currentExpression));
        expressionRef.current = formatted;
        onConfirm(formatted);
        return;
      } else if (key === '=') {
        // "=" only computes a pending operation. A plain number (no binary
        // operator — a leading "-" is just a sign) is left untouched so it stays
        // editable. After a real computation the result behaves like a pre-fill:
        // the next digit replaces it, so the value never gets "stuck".
        const body = currentExpression.startsWith('-')
          ? currentExpression.slice(1)
          : currentExpression;
        if (!/[+\-×÷]/.test(body)) {
          return;
        }
        const formatted = formatMoney(evaluateExpression(currentExpression));
        expressionRef.current = formatted;
        pristineRef.current = true;
        onValueChange(formatted);
        return;
      } else if (['+', '-', '×', '÷'].includes(key)) {
        nextExpression = appendOperator(currentExpression, key as Operator);
      }

      expressionRef.current = nextExpression;
      onValueChange(nextExpression);
    },
    [onConfirm, onValueChange],
  );

  const handleDeleteLongPress = useCallback(() => {
    handleKeyPress('C');
  }, [handleKeyPress]);

  const deleteKey = useMemo(
    () => (
      <NumpadKey
        value="del"
        variant="utility"
        onPress={handleKeyPress}
        onLongPress={handleDeleteLongPress}
        icon={<Delete size={15} color={themeColors.textMuted} />}
      />
    ),
    [handleKeyPress, handleDeleteLongPress, themeColors.textMuted],
  );
  // Hoisted so the confirm key's icon keeps a stable identity and its
  // React.memo bails out instead of re-rendering when the panel re-renders.
  const enterIcon = useMemo(
    () => (
      <Text variant="bodyStrong" className="text-primary-foreground">
        {I18n.t('common.done')}
      </Text>
    ),
    [],
  );

  if (compact) {
    return (
      <View className="flex-1 px-3.5 pt-1">
        <View className="flex-1 gap-1.5">
          <View className="flex-1 flex-row gap-1.5">
            <NumpadKey value="7" onPress={handleKeyPress} />
            <NumpadKey value="8" onPress={handleKeyPress} />
            <NumpadKey value="9" onPress={handleKeyPress} />
            {onDatePress ? (
              <View className="flex-1">
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    onDatePress();
                  }}
                  android_disableSound
                  android_ripple={{ color: 'rgba(34, 138, 111, 0.2)', borderless: false }}
                  className="flex-1 flex-col items-center justify-center gap-0.5 rounded-[18px] border border-border/45 bg-secondary active:opacity-70"
                >
                  <Calendar size={15} color={themeColors.textMuted} />
                  {dateLabel ? (
                    <Text variant="caption" tone="muted" className="text-[11px]">
                      {dateLabel}
                    </Text>
                  ) : null}
                </Pressable>
              </View>
            ) : (
              <View className="flex-1" />
            )}
          </View>
          <View className="flex-1 flex-row gap-1.5">
            <NumpadKey value="4" onPress={handleKeyPress} />
            <NumpadKey value="5" onPress={handleKeyPress} />
            <NumpadKey value="6" onPress={handleKeyPress} />
            {deleteKey}
          </View>
          <View className="flex-1 flex-row gap-1.5">
            <NumpadKey value="1" onPress={handleKeyPress} />
            <NumpadKey value="2" onPress={handleKeyPress} />
            <NumpadKey value="3" onPress={handleKeyPress} />
            <NumpadKey
              value="minusDivide"
              variant="operator"
              onPress={handleKeyPress}
              icon={MINUS_DIVIDE_ICON}
            />
          </View>
          <View className="flex-1 flex-row gap-1.5">
            <NumpadKey value="." onPress={handleKeyPress} />
            <NumpadKey value="0" onPress={handleKeyPress} />
            <NumpadKey value="=" variant="utility" onPress={handleKeyPress} />
            <NumpadKey
              value="plusTimes"
              variant="operator"
              onPress={handleKeyPress}
              icon={PLUS_TIMES_ICON}
            />
          </View>
        </View>
        {/* The drawer's action footer owns the bottom safe area. */}
        <View style={{ height: 6 }} />
      </View>
    );
  }

  return (
    <View className="flex-1 px-3 pt-0.5">
      <View className="flex-1 gap-0.5">
        <View className="flex-1 flex-row gap-0.5">
          <NumpadKey value="C" variant="utility" onPress={handleKeyPress} />
          {deleteKey}
          <NumpadKey value="÷" variant="operator" onPress={handleKeyPress} />
          <NumpadKey value="×" variant="operator" onPress={handleKeyPress} />
        </View>
        <View className="flex-1 flex-row gap-0.5">
          <NumpadKey value="7" onPress={handleKeyPress} />
          <NumpadKey value="8" onPress={handleKeyPress} />
          <NumpadKey value="9" onPress={handleKeyPress} />
          <NumpadKey value="-" variant="operator" onPress={handleKeyPress} />
        </View>
        <View className="flex-1 flex-row gap-0.5">
          <NumpadKey value="4" onPress={handleKeyPress} />
          <NumpadKey value="5" onPress={handleKeyPress} />
          <NumpadKey value="6" onPress={handleKeyPress} />
          <NumpadKey value="+" variant="operator" onPress={handleKeyPress} />
        </View>
        <View className="flex-1 flex-row gap-0.5">
          <NumpadKey value="1" onPress={handleKeyPress} />
          <NumpadKey value="2" onPress={handleKeyPress} />
          <NumpadKey value="3" onPress={handleKeyPress} />
          <NumpadKey value="enter" variant="confirm" onPress={handleKeyPress} icon={enterIcon} />
        </View>
        <View className="flex-1 flex-row gap-0.5">
          <NumpadKey value="0" onPress={handleKeyPress} className="flex-[2]" />
          <NumpadKey value="." onPress={handleKeyPress} />
          {onBackgroundPress ? (
            <Pressable
              accessible={false}
              onPress={onBackgroundPress}
              className="flex-1 rounded-[18px]"
            />
          ) : (
            <View className="flex-1" />
          )}
        </View>
      </View>
      {onBackgroundPress ? (
        <Pressable
          accessible={false}
          onPress={onBackgroundPress}
          style={{ minHeight: Math.max(4, bottomInset) }}
        />
      ) : (
        <View style={{ minHeight: Math.max(4, bottomInset) }} />
      )}
    </View>
  );
}
