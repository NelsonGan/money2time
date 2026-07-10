import { Calendar, Delete } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import {
  evaluateExpression,
  formatMoney,
  reduceNumpadKey,
  sanitizeInitialAmount,
} from './calculatorEngine';
import { type KeyValue, MINUS_DIVIDE_ICON, NumpadKey, PLUS_TIMES_ICON } from './NumpadKey';

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
      // Confirm/clear are component-specific; the rest share reduceNumpadKey.
      if (rawKey === 'enter') {
        const formatted = formatMoney(evaluateExpression(expressionRef.current));
        expressionRef.current = formatted;
        onConfirm(formatted);
        return;
      }
      if (rawKey === 'C') {
        expressionRef.current = '';
        pristineRef.current = false;
        onValueChange('');
        return;
      }
      const result = reduceNumpadKey(expressionRef.current, pristineRef.current, rawKey);
      expressionRef.current = result.expression;
      pristineRef.current = result.pristine;
      onValueChange(result.expression);
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
