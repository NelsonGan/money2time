import React, { useMemo, useRef, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { Button, Text } from '~/components/ui';
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

function normalizeInput(raw: string) {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  const integer = cleaned.slice(0, firstDot);
  const fractional = cleaned
    .slice(firstDot + 1)
    .replace(/\./g, '')
    .slice(0, 2);
  const normalizedInteger = integer.length === 0 ? '0' : integer;
  return `${normalizedInteger}.${fractional}`;
}

function formatHeroAmount(value: string, currencySymbol: string) {
  const trimmed = value.trim();
  if (!trimmed) return `${currencySymbol}0.00`;

  const hasDot = trimmed.includes('.');
  const [rawInteger, rawFraction = ''] = trimmed.split('.');
  const integer = rawInteger.length > 0 ? String(Number(rawInteger)) : '0';
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  if (!hasDot) return `${currencySymbol}${grouped}`;
  return `${currencySymbol}${grouped}.${rawFraction}`;
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
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const focusProgress = useSharedValue(0);

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

  const focusStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + focusProgress.value * 0.01 }],
    shadowOpacity: 0.12 + focusProgress.value * 0.14,
    shadowRadius: 10 + focusProgress.value * 8,
  }));

  const setFocused = (nextFocused: boolean) => {
    setIsFocused(nextFocused);
    focusProgress.value = withSpring(nextFocused ? 1 : 0, { damping: 18, stiffness: 180 });
  };

  return (
    <Animated.View style={focusStyle} className="mx-5 mt-4">
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          inputRef.current?.focus();
        }}
        className={cn(
          'relative overflow-hidden rounded-[28px] border px-5 py-6 bg-card',
          isFocused ? 'border-primary/55' : 'border-border/35',
        )}
      >
        <View className="absolute -top-10 -right-8 h-28 w-28 rounded-full bg-primary/12" />
        <View className="absolute -bottom-10 -left-6 h-24 w-24 rounded-full bg-success/10" />

        <Text variant="label" tone="muted">
          {I18n.t('home.converter.title')}
        </Text>
        <View className="mt-3 min-h-[72px] justify-center">
          <Animated.View
            key={amountLabel}
            entering={FadeInDown.duration(170)}
            exiting={FadeOutUp.duration(130)}
          >
            <Text
              style={{ fontSize: 48, lineHeight: 54, fontWeight: '800' }}
              className="text-foreground"
            >
              {amountLabel}
            </Text>
          </Animated.View>
        </View>

        <View className="mt-3 rounded-[18px] border border-primary/20 bg-primary/8 px-4 py-3">
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

        <View className="mt-4 flex-row items-center justify-between">
          <Text variant="label" tone="muted">
            {isFocused ? I18n.t('home.converter.typing') : I18n.t('home.converter.tap_to_edit')}
          </Text>
          <Button
            size="sm"
            variant="outline"
            onPress={(event) => {
              event.stopPropagation();
              void triggerHaptic('light');
              onChangeAmount('');
              inputRef.current?.focus();
            }}
          >
            <Text variant="caption">{I18n.t('home.converter.clear')}</Text>
          </Button>
        </View>

        <TextInput
          ref={inputRef}
          value={amount}
          onChangeText={(text) => {
            const normalized = normalizeInput(text);
            if (normalized !== amount) {
              void triggerHaptic('selection');
            }
            onChangeAmount(normalized);
          }}
          keyboardType="decimal-pad"
          returnKeyType="done"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
          accessibilityLabel={I18n.t('home.converter.amount_input_a11y')}
        />
      </Pressable>
    </Animated.View>
  );
}
