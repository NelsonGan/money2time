import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Delete } from 'lucide-react-native';

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

function NumpadKey({
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
  const [pressed, setPressed] = useState(false);

  return (
    <View
      className={cn('flex-1', className)}
      style={{
        transform: [{ scale: pressed ? 0.88 : 1 }],
        opacity: pressed ? 0.68 : 1,
      }}
    >
      <Pressable
        onPress={() => {
          void triggerHaptic('light');
          onPress(value);
        }}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        className={cn(
          'h-[56px] rounded-2xl items-center justify-center border',
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
      </Pressable>
    </View>
  );
}

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
  const [expression, setExpression] = useState(() => sanitizeInitialAmount(initialExpression));
  const prevInitialRef = useRef(initialExpression);
  const expressionRef = useRef(expression);

  useEffect(() => {
    expressionRef.current = expression;
  }, [expression]);

  useEffect(() => {
    if (initialExpression !== prevInitialRef.current) {
      prevInitialRef.current = initialExpression;
      setExpression((current) => {
        if (current.length > 0) return current;
        const sanitized = sanitizeInitialAmount(initialExpression);
        expressionRef.current = sanitized;
        return sanitized;
      });
    }
  }, [initialExpression]);

  const displayExpression = expression || '0';
  const previewValue = useMemo(() => evaluateExpression(expression), [expression]);
  const previewHours = useMemo(
    () => amountToHoursByRate(Math.max(0, previewValue), trueHourlyRate, hourRounding),
    [hourRounding, previewValue, trueHourlyRate],
  );

  const handleKeyPress = (key: KeyValue) => {
    const currentExpression = expressionRef.current;
    let nextExpression = currentExpression;

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
  };

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
