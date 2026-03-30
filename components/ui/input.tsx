import * as React from 'react';
import type { TextInputProps } from 'react-native';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useThemeColors } from '~/hooks/useThemeColors';
import { cn } from '~/utils';
import { FONT } from '~/utils/fonts';

import { Text } from './text';

interface InputProps extends TextInputProps {
  label?: string;
  required?: boolean;
  error?: string;
  helperText?: string;
  variant?: 'standard' | 'numeric' | 'currency' | 'multiline';
  currencySymbol?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerClassName?: string;
}

const TIMING_CONFIG = { duration: 150 };

const Input = React.forwardRef<TextInput, InputProps>(
  (
    {
      containerClassName,
      label,
      required = false,
      error,
      helperText,
      variant = 'standard',
      currencySymbol = '$',
      leftIcon,
      rightIcon,
      editable = true,
      keyboardType,
      multiline,
      numberOfLines,
      style,
      ...props
    },
    ref,
  ) => {
    const themeColors = useThemeColors();
    const isMultiline = variant === 'multiline' || !!multiline;
    const resolvedKeyboardType =
      keyboardType ??
      (variant === 'numeric' ? 'decimal-pad' : variant === 'currency' ? 'decimal-pad' : 'default');
    const hasError = !!error;

    const isFocused = useSharedValue(0);

    const shellAnimatedStyle = useAnimatedStyle(() => {
      const t = isFocused.value;
      return {
        borderColor: hasError
          ? `${themeColors.error}66`
          : t === 1
            ? `${themeColors.primary}66`
            : `${themeColors.border}4D`,
        backgroundColor: hasError
          ? `${themeColors.error}0A`
          : t === 1
            ? `${themeColors.primary}0A`
            : themeColors.card,
        shadowOpacity: !hasError && t === 1 ? 0.15 : 0,
      };
    });

    return (
      <View className={cn('w-full', containerClassName)}>
        {label ? (
          <View className="mb-2.5 px-1 flex-row items-center">
            <Text variant="label" tone="muted">
              {label}
            </Text>
            {required ? (
              <Text variant="label" tone="error">
                {' '}
                *
              </Text>
            ) : null}
          </View>
        ) : null}
        <Animated.View
          style={[
            styles.shell,
            isMultiline ? styles.shellMultiline : styles.shellSingleLine,
            styles.shellShadow,
            { opacity: editable ? 1 : 0.5 },
            shellAnimatedStyle,
          ]}
        >
          <View style={isMultiline ? styles.innerRowMultiline : styles.innerRow}>
            {variant === 'currency' ? (
              <Text variant="bodyStrong" className="mr-2 text-muted-foreground mt-[1px]">
                {currencySymbol}
              </Text>
            ) : null}
            {leftIcon ? <View className="mr-2 mt-[1px]">{leftIcon}</View> : null}
            <TextInput
              ref={ref}
              editable={editable}
              keyboardType={resolvedKeyboardType}
              multiline={isMultiline}
              numberOfLines={isMultiline ? (numberOfLines ?? 4) : undefined}
              textAlignVertical={isMultiline ? 'top' : 'center'}
              style={[
                styles.textInput,
                { color: themeColors.text },
                isMultiline ? styles.textInputMultiline : styles.singleLineInput,
                style,
              ]}
              placeholderTextColor={themeColors.textMuted}
              onFocus={(e) => {
                isFocused.value = withTiming(1, TIMING_CONFIG);
                props.onFocus?.(e);
              }}
              onBlur={(e) => {
                isFocused.value = withTiming(0, TIMING_CONFIG);
                props.onBlur?.(e);
              }}
              {...props}
              allowFontScaling={false}
              maxFontSizeMultiplier={1}
            />
            {rightIcon ? <View className="ml-2 mt-[1px]">{rightIcon}</View> : null}
          </View>
        </Animated.View>

        {hasError ? (
          <Text variant="caption" tone="error" className="mt-2 px-1">
            {error}
          </Text>
        ) : helperText ? (
          <Text variant="caption" tone="muted" className="mt-2 px-1">
            {helperText}
          </Text>
        ) : null}
      </View>
    );
  },
);

Input.displayName = 'Input';

const styles = StyleSheet.create({
  shell: {
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  shellSingleLine: {
    height: 54,
  },
  shellMultiline: {
    minHeight: 112,
    paddingVertical: 12,
  },
  shellShadow: {
    shadowColor: 'rgba(31,138,111,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    shadowOpacity: 0,
    elevation: 0,
  },
  innerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: '100%',
  },
  innerRowMultiline: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    minHeight: 96,
  },
  textInput: {
    flex: 1,
    fontFamily: FONT.medium,
    ...Platform.select({
      ios: {
        fontWeight: '500',
      },
    }),
    fontSize: 16,
    includeFontPadding: false,
    paddingTop: 0,
    paddingBottom: 0,
    paddingVertical: 0,
    textAlignVertical: 'center',
  },
  textInputMultiline: {
    minHeight: 96,
    paddingTop: 2,
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  singleLineInput: {
    height: '100%',
  },
});

export { Input };
