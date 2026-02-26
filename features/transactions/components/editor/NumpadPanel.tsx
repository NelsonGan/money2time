import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { Delete } from 'lucide-react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '~/components/ui/text';
import { amountToHoursByRate, formatHours } from '~/utils/formatters';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { I18n } from '~/lib/i18n';
import {
  evaluateExpression,
  formatMoney,
  sanitizeInitialAmount,
  appendDigit,
  appendDecimal,
  appendOperator,
} from './calculatorEngine';

type Operator = '+' | '-' | '×' | '÷';
type KeyValue = string;

interface NumpadPanelProps {
  initialExpression: string;
  currencySymbol: string;
  trueHourlyRate: number;
  hourRounding: number;
  onValueChange: (formatted: string) => void;
  onConfirm: (formatted: string) => void;
  compact?: boolean;
}

const NumpadKey = React.memo(function NumpadKey({
  value,
  onPress,
  variant = 'default',
  icon,
  className,
}: {
  value: KeyValue;
  onPress: (key: KeyValue) => void;
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
      <Animated.View style={pressAnimatedStyle}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          unstable_pressDelay={0}
          android_disableSound
          android_ripple={{ color: rippleColor, borderless: false }}
          className={cn(
            'relative h-[56px] overflow-hidden rounded-2xl items-center justify-center border',
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
  currencySymbol,
  trueHourlyRate,
  hourRounding,
  onValueChange,
  onConfirm,
  compact,
}: NumpadPanelProps) {
  const themeColors = useThemeColors();
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

  const displayExpression = expression || '0';
  const previewValue = useMemo(() => evaluateExpression(expression), [expression]);
  const previewHours = useMemo(
    () => amountToHoursByRate(Math.max(0, previewValue), trueHourlyRate, hourRounding),
    [hourRounding, previewValue, trueHourlyRate],
  );

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
      const evaluated = evaluateExpression(nextExpression);
      onValueChange(formatMoney(evaluated));
    },
    [onConfirm, onValueChange],
  );

  const keyHeight = compact ? 'h-[48px]' : 'h-[56px]';

  return (
    <View className="flex-1 px-4 pt-2 pb-2">
      <View className="rounded-2xl border border-border/30 bg-card/80 px-3 py-2.5 mb-2.5">
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {displayExpression}
        </Text>
        <Text variant="bodyStrong" className="text-foreground" numberOfLines={1}>
          = {currencySymbol}
          {formatMoney(previewValue)}
        </Text>
        {trueHourlyRate > 0 ? (
          <Text variant="label" tone="muted" numberOfLines={1}>
            ≈ {formatHours(previewHours)} of work
          </Text>
        ) : null}
      </View>

      <View className="gap-2">
        <View className="flex-row gap-2">
          <NumpadKey value="C" variant="utility" onPress={handleKeyPress} className={keyHeight} />
          <NumpadKey
            value="del"
            variant="utility"
            onPress={handleKeyPress}
            icon={<Delete size={16} color={themeColors.textMuted} />}
            className={keyHeight}
          />
          <NumpadKey value="÷" variant="operator" onPress={handleKeyPress} className={keyHeight} />
          <NumpadKey value="×" variant="operator" onPress={handleKeyPress} className={keyHeight} />
        </View>
        <View className="flex-row gap-2">
          <NumpadKey value="7" onPress={handleKeyPress} className={keyHeight} />
          <NumpadKey value="8" onPress={handleKeyPress} className={keyHeight} />
          <NumpadKey value="9" onPress={handleKeyPress} className={keyHeight} />
          <NumpadKey value="-" variant="operator" onPress={handleKeyPress} className={keyHeight} />
        </View>
        <View className="flex-row gap-2">
          <NumpadKey value="4" onPress={handleKeyPress} className={keyHeight} />
          <NumpadKey value="5" onPress={handleKeyPress} className={keyHeight} />
          <NumpadKey value="6" onPress={handleKeyPress} className={keyHeight} />
          <NumpadKey value="+" variant="operator" onPress={handleKeyPress} className={keyHeight} />
        </View>
        <View className="flex-row gap-2">
          <NumpadKey value="1" onPress={handleKeyPress} className={keyHeight} />
          <NumpadKey value="2" onPress={handleKeyPress} className={keyHeight} />
          <NumpadKey value="3" onPress={handleKeyPress} className={keyHeight} />
          <NumpadKey
            value="enter"
            variant="confirm"
            onPress={handleKeyPress}
            icon={
              <Text variant="bodyStrong" className="text-primary-foreground">
                {I18n.t('common.done')}
              </Text>
            }
            className={keyHeight}
          />
        </View>
        <View className="flex-row gap-2 pr-[25%]">
          <NumpadKey value="0" onPress={handleKeyPress} className={cn('flex-[2]', keyHeight)} />
          <NumpadKey value="." onPress={handleKeyPress} className={keyHeight} />
        </View>
      </View>
    </View>
  );
}
