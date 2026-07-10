import { ChevronDown } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

import {
  appendDecimal,
  appendDigit,
  appendOperator,
  evaluateExpression,
  formatMoney,
  sanitizeInitialAmount,
} from './calculatorEngine';
import { type KeyValue, MINUS_DIVIDE_ICON, NumpadKey, PLUS_TIMES_ICON } from './NumpadKey';

type Operator = '+' | '-' | '×' | '÷';

interface MiniNumpadProps {
  /** Seed value (the focused row's amount). The parent remounts via `key` per row. */
  initialExpression: string;
  /** Fires on every keystroke with the raw expression (e.g. "12+3"). */
  onValueChange: (expression: string) => void;
  /** Done: commit the current value and move on (parent advances or closes). */
  onConfirm: () => void;
  /** Dismiss the pad without advancing (chevron-down). */
  onClose?: () => void;
}

/**
 * A compact calculator keypad — the "mini" numpad. Same keys, math, and key
 * styling as the main editor pad (built on ./calculatorEngine and the shared
 * NumpadKey), but stripped of the editor chrome: no note, no action row, no
 * date/currency pickers, and the two Add buttons replaced by a single Done bar.
 * Used for per-row amount entry in the Split Bill flow.
 */
export function MiniNumpad({
  initialExpression,
  onValueChange,
  onConfirm,
  onClose,
}: MiniNumpadProps) {
  const themeColors = useThemeColors();
  const { bottom: bottomInset } = useSafeAreaInsets();

  const [expression, setExpression] = useState(() => sanitizeInitialAmount(initialExpression));
  // When seeded with a value, the first digit/decimal replaces it (operators
  // append) — mirrors the main pad's pre-fill behavior.
  const pristineRef = useRef(sanitizeInitialAmount(initialExpression).length > 0);

  const handleKeyPress = useCallback(
    (rawKey: KeyValue) => {
      // Combo operator keys cycle on repeated taps: − ↔ ÷ and + ↔ ×.
      let key = rawKey;
      if (rawKey === 'plusTimes' || rawKey === 'minusDivide') {
        const primary = rawKey === 'plusTimes' ? '+' : '-';
        const secondary = rawKey === 'plusTimes' ? '×' : '÷';
        key = expression.slice(-1) === primary ? secondary : primary;
      }

      let current = expression;
      if (pristineRef.current) {
        pristineRef.current = false;
        if ((key >= '0' && key <= '9') || key === '.') current = '';
      }

      let next = current;
      if (key >= '0' && key <= '9') {
        next = appendDigit(current, key);
      } else if (key === '.') {
        next = appendDecimal(current);
      } else if (key === 'del') {
        next = current.slice(0, -1);
      } else if (key === '=') {
        // Only computes a pending operation; a plain number is left editable.
        const body = current.startsWith('-') ? current.slice(1) : current;
        if (!/[+\-×÷]/.test(body)) return;
        next = formatMoney(evaluateExpression(current));
        pristineRef.current = true;
      } else if (['+', '-', '×', '÷'].includes(key)) {
        next = appendOperator(current, key as Operator);
      }

      setExpression(next);
      onValueChange(next);
    },
    [expression, onValueChange],
  );

  const handleClear = useCallback(() => {
    pristineRef.current = false;
    setExpression('');
    onValueChange('');
  }, [onValueChange]);

  const deleteKey = useMemo(
    () => (
      <NumpadKey
        value="del"
        variant="utility"
        onPress={handleKeyPress}
        onLongPress={handleClear}
        icon={
          <Text variant="subheading" tone="muted">
            ⌫
          </Text>
        }
      />
    ),
    [handleKeyPress, handleClear],
  );

  return (
    <View
      className="border-t border-border/30 bg-background px-3.5 pt-2"
      style={{ paddingBottom: Math.max(bottomInset, 10) }}
    >
      {onClose ? (
        <View className="mb-1 flex-row justify-end">
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="h-8 w-8 items-center justify-center rounded-full bg-secondary/60 active:opacity-70"
          >
            <ChevronDown size={16} color={themeColors.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <View className="gap-1.5" style={{ height: 210 }}>
        <View className="flex-1 flex-row gap-1.5">
          <NumpadKey value="7" onPress={handleKeyPress} />
          <NumpadKey value="8" onPress={handleKeyPress} />
          <NumpadKey value="9" onPress={handleKeyPress} />
          {deleteKey}
        </View>
        <View className="flex-1 flex-row gap-1.5">
          <NumpadKey value="4" onPress={handleKeyPress} />
          <NumpadKey value="5" onPress={handleKeyPress} />
          <NumpadKey value="6" onPress={handleKeyPress} />
          <NumpadKey
            value="minusDivide"
            variant="operator"
            onPress={handleKeyPress}
            icon={MINUS_DIVIDE_ICON}
          />
        </View>
        <View className="flex-1 flex-row gap-1.5">
          <NumpadKey value="1" onPress={handleKeyPress} />
          <NumpadKey value="2" onPress={handleKeyPress} />
          <NumpadKey value="3" onPress={handleKeyPress} />
          <NumpadKey
            value="plusTimes"
            variant="operator"
            onPress={handleKeyPress}
            icon={PLUS_TIMES_ICON}
          />
        </View>
        <View className="flex-1 flex-row gap-1.5">
          <NumpadKey value="." onPress={handleKeyPress} />
          <NumpadKey value="0" onPress={handleKeyPress} className="flex-[2]" />
          <NumpadKey value="=" variant="utility" onPress={handleKeyPress} />
        </View>
      </View>

      <Pressable
        onPress={onConfirm}
        className="mt-1.5 h-12 items-center justify-center rounded-[18px] bg-primary active:opacity-80"
      >
        <Text variant="bodyStrong" className="text-primary-foreground">
          {I18n.t('common.done')}
        </Text>
      </Pressable>
    </View>
  );
}
