import * as React from 'react';
import type { TextInputProps } from 'react-native';
import { StyleSheet, TextInput, View } from 'react-native';

import { useThemeColors } from '~/hooks/useThemeColors';
import { cn } from '~/utils';

import { Text } from './text';
import { SINGLE_LINE_TEXT_INPUT_STYLE } from './textInputStyles';

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

const Input = React.forwardRef<TextInput, InputProps>(
  (
    {
      className,
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
    const [focused, setFocused] = React.useState(false);
    const isMountedRef = React.useRef(false);
    const themeColors = useThemeColors();
    const isMultiline = variant === 'multiline' || !!multiline;
    const resolvedKeyboardType =
      keyboardType ??
      (variant === 'numeric' ? 'decimal-pad' : variant === 'currency' ? 'decimal-pad' : 'default');
    const hasError = !!error;
    const hasLeading = !!leftIcon || variant === 'currency';

    React.useEffect(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }, []);

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
        <View
          className={cn(
            'rounded-[22px] border bg-card px-4',
            isMultiline ? 'min-h-[112px] py-3' : 'h-[54px] py-0',
            hasError
              ? 'border-destructive/40 bg-destructive/4'
              : focused
                ? 'border-primary/40 bg-primary/4 shadow-glow'
                : 'border-border/30',
            !editable && 'opacity-50',
          )}
        >
          <View
            className={cn(
              'flex-row items-center',
              isMultiline ? 'min-h-[96px] items-start' : 'h-full',
            )}
          >
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
              className={cn(
                'flex-1 text-[16px] text-foreground font-medium',
                hasLeading && 'pl-0',
                isMultiline ? 'min-h-[96px] pt-0.5 leading-6' : '',
                className,
              )}
              style={
                isMultiline ? style : [SINGLE_LINE_TEXT_INPUT_STYLE, styles.singleLineInput, style]
              }
              placeholderTextColor={themeColors.textMuted}
              onFocus={(e) => {
                if (isMountedRef.current) {
                  setFocused(true);
                }
                props.onFocus?.(e);
              }}
              onBlur={(e) => {
                if (isMountedRef.current) {
                  setFocused(false);
                }
                props.onBlur?.(e);
              }}
              {...props}
            />
            {rightIcon ? <View className="ml-2 mt-[1px]">{rightIcon}</View> : null}
          </View>
        </View>

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
  singleLineInput: {
    height: '100%',
  },
});

export { Input };
