import { Clock3, Delete } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '~/components/ui';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { formatHours } from '~/utils/formatters';

interface OnboardingTryItConverterProps {
  amount: string;
  currencySymbol: string;
  hours: number;
  workdays: number;
  workdaysPerWeek: number;
  trueRateLabel: string;
  onChangeAmount: (value: string) => void;
  onEditRate: () => void;
}

const MAX_INPUT_VALUE = 1_000_000_000;

function formatDisplayAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '0';
  const hasDot = trimmed.includes('.');
  const [rawInteger, rawFraction = ''] = trimmed.split('.');
  const integer = rawInteger.length > 0 ? String(Number(rawInteger)) : '0';
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!hasDot) return grouped;
  return `${grouped}.${rawFraction}`;
}

function parseAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '.') return 0;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

function isWithinLimit(value: string) {
  return parseAmount(value) <= MAX_INPUT_VALUE;
}

function formatWorkDuration(workdays: number, workdaysPerWeek: number) {
  const safeWorkdaysPerWeek = Math.max(1, Math.round(workdaysPerWeek));
  const normalizedDays = Math.max(0, Number(workdays.toFixed(2)));
  const fmt = (v: number) => Number(v.toFixed(2));

  const dayKey =
    Math.abs(normalizedDays - 1) < 0.005
      ? 'home.converter.workday_unit_one'
      : 'home.converter.workday_unit_other';

  if (normalizedDays <= safeWorkdaysPerWeek) {
    return I18n.t(dayKey, { count: fmt(normalizedDays) });
  }

  const weeks = Math.floor(normalizedDays / safeWorkdaysPerWeek);
  const remainingDays = Number((normalizedDays - weeks * safeWorkdaysPerWeek).toFixed(2));
  const weekKey =
    weeks === 1 ? 'home.converter.workweek_unit_one' : 'home.converter.workweek_unit_other';
  const weekLabel = I18n.t(weekKey, { count: fmt(weeks) });

  if (remainingDays <= 0.01) return weekLabel;

  const remainingDayKey =
    Math.abs(remainingDays - 1) < 0.005
      ? 'home.converter.workday_unit_one'
      : 'home.converter.workday_unit_other';
  return `${weekLabel} ${I18n.t(remainingDayKey, { count: fmt(remainingDays) })}`;
}

const TryItNumKey = React.memo(function TryItNumKey({
  label,
  onPress,
  onLongPress,
  children,
  dimmed,
}: {
  label?: string;
  children?: React.ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  dimmed?: boolean;
}) {
  const pressProgress = useSharedValue(0);
  const tapFlash = useSharedValue(0);

  const pressAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressProgress.value * 0.06 }],
  }));
  const tapFlashStyle = useAnimatedStyle(() => ({
    opacity: tapFlash.value,
  }));

  const handlePressIn = useCallback(() => {
    pressProgress.value = withTiming(1, { duration: 70, easing: Easing.out(Easing.quad) });
    tapFlash.value = withSequence(
      withTiming(0.18, { duration: 45, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 150, easing: Easing.in(Easing.quad) }),
    );
  }, [pressProgress, tapFlash]);

  const handlePressOut = useCallback(() => {
    pressProgress.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) });
  }, [pressProgress]);

  return (
    <View className="flex-1">
      <Animated.View style={pressAnimatedStyle}>
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          unstable_pressDelay={0}
          android_disableSound
          className="relative h-[44px] items-center justify-center overflow-hidden rounded-xl bg-card/80 mx-[3px] my-[3px]"
        >
          {children ?? (
            <Text
              style={[styles.numKeyLabel, dimmed ? styles.numKeyLabelDimmed : null]}
              className="text-foreground"
            >
              {label}
            </Text>
          )}
          <Animated.View
            pointerEvents="none"
            className="absolute inset-0 bg-primary/8 rounded-xl"
            style={tapFlashStyle}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
});

const NUM_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'backspace'],
] as const;

