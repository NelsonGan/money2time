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

import { Button, Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { formatHours } from '~/utils/formatters';

interface HeroAmountConverterProps {
  amount: string;
  currencySymbol: string;
  hasRate: boolean;
  hours: number;
  workdays: number;
  workdaysPerWeek: number;
  onChangeAmount: (value: string) => void;
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
    transform: [{ scale: 1 - pressProgress.value * 0.08 }],
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
      withTiming(0.22, {
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
          android_ripple={{ color: 'rgba(34, 138, 111, 0.2)', borderless: false }}
          className="relative h-14 items-center justify-center bg-card overflow-hidden"
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
            className="absolute inset-0 bg-foreground/10"
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
const NUMPAD_ROW_STYLE = { flexDirection: 'row', gap: 1 } as const;
const HERO_MAX_FONT_SIZE = 44;
const HERO_MIN_FONT_SIZE = 24;
const HERO_BASE_CHAR_COUNT = 8;
const HERO_FONT_SHRINK_PER_CHAR = 2.5;
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
    fontSize: 18,
    fontWeight: '600',
  },
  numKeyLabelDimmed: {
    opacity: 0.35,
  },
  currencyText: {
    fontWeight: '800',
  },
  numPadContainer: {
    gap: 1,
    borderTopWidth: 0.5,
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
    () => Math.max(HERO_MIN_FONT_SIZE - 2, Math.round(amountFontSize * 0.82)),
    [amountFontSize],
  );
  const rollingTextStyle = useMemo(
    () => ({
      fontSize: amountFontSize,
      lineHeight: amountLineHeight,
      fontWeight: '800' as const,
      color: themeColors.text,
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
    () => [
      styles.numPadContainer,
      { backgroundColor: themeColors.border, borderTopColor: themeColors.border },
    ],
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
    shadowOpacity: 0.08 + inputProgress.value * 0.14,
    shadowRadius: 8 + inputProgress.value * 10,
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
    <Animated.View style={cardStyle} className="mx-5 mt-4">
      <View className="relative overflow-hidden rounded-[28px] border border-border/35 px-5 pt-5 pb-4 bg-card">
        <View className="absolute -top-10 -right-8 h-28 w-28 rounded-full bg-primary/12" />

        {/* Header */}
        <View className="mb-3 flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <Text variant="bodyStrong">{I18n.t('home.converter.title')}</Text>
            <Text variant="label" tone="muted" className="mt-0.5">
              {I18n.t('home.converter.description')}
            </Text>
          </View>
          <Button size="sm" variant="outline" bouncy={false} onPress={handleClearAmount}>
            <Text variant="caption">{I18n.t('home.converter.clear')}</Text>
          </Button>
        </View>

        {/* Amount display */}
        <View className="min-h-[56px]">
          <View className="min-w-0 flex-row items-end overflow-hidden">
            <Text style={currencyTextStyle} className="shrink-0 text-foreground">
              {currencySymbol}
            </Text>
            <View className="ml-1 min-w-0 flex-1 overflow-hidden">
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

        {/* Hours result */}
        <View className="mt-3 mb-3 rounded-[18px] border border-primary/20 bg-primary/8 px-4 py-3">
          {hasRate ? (
            <>
              <Animated.View
                key={hoursLabel}
                entering={FadeInDown.duration(180)}
                exiting={FadeOutUp.duration(120)}
              >
                <Text variant="subheading" className="text-primary">
                  {I18n.t('home.converter.of_work', { value: hoursLabel })}
                </Text>
              </Animated.View>
              <Animated.View
                key={exactHoursLabel}
                entering={FadeInDown.duration(180)}
                exiting={FadeOutUp.duration(120)}
              >
                <Text variant="label" tone="muted" className="mt-1">
                  {I18n.t('home.converter.workday_equivalent', {
                    exact: exactHoursLabel,
                    duration: workDurationLabel,
                  })}
                </Text>
              </Animated.View>
            </>
          ) : (
            <>
              <Text variant="caption" tone="muted">
                {I18n.t('home.converter.no_rate_title')}
              </Text>
              <Text variant="label" tone="muted" className="mt-1">
                {I18n.t('home.converter.no_rate_subtitle')}
              </Text>
            </>
          )}
        </View>

        {/* Numpad — flush to card edges */}
        <View className="-mx-5 -mb-4" style={numPadContainerStyle}>
          {NUM_ROWS.map((row, rowIndex) => (
            <View key={rowIndex} style={NUMPAD_ROW_STYLE}>
              {row.map((key) => {
                if (key === 'backspace') {
                  return (
                    <NumKey
                      key="backspace"
                      onPress={keyPressHandlers.backspace}
                      onLongPress={handleClearAmount}
                    >
                      <Delete size={18} color={themeColors.text} />
                    </NumKey>
                  );
                }
                if (key === '.') {
                  return (
                    <NumKey key="." label="." dimmed={hasDot} onPress={keyPressHandlers['.']} />
                  );
                }
                return <NumKey key={key} label={key} onPress={keyPressHandlers[key]} />;
              })}
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}
