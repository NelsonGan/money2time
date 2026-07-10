import React, { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { I18n } from '~/lib/i18n';

import { reduceNumpadKey, sanitizeInitialAmount } from './calculatorEngine';
import { type KeyValue, MINUS_DIVIDE_ICON, NumpadKey, PLUS_TIMES_ICON } from './NumpadKey';

interface MiniNumpadProps {
  /** Seed value (the focused row's amount). The parent remounts via `key` per row. */
  initialExpression: string;
  /** Fires on every keystroke with the raw expression (e.g. "12+3"). */
  onValueChange: (expression: string) => void;
  /** Done: commit the current value and move on (parent advances or closes). */
  onConfirm: () => void;
}

/**
 * A compact calculator keypad — the "mini" numpad. Same keys, math, and key
 * styling as the main editor pad (built on ./calculatorEngine and the shared
 * NumpadKey), but stripped of the editor chrome: no note, no action row, no
 * date/currency pickers, and the two Add buttons replaced by a single Done key
 * in the bottom-right of the grid. Used for per-row amount entry in Split Bill.
 */
export function MiniNumpad({ initialExpression, onValueChange, onConfirm }: MiniNumpadProps) {
  const { bottom: bottomInset } = useSafeAreaInsets();

  const [expression, setExpression] = useState(() => sanitizeInitialAmount(initialExpression));
  // When seeded with a value, the first digit/decimal replaces it (operators
  // append) — mirrors the main pad's pre-fill behavior.
  const pristineRef = useRef(sanitizeInitialAmount(initialExpression).length > 0);

  const handleKeyPress = useCallback(
    (rawKey: KeyValue) => {
      const result = reduceNumpadKey(expression, pristineRef.current, rawKey);
      pristineRef.current = result.pristine;
      setExpression(result.expression);
      onValueChange(result.expression);
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

  const doneIcon = useMemo(
    () => (
      <Text variant="bodyStrong" className="text-primary-foreground">
        {I18n.t('common.done')}
      </Text>
    ),
    [],
  );

  return (
    <View
      className="border-t border-border/30 bg-background px-3.5 pt-2"
      style={{ paddingBottom: Math.max(bottomInset, 10) }}
    >
      <View className="gap-1.5" style={{ height: 260 }}>
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
          <NumpadKey value="0" onPress={handleKeyPress} />
          <NumpadKey value="=" variant="utility" onPress={handleKeyPress} />
          <NumpadKey value="done" variant="confirm" onPress={onConfirm} icon={doneIcon} />
        </View>
      </View>
    </View>
  );
}
