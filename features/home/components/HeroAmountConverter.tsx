import { Delete } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AnimatedRollingNumber } from 'react-native-animated-rolling-numbers';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Button, Text, TimeValueInline } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { formatHours } from '~/utils/formatters';

interface HeroAmountConverterProps {
  amount: string;
  currencySymbol: string;
  hasRate: boolean;
  hours: number;
  workdays: number;
  workdaysPerWeek: number;
  onChangeAmount: (value: string) => void;
  containerClassName?: string;
  compact?: boolean;
}

function formatCount(value: number) {
  return Number(value.toFixed(2));
}

function formatWorkDuration(workdays: number, workdaysPerWeek: number) {
  const safeWorkdaysPerWeek = Math.max(1, Math.round(workdaysPerWeek));
  const normalizedDays = Math.max(0, Number(workdays.toFixed(2)));
  const dayKey =
    Math.abs(normalizedDays - 1) < 0.005
      ? 'home.converter.workday_unit_one'
      : 'home.converter.workday_unit_other';

  if (normalizedDays <= safeWorkdaysPerWeek) {
    return I18n.t(dayKey, { count: formatCount(normalizedDays) });
  }

  const weeks = Math.floor(normalizedDays / safeWorkdaysPerWeek);
  const remainingDays = Number((normalizedDays - weeks * safeWorkdaysPerWeek).toFixed(2));
  const weekKey =
    weeks === 1 ? 'home.converter.workweek_unit_one' : 'home.converter.workweek_unit_other';
  const weekLabel = I18n.t(weekKey, { count: formatCount(weeks) });

  if (remainingDays <= 0.01) {
    return weekLabel;
  }

  const remainingDayKey =
    Math.abs(remainingDays - 1) < 0.005
      ? 'home.converter.workday_unit_one'
      : 'home.converter.workday_unit_other';
  const dayLabel = I18n.t(remainingDayKey, { count: formatCount(remainingDays) });
  return `${weekLabel} ${dayLabel}`;
}

function formatHeroNumericAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '0';

  const hasDot = trimmed.includes('.');
  const [rawInteger, rawFraction = ''] = trimmed.split('.');
  const integer = rawInteger.length > 0 ? String(Number(rawInteger)) : '0';
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!hasDot) return grouped;
  return `${grouped}.${rawFraction}`;
}

function parseHeroNumericAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed || trimmed === '.') return 0;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