export function OnboardingTryItConverter({
  amount,
  currencySymbol,
  hours,
  workdays,
  workdaysPerWeek,
  trueRateLabel,
  onChangeAmount,
  onEditRate,
}: OnboardingTryItConverterProps) {
  const themeColors = useThemeColors();
  const amountRef = useRef(amount);

  useEffect(() => {
    amountRef.current = amount;
  }, [amount]);

  const displayAmount = useMemo(() => formatDisplayAmount(amount), [amount]);
  const hoursLabel = useMemo(() => formatHours(hours), [hours]);
  const exactHoursLabel = useMemo(
    () => I18n.t('home.converter.exact_hours', { value: hours.toFixed(2) }),
    [hours],
  );
  const workDurationLabel = useMemo(
    () => formatWorkDuration(workdays, workdaysPerWeek),
    [workdays, workdaysPerWeek],
  );
  const hasInput = amount.length > 0 && parseAmount(amount) > 0;

  const handleClear = useCallback(() => {
    void triggerHaptic('selection');
    onChangeAmount('');
  }, [onChangeAmount]);

  const handleKey = useCallback(
    (key: string) => {
      const current = amountRef.current;
      void triggerHaptic('selection');

      if (key === 'backspace') {
        onChangeAmount(current.slice(0, -1));
        return;
      }
      if (key === '.') {
        if (current.includes('.')) return;
        const next = current === '' ? '0.' : current + '.';
        if (!isWithinLimit(next)) return;
        onChangeAmount(next);
        return;
      }
      const dotIdx = current.indexOf('.');
      if (dotIdx !== -1 && current.length - dotIdx > 2) return;
      const next = current === '0' ? key : current + key;
      if (!isWithinLimit(next)) return;
      onChangeAmount(next);
    },
    [onChangeAmount],
  );

  const keyHandlers = useMemo<Record<string, () => void>>(
    () => ({
      '0': () => handleKey('0'),
      '1': () => handleKey('1'),
      '2': () => handleKey('2'),
      '3': () => handleKey('3'),
      '4': () => handleKey('4'),
      '5': () => handleKey('5'),
      '6': () => handleKey('6'),
      '7': () => handleKey('7'),
      '8': () => handleKey('8'),
      '9': () => handleKey('9'),
      '.': () => handleKey('.'),
      backspace: () => handleKey('backspace'),
    }),
    [handleKey],
  );

  const hasDot = amount.includes('.');

  return (
    <View>
      {/* Time result — the hero moment */}
      <View
        className="mx-5 rounded-2xl px-5 py-4 items-center"
        style={{ backgroundColor: `${themeColors.primary}10` }}
      >
        {hasInput ? (
          <Animated.View
            key={hoursLabel}
            entering={FadeInDown.duration(180)}
            exiting={FadeOutUp.duration(120)}
            className="items-center"
          >
            <View className="flex-row items-center gap-2">
              <Clock3 size={22} color={themeColors.primary} strokeWidth={2.2} />
              <Text style={styles.timeHeroValue} className="text-primary">
                {hoursLabel}
              </Text>
            </View>
            <Text variant="label" className="text-primary mt-1">
              {I18n.t('home.converter.of_work_suffix')}
            </Text>
            <Text variant="caption" tone="muted" className="mt-2 text-center">
              {I18n.t('home.converter.workday_equivalent', {
                exact: exactHoursLabel,
                duration: workDurationLabel,
              })}
            </Text>
          </Animated.View>
        ) : (
          <View className="items-center py-1">
            <Text variant="body" tone="muted" className="text-center">
              {I18n.t('onboarding.wage.try_it_hint')}
            </Text>
          </View>
        )}
      </View>

      {/* Amount input display */}
      <View className="mx-5 mt-3 flex-row items-baseline justify-between">
        <View className="flex-row items-baseline flex-1 min-w-0">
          <Text style={styles.currencySymbol} className="text-muted-foreground">
            {currencySymbol}
          </Text>
          <Text
            style={styles.amountDisplay}
            className={cn('ml-1', hasInput ? 'text-foreground' : 'text-muted-foreground/40')}
            numberOfLines={1}
          >
            {displayAmount}
          </Text>
        </View>
        {hasInput ? (
          <Pressable onPress={handleClear} className="pl-3">
            <Text variant="caption" tone="muted">
              {I18n.t('home.converter.clear')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View
        className="mx-5 mt-1.5 h-px"
        style={{ backgroundColor: `${themeColors.border}60` }}
      />

      {/* Rate badge */}
      <View className="mx-5 mt-2 flex-row items-center justify-between">
        <Text variant="caption" tone="muted">
          {I18n.t('onboarding.wage.your_rate_label', { rate: trueRateLabel })}
        </Text>
        <Pressable onPress={onEditRate} hitSlop={8}>
          <Text variant="caption" tone="primary">
            {I18n.t('common.edit')}
          </Text>
        </Pressable>
      </View>

      {/* Numpad — directly under fields */}
      <View style={styles.numpadContainer} className="mx-4 mt-4 rounded-2xl overflow-hidden">
        {NUM_ROWS.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.numpadRow}>
            {row.map((key) => {
              if (key === 'backspace') {
                return (
                  <TryItNumKey
                    key="backspace"
                    onPress={keyHandlers.backspace}
                    onLongPress={handleClear}
                  >
                    <Delete size={17} color={themeColors.text} />
                  </TryItNumKey>
                );
              }
              if (key === '.') {
                return (
                  <TryItNumKey
                    key="."
                    label="."
                    dimmed={hasDot}
                    onPress={keyHandlers['.']}
                  />
                );
              }
              return (
                <TryItNumKey key={key} label={key} onPress={keyHandlers[key]} />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timeHeroValue: {
    fontSize: 32,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1,
  },
  currencySymbol: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  amountDisplay: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: '800',
    letterSpacing: -1,
  },
  numKeyLabel: {
    fontSize: 20,
    fontWeight: '600',
  },
  numKeyLabelDimmed: {
    opacity: 0.35,
  },
  numpadContainer: {
    gap: 0,
    paddingHorizontal: spacing.xxs,
    paddingVertical: spacing.xxs,
  },
  numpadRow: {
    flexDirection: 'row',
    gap: 0,
  },
});
