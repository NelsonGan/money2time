import { Check, ChevronDown } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Animated as RNAnimated,
  PanResponder,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';

import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

import { Text } from './text';
import { ThemeModal } from './theme-modal';

const SHEET_HEIGHT = 460;
const SLIDE_CONFIG = { duration: 220, useNativeDriver: true } as const;

interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode | string;
}

interface SelectFieldProps {
  label?: string;
  sheetTitle?: string;
  required?: boolean;
  compact?: boolean;
  value: string | null;
  options: SelectOption[];
  optionsLayout?: 'grid' | 'list';
  showSelectedDescription?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  helperText?: string;
  error?: string;
  fullHeight?: boolean;
}

export function SelectField({
  label,
  sheetTitle,
  required = false,
  compact = false,
  value,
  options,
  optionsLayout = 'grid',
  showSelectedDescription = false,
  placeholder = I18n.t('ui.select.placeholder'),
  onChange,
  helperText,
  error,
  fullHeight = false,
}: SelectFieldProps) {
  const themeColors = useThemeColors();
  const [open, setOpen] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(SHEET_HEIGHT);
  const [translateY] = useState(() => new RNAnimated.Value(SHEET_HEIGHT));
  const hiddenOffset = Math.max(sheetHeight + 24, windowHeight + 40);
  const selected = options.find((opt) => opt.value === value);
  const selectedLabel = selected ? selected.label : placeholder;
  const renderOptionIcon = (icon?: SelectOption['icon']) => {
    if (!icon) return null;
    if (typeof icon === 'string') return <Text variant="friendly">{icon}</Text>;
    return icon;
  };
  const closeSheet = () => {
    void triggerHaptic('selection');
    setOpen(false);
  };

  useEffect(() => {
    if (open) {
      RNAnimated.timing(translateY, { toValue: 0, ...SLIDE_CONFIG }).start();
      return;
    }
    RNAnimated.timing(translateY, { toValue: hiddenOffset, ...SLIDE_CONFIG }).start();
  }, [hiddenOffset, open, translateY]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          open && gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          open && gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, gesture) => {
          translateY.setValue(Math.max(0, gesture.dy));
        },
        onPanResponderRelease: (_, gesture) => {
          const shouldClose = gesture.dy > 90 || gesture.vy > 1.2;
          if (shouldClose) {
            RNAnimated.timing(translateY, { toValue: hiddenOffset, ...SLIDE_CONFIG }).start(
              ({ finished }) => {
                if (finished) setOpen(false);
              },
            );
            return;
          }
          RNAnimated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        },
        onPanResponderTerminate: () => {
          RNAnimated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        },
      }),
    [hiddenOffset, open, translateY],
  );

  return (
    <View className="w-full">
      {label && !compact ? (
        <View className="mb-2.5 px-1 flex-row items-center">
          <Text variant="caption" tone="muted">
            {label}
          </Text>
          {required ? (
            <Text variant="caption" tone="error">
              {' '}
              *
            </Text>
          ) : null}
        </View>
      ) : null}
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          setOpen(true);
        }}
        className={cn(
          compact
            ? 'h-[68px] rounded-2xl border bg-card/95 px-3.5 flex-row items-center justify-between'
            : 'h-[54px] rounded-3xl border bg-card/95 px-4 flex-row items-center justify-between',
          error ? 'border-destructive/55 bg-destructive/5' : 'border-border/40',
        )}
      >
        {compact ? (
          <View className="flex-1 pr-2">
            {label ? (
              <View className="flex-row items-center">
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
            <View className="mt-0.5 flex-row items-center gap-2">
              {selected?.icon
                ? typeof selected.icon === 'string'
                  ? renderOptionIcon(selected.icon)
                  : selected.icon
                : null}
              <Text
                numberOfLines={1}
                className={cn('flex-1', selected ? 'text-foreground' : 'text-muted-foreground')}
              >
                {selectedLabel}
              </Text>
            </View>
            {showSelectedDescription && selected?.description ? (
              <Text variant="label" tone="muted" numberOfLines={1} className="mt-0.5">
                {selected.description}
              </Text>
            ) : null}
          </View>
        ) : (
          <View className="flex-1 pr-2">
            <View className="flex-row items-center gap-2">
              {selected?.icon
                ? typeof selected.icon === 'string'
                  ? renderOptionIcon(selected.icon)
                  : selected.icon
                : null}
              <Text
                numberOfLines={1}
                className={cn('flex-1', selected ? 'text-foreground' : 'text-muted-foreground')}
              >
                {selectedLabel}
              </Text>
            </View>
            {showSelectedDescription && selected?.description ? (
              <Text variant="label" tone="muted" numberOfLines={1} className="mt-0.5">
                {selected.description}
              </Text>
            ) : null}
          </View>
        )}
        <ChevronDown size={16} color={themeColors.textMuted} />
      </Pressable>
      {error ? (
        <Text variant="caption" tone="error" className="mt-2 px-1">
          {error}
        </Text>
      ) : helperText ? (
        <Text variant="caption" tone="muted" className="mt-2 px-1">
          {helperText}
        </Text>
      ) : null}

      <ThemeModal
        visible={open}
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        onRequestClose={closeSheet}
      >
        <View className="flex-1 justify-end" pointerEvents="box-none">
          <Pressable className="absolute inset-0 bg-black/20" onPress={closeSheet} />
          <RNAnimated.View
            {...panResponder.panHandlers}
            className="rounded-t-[28px] border-t border-border/40 bg-background px-5 pt-3 pb-7"
            style={{
              transform: [{ translateY }],
              maxHeight: fullHeight
                ? windowHeight * 0.92
                : Math.max(320, Math.min(windowHeight * 0.74, 620)),
            }}
            onLayout={(event) => {
              const next = event.nativeEvent.layout.height;
              if (next > 0 && next !== sheetHeight) setSheetHeight(next);
            }}
          >
            <View className="items-center pb-3">
              <View className="h-1.5 w-11 rounded-full bg-border/70" />
            </View>
            <View className="pb-3 flex-row items-center justify-between">
              <Text variant="subheading">
                {sheetTitle ?? label ?? I18n.t('ui.select.placeholder')}
              </Text>
              <Pressable onPress={closeSheet} className="px-3 py-2 rounded-full bg-secondary">
                <Text variant="caption" tone="muted">
                  {I18n.t('common.done')}
                </Text>
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 26 }}
            >
              <View
                className={cn(optionsLayout === 'list' ? 'gap-1.5' : 'flex-row flex-wrap gap-2')}
              >
                {options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => {
                        void triggerHaptic('selection');
                        onChange(option.value);
                        setOpen(false);
                      }}
                      className={cn(
                        optionsLayout === 'list'
                          ? 'w-full min-h-[52px] rounded-2xl border px-3 py-2.5 flex-row items-start gap-3'
                          : 'w-[48%] min-h-[64px] rounded-2xl border px-3.5 py-3 flex-row items-center justify-between',
                        isSelected ? 'border-primary/50 bg-primary/10' : 'border-border/40 bg-card',
                      )}
                    >
                      {optionsLayout === 'list' ? (
                        <>
                          {option.icon ? (
                            typeof option.icon === 'string' ? (
                              <View
                                className={cn(
                                  'h-8 w-8 rounded-lg items-center justify-center border',
                                  isSelected
                                    ? 'bg-primary/15 border-primary/35'
                                    : 'bg-secondary/45 border-border/35',
                                )}
                              >
                                {renderOptionIcon(option.icon)}
                              </View>
                            ) : (
                              option.icon
                            )
                          ) : null}
                          <View className="flex-1">
                            <Text variant="caption" className="pr-2">
                              {option.label}
                            </Text>
                            {option.description ? (
                              <Text variant="label" tone="muted" className="mt-0.5 pr-2">
                                {option.description}
                              </Text>
                            ) : null}
                          </View>
                          {isSelected ? (
                            <View className="pt-0.5">
                              <Check size={16} color={themeColors.primary} />
                            </View>
                          ) : null}
                        </>
                      ) : (
                        <>
                          <View className="flex-1 flex-row items-center gap-2 pr-2">
                            {option.icon
                              ? typeof option.icon === 'string'
                                ? renderOptionIcon(option.icon)
                                : option.icon
                              : null}
                            <Text numberOfLines={2} className="flex-1">
                              {option.label}
                            </Text>
                          </View>
                          {isSelected ? <Check size={16} color={themeColors.primary} /> : null}
                        </>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </RNAnimated.View>
        </View>
      </ThemeModal>
    </View>
  );
}