// Individual numpad key with tap animation and flash feedback
const NumKey = React.memo(function NumKey({
  label,
  onPress,
  onLongPress,
  children,
  dimmed,
  compact,
}: {
  label?: string;
  children?: React.ReactNode;
  onPress: () => void;
  onLongPress?: () => void;
  dimmed?: boolean;
  compact?: boolean;
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
    pressProgress.value = withTiming(1, {
      duration: 70,
      easing: Easing.out(Easing.quad),
    });
    tapFlash.value = withSequence(
      withTiming(0.18, {
        duration: 45,
        easing: Easing.out(Easing.quad),
      }),
      withTiming(0, {
        duration: 150,
        easing: Easing.in(Easing.quad),
      }),
    );
  }, [pressProgress, tapFlash]);

  const handlePressOut = useCallback(() => {
    pressProgress.value = withTiming(0, {
      duration: 120,
      easing: Easing.out(Easing.quad),
    });
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
          android_ripple={{ color: 'rgba(34, 138, 111, 0.15)', borderless: false }}
          className={cn(
            'relative h-[44px] items-center justify-center bg-card/80 overflow-hidden rounded-xl mx-0.5 my-0.5',
            compact && 'h-[40px]',
          )}
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
const INPUT_PROGRESS_SPRING = { damping: 18, stiffness: 180 } as const;
const NUMPAD_ROW_STYLE = { flexDirection: 'row', gap: 0 } as const;
const HERO_MAX_FONT_SIZE = 40;
const HERO_MIN_FONT_SIZE = 22;
const HERO_BASE_CHAR_COUNT = 7;
const HERO_FONT_SHRINK_PER_CHAR = 2.8;
const HERO_LINE_HEIGHT_RATIO = 1.14;
const HERO_MAX_INPUT_VALUE = 1_000_000_000_000;
const HERO_ROLLING_NUMBER_SPIN_CONFIG = {
  duration: 160,
  easing: Easing.out(Easing.cubic),
} as const;
const HERO_ROLLING_NUMBER_CONTAINER_STYLE = {
  width: '100%',
  maxWidth: '100%',
  alignItems: 'flex-start',
  justifyContent: 'flex-end',
} as const;

const styles = StyleSheet.create({
  numKeyLabel: {
    fontSize: 20,
    fontWeight: '600',
  },
  numKeyLabelDimmed: {
    opacity: 0.35,
  },
  currencyText: {
    fontWeight: '900',
    letterSpacing: -1,
  },
  numPadContainer: {
    gap: 0,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
});

function getAmountCharacterCount(amountLabel: string) {
  const withoutGrouping = amountLabel.replace(/,/g, '');
  return Math.max(1, withoutGrouping.length);
}

function isHeroAmountWithinLimit(value: string) {
  return parseHeroNumericAmount(value) <= HERO_MAX_INPUT_VALUE;
}

export function HeroAmountConverter({
  amount,
  currencySymbol,
  hasRate,
  hours,
  workdays,
  workdaysPerWeek,
  onChangeAmount,
  containerClassName,
  compact = false,
}: HeroAmountConverterProps) {
  const themeColors = useThemeColors();
  const inputProgress = useSharedValue(0);
  const amountRef = useRef(amount);

  useEffect(() => {
    amountRef.current = amount;
  }, [amount]);

  const amountNumberLabel = useMemo(() => formatHeroNumericAmount(amount), [amount]);
  const amountNumericValue = useMemo(() => parseHeroNumericAmount(amount), [amount]);
  const amountCharacterCount = useMemo(
    () => getAmountCharacterCount(amountNumberLabel),
    [amountNumberLabel],
  );
  const amountFontSize = useMemo(() => {
    const overflowChars = Math.max(0, amountCharacterCount - HERO_BASE_CHAR_COUNT);
    return Math.max(
      HERO_MIN_FONT_SIZE,
      HERO_MAX_FONT_SIZE - overflowChars * HERO_FONT_SHRINK_PER_CHAR,
    );
  }, [amountCharacterCount]);
  const amountLineHeight = useMemo(
    () => Math.round(amountFontSize * HERO_LINE_HEIGHT_RATIO),
    [amountFontSize],
  );
  const currencyFontSize = useMemo(
    () => Math.max(HERO_MIN_FONT_SIZE - 2, Math.round(amountFontSize * 0.78)),
    [amountFontSize],
  );
  const rollingTextStyle = useMemo(
    () => ({
      fontSize: amountFontSize,
      lineHeight: amountLineHeight,
      fontWeight: '900' as const,
      color: themeColors.text,
      letterSpacing: -1.5,
    }),
    [amountFontSize, amountLineHeight, themeColors.text],
  );
  const rollingGlyphStyle = useMemo(() => ({ color: themeColors.text }), [themeColors.text]);
  const currencyTextStyle = useMemo(
    () => [
      styles.currencyText,
      {
        fontSize: currencyFontSize,
        lineHeight: amountLineHeight,
      },
    ],
    [amountLineHeight, currencyFontSize],
  );
  const numPadContainerStyle = useMemo(
    () => [styles.numPadContainer, { backgroundColor: `${themeColors.border}20` }],
    [themeColors.border],
  );
  const hoursLabel = useMemo(() => formatHours(hours), [hours]);
  const exactHoursLabel = useMemo(
    () => I18n.t('home.converter.exact_hours', { value: hours.toFixed(2) }),
    [hours],
  );
  const workDurationLabel = useMemo(
    () => formatWorkDuration(workdays, workdaysPerWeek),
    [workdays, workdaysPerWeek],
  );
  const activateInputProgress = useCallback(() => {
    if (inputProgress.value !== 0) return;
    inputProgress.value = withSpring(1, INPUT_PROGRESS_SPRING);
  }, [inputProgress]);
  const handleClearAmount = useCallback(() => {
    void triggerHaptic('selection');
    onChangeAmount('');
  }, [onChangeAmount]);

  const cardStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.06,
    shadowRadius: 12,
  }));

  const handleKey = useCallback(
    (key: string) => {
      const currentAmount = amountRef.current;
      void triggerHaptic('selection');

      if (key === 'backspace') {
        const next = currentAmount.slice(0, -1);
        onChangeAmount(next);
        return;
      }

      if (key === '.') {
        if (currentAmount.includes('.')) return;
        const next = currentAmount === '' ? '0.' : currentAmount + '.';
        if (!isHeroAmountWithinLimit(next)) return;
        onChangeAmount(next);
        activateInputProgress();
        return;
      }

      // Digit key
      const dotIdx = currentAmount.indexOf('.');
      if (dotIdx !== -1 && currentAmount.length - dotIdx > 2) return; // max 2 decimal places

      const next = currentAmount === '0' ? key : currentAmount + key;
      if (!isHeroAmountWithinLimit(next)) return;
      onChangeAmount(next);
      activateInputProgress();
    },
    [activateInputProgress, onChangeAmount],
  );
  const keyPressHandlers = useMemo<Record<string, () => void>>(
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
    <Animated.View style={cardStyle} className={cn('mx-5 mt-3', containerClassName)}>
      <View className="relative overflow-hidden rounded-[24px] border border-border/25 bg-card shadow-soft-lg">
        {/* Decorative background shapes */}
        <View
          className="absolute -top-14 -right-14 h-36 w-36 rounded-full"
          style={{ backgroundColor: themeColors.primary, opacity: 0.04 }}
        />
        <View
          className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full"
          style={{ backgroundColor: themeColors.accent, opacity: 0.03 }}
        />

        {/* Content area */}
        <View className={cn('px-4 pt-3 pb-2', compact && 'px-3.5 pt-2.5 pb-1.5')}>
          {/* Header */}
          <View className={cn('mb-2 flex-row items-start justify-between gap-3', compact && 'mb-1.5')}>
            <View className="min-w-0 flex-1">
              <Text variant="label" tone="muted">
                {I18n.t('home.converter.title')}
              </Text>
              <Text variant="caption" tone="muted" className={cn('mt-0.5 opacity-60', compact && 'mt-0')}>
                {I18n.t('home.converter.description')}
              </Text>
            </View>
            <Button
              size="sm"
              variant="ghost"
              bouncy={false}
              haptic="none"
              onPress={handleClearAmount}
            >
              <Text variant="caption" tone="muted">
                {I18n.t('home.converter.clear')}
              </Text>
            </Button>
          </View>

          {/* Amount display */}
          <View className={cn('min-h-[48px]', compact && 'min-h-[42px]')}>
            <View className="min-w-0 flex-row items-end overflow-hidden">
              <Text style={currencyTextStyle} className="shrink-0 text-muted-foreground">
                {currencySymbol}
              </Text>
              <View className="ml-1.5 min-w-0 flex-1 overflow-hidden">
                <AnimatedRollingNumber
                  value={amountNumericValue}
                  formattedText={amountNumberLabel}
                  containerStyle={HERO_ROLLING_NUMBER_CONTAINER_STYLE}
                  textStyle={rollingTextStyle}
                  numberStyle={rollingGlyphStyle}
                  commaStyle={rollingGlyphStyle}
                  dotStyle={rollingGlyphStyle}
                  signStyle={rollingGlyphStyle}
                  compactNotationStyle={rollingGlyphStyle}
                  spinningAnimationConfig={HERO_ROLLING_NUMBER_SPIN_CONFIG}
                />
              </View>
            </View>
          </View>

          {/* Hours result — glowing accent panel */}
          <View
            className={cn('mt-2 mb-1 rounded-[18px] px-4 py-3 overflow-hidden', compact && 'mt-1.5 px-3 py-2.5')}
            style={{ backgroundColor: `${themeColors.primary}10` }}
          >
            {/* Inner decorative accent */}
            <View
              className="absolute top-0 left-0 w-1 h-full rounded-full"
              style={{ backgroundColor: themeColors.primary, opacity: 0.4 }}
            />

            {hasRate ? (
              <>
                <Animated.View
                  key={hoursLabel}
                  entering={FadeInDown.duration(180)}
                  exiting={FadeOutUp.duration(120)}
                >
                  <View className="flex-row items-center gap-2">
                    <TimeValueInline
                      value={hoursLabel}
                      variant="heading"
                      textClassName="text-primary tracking-tight"
                      iconColor={themeColors.primary}
                      iconSize={16}
                    />
                    <Text variant="heading" className="text-primary tracking-tight">
                      {I18n.t('home.converter.of_work_suffix')}
                    </Text>
                  </View>
                </Animated.View>
                <Animated.View
                  key={exactHoursLabel}
                  entering={FadeInDown.duration(180)}
                  exiting={FadeOutUp.duration(120)}
                >
                  <Text variant="caption" tone="muted" className="mt-1.5">
                    {I18n.t('home.converter.workday_equivalent', {
                      exact: exactHoursLabel,
                      duration: workDurationLabel,
                    })}
                  </Text>
                </Animated.View>
              </>
            ) : (
              <>
                <Text variant="bodyStrong" tone="muted">
                  {I18n.t('home.converter.no_rate_title')}
                </Text>
                <Text variant="caption" tone="muted" className="mt-1">
                  {I18n.t('home.converter.no_rate_subtitle')}
                </Text>
              </>
            )}
          </View>
        </View>

        {/* Numpad — rounded keys with spacing */}
        <View style={numPadContainerStyle}>
          {NUM_ROWS.map((row, rowIndex) => (
            <View key={rowIndex} style={NUMPAD_ROW_STYLE}>
              {row.map((key) => {
                if (key === 'backspace') {
                  return (
                    <NumKey
                      key="backspace"
                      onPress={keyPressHandlers.backspace}
                      onLongPress={handleClearAmount}
                      compact={compact}
                    >
                      <Delete size={18} color={themeColors.text} />
                    </NumKey>
                  );
                }
                if (key === '.') {
                  return (
                    <NumKey
                      key="."
                      label="."
                      dimmed={hasDot}
                      onPress={keyPressHandlers['.']}
                      compact={compact}
                    />
                  );
                }
                return (
                  <NumKey
                    key={key}
                    label={key}
                    onPress={keyPressHandlers[key]}
                    compact={compact}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}
