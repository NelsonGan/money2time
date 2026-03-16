import { Delete } from 'lucide-react-native';
import React, { useCallback, useEffect, useRef } from 'react';
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

interface NumpadPanelProps {
  initialExpression: string;
  onValueChange: (expression: string) => void;
  onConfirm: (formatted: string) => void;
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
            'relative flex-1 overflow-hidden rounded-2xl items-center justify-center border',
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
            className={cn('absolute inset-0 rounded-2xl', tapOverlayClassName)}
            style={tapFlashStyle}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
});

export function NumpadPanel({
  initialExpression,
  onValueChange,
  onConfirm,
}: NumpadPanelProps) {
  const themeColors = useThemeColors();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const [expression, setExpression] = React.useState(() =>
    sanitizeInitialAmount(initialExpression),
  );
  const prevInitialRef = useRef(initialExpression);
  const expressionRef = useRef(expression);
  const pristineRef = useRef(initialExpression.length > 0);

  useEffect(() => {
    expressionRef.current = expression;
  }, [expression]);

  useEffect(() => {
    if (initialExpression === prevInitialRef.current) return;
    prevInitialRef.current = initialExpression;
    if (expressionRef.current.length > 0) return;
    const sanitized = sanitizeInitialAmount(initialExpression);
    if (sanitized === expressionRef.current) return;
    expressionRef.current = sanitized;
    setExpression(sanitized);
    pristineRef.current = sanitized.length > 0;
  }, [initialExpression]);

  const handleKeyPress = useCallback(
    (key: KeyValue) => {
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
        const normalized = String(Number(formatted));
        expressionRef.current = normalized;
        setExpression(normalized);
        onConfirm(formatted);
        return;
      } else if (['+', '-', '×', '÷'].includes(key)) {
        nextExpression = appendOperator(currentExpression, key as Operator);
      }

      expressionRef.current = nextExpression;
      setExpression(nextExpression);
      onValueChange(nextExpression);
    },
    [onConfirm, onValueChange],
  );

  const handleDeleteLongPress = useCallback(() => {
    handleKeyPress('C');
  }, [handleKeyPress]);

  return (
    <View className="flex-1 px-4 pt-1.5" style={{ paddingBottom: Math.max(8, bottomInset) }}>

      <View className="flex-1 gap-1.5">
        <View className="flex-1 flex-row gap-1.5">
          <NumpadKey value="C" variant="utility" onPress={handleKeyPress} />
          <NumpadKey
            value="del"
            variant="utility"
            onPress={handleKeyPress}
            onLongPress={handleDeleteLongPress}
            icon={<Delete size={16} color={themeColors.textMuted} />}
          />
          <NumpadKey value="÷" variant="operator" onPress={handleKeyPress} />
          <NumpadKey value="×" variant="operator" onPress={handleKeyPress} />
        </View>
        <View className="flex-1 flex-row gap-1.5">
          <NumpadKey value="7" onPress={handleKeyPress} />
          <NumpadKey value="8" onPress={handleKeyPress} />
          <NumpadKey value="9" onPress={handleKeyPress} />
          <NumpadKey value="-" variant="operator" onPress={handleKeyPress} />
        </View>
        <View className="flex-1 flex-row gap-1.5">
          <NumpadKey value="4" onPress={handleKeyPress} />
          <NumpadKey value="5" onPress={handleKeyPress} />
          <NumpadKey value="6" onPress={handleKeyPress} />
          <NumpadKey value="+" variant="operator" onPress={handleKeyPress} />
        </View>
        <View className="flex-1 flex-row gap-1.5">
          <NumpadKey value="1" onPress={handleKeyPress} />
          <NumpadKey value="2" onPress={handleKeyPress} />
          <NumpadKey value="3" onPress={handleKeyPress} />
          <NumpadKey
            value="enter"
            variant="confirm"
            onPress={handleKeyPress}
            icon={
              <Text variant="bodyStrong" className="text-primary-foreground">
                {I18n.t('common.done')}
              </Text>
            }
          />
        </View>
        <View className="flex-1 flex-row gap-1.5 pr-[25%]">
          <NumpadKey value="0" onPress={handleKeyPress} className="flex-[2]" />
          <NumpadKey value="." onPress={handleKeyPress} />
        </View>
      </View>
    </View>
  );
}
