import { Delete } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Button, Text } from '~/components/ui';
import { usePressScale } from '~/hooks/usePressScale';
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

function formatHeroAmount(value: string, currencySymbol: string) {
  const trimmed = value.trim();
  if (!trimmed) return `${currencySymbol}0`;

  const hasDot = trimmed.includes('.');
  const [rawInteger, rawFraction = ''] = trimmed.split('.');
  const integer = rawInteger.length > 0 ? String(Number(rawInteger)) : '0';
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!hasDot) return `${currencySymbol}${grouped}`;
  return `${currencySymbol}${grouped}.${rawFraction}`;
}

// Individual numpad key with press-scale animation
function NumKey({
  label,
  onPress,
  children,
  dimmed,
}: {
  label?: string;
  children?: React.ReactNode;
  onPress: () => void;
  dimmed?: boolean;
}) {
  const { animatedStyle, handlePressIn, handlePressOut } = usePressScale({ depth: 0.88 });

  return (
    <Animated.View style={[animatedStyle, { flex: 1 }]}>
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        className="h-12 items-center justify-center rounded-2xl bg-secondary/50 mx-0.5 active:bg-secondary"
      >
        {children ?? (
          <Text
            variant="bodyStrong"
            style={{ opacity: dimmed ? 0.4 : 1 }}
            className="text-foreground"
          >
            {label}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const NUM_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', 'backspace'],
] as const;

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

  const amountLabel = useMemo(
    () => formatHeroAmount(amount, currencySymbol),
    [amount, currencySymbol],
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

  const cardStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.08 + inputProgress.value * 0.14,
    shadowRadius: 8 + inputProgress.value * 10,
  }));

  const handleKey = useCallback(
    (key: string) => {
      void triggerHaptic('selection');

      if (key === 'backspace') {
        const next = amount.slice(0, -1);
        onChangeAmount(next);
        return;
      }

      if (key === '.') {
        if (amount.includes('.')) return;
        const next = amount === '' ? '0.' : amount + '.';
        onChangeAmount(next);
        if (inputProgress.value === 0) inputProgress.value = withSpring(1, { damping: 18, stiffness: 180 });
        return;
      }

      // Digit key
      const dotIdx = amount.indexOf('.');
      if (dotIdx !== -1 && amount.length - dotIdx > 2) return; // max 2 decimal places

      const next = amount === '0' ? key : amount + key;
      onChangeAmount(next);
      if (inputProgress.value === 0) inputProgress.value = withSpring(1, { damping: 18, stiffness: 180 });
    },
    [amount, onChangeAmount, inputProgress],
  );

  const hasDot = amount.includes('.');

  return (
    <Animated.View style={cardStyle} className="mx-5 mt-4">
      <View className="relative overflow-hidden rounded-[28px] border border-border/35 px-5 pt-5 pb-4 bg-card">
        <View className="absolute -top-10 -right-8 h-28 w-28 rounded-full bg-primary/12" />
        <View className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-success/10" />

        {/* Header */}
        <Text variant="bodyStrong">{I18n.t('home.converter.title')}</Text>
        <Text variant="label" tone="muted" className="mt-0.5 mb-3">
          {I18n.t('home.converter.description')}
        </Text>

        {/* Amount display */}
        <View className="min-h-[56px] flex-row items-center justify-between">
          <Animated.View
            key={amountLabel}
            entering={FadeInDown.duration(120)}
            exiting={FadeOutUp.duration(90)}
          >
            <Text
              style={{ fontSize: 44, lineHeight: 50, fontWeight: '800' }}
              className="text-foreground"
            >
              {amountLabel}
            </Text>
          </Animated.View>
          <Button
            size="sm"
            variant="outline"
            bouncy={false}
            onPress={() => onChangeAmount('')}
          >
            <Text variant="caption">{I18n.t('home.converter.clear')}</Text>
          </Button>
        </View>

        {/* Hours result */}
        <View className="mt-3 mb-4 rounded-[18px] border border-primary/20 bg-primary/8 px-4 py-3">
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

        {/* Numpad */}
        <View className="gap-1.5">
          {NUM_ROWS.map((row, rowIndex) => (
            <View key={rowIndex} className="flex-row gap-1.5">
              {row.map((key) => {
                if (key === 'backspace') {
                  return (
                    <NumKey key="backspace" onPress={() => handleKey('backspace')}>
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
                      onPress={() => handleKey('.')}
                    />
                  );
                }
                return (
                  <NumKey key={key} label={key} onPress={() => handleKey(key)} />
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </Animated.View>
  );
}
