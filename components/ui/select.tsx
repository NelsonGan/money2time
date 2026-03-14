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
const SHEET_HORIZONTAL_PADDING = 20;

interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode | string;
}

interface SelectOptionGroup {
  id: string;
  label: string;
  description?: string;
  optionValues: string[];
  defaultExpanded?: boolean;
}

interface SelectFieldProps {
  label?: string;
  sheetTitle?: string;
  required?: boolean;
  compact?: boolean;
  triggerSize?: 'default' | 'header';
  triggerVariant?: 'default' | 'header-plain';
  value: string | null;
  options: SelectOption[];
  optionGroups?: SelectOptionGroup[];
  optionsLayout?: 'grid' | 'list' | 'icon-grid';
  showSelectedDescription?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
  helperText?: string;
  error?: string;
  fullHeight?: boolean;
  listItemAlignment?: 'start' | 'center';
}

export function SelectField({
  label,
  sheetTitle,
  required = false,
  compact = false,
  triggerSize = 'default',
  triggerVariant = 'default',
  value,
  options,
  optionGroups,
  optionsLayout = 'grid',
  showSelectedDescription = false,
  placeholder = I18n.t('ui.select.placeholder'),
  onChange,
  helperText,
  error,
  fullHeight = false,
  listItemAlignment = 'start',
}: SelectFieldProps) {
  const themeColors = useThemeColors();
  const [open, setOpen] = useState(false);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [sheetHeight, setSheetHeight] = useState(SHEET_HEIGHT);
  const [translateY] = useState(() => new RNAnimated.Value(SHEET_HEIGHT));
  const hiddenOffset = Math.max(sheetHeight + 24, windowHeight + 40);
  const selected = options.find((opt) => opt.value === value);
  const selectedLabel = selected ? selected.label : placeholder;
  const optionsByValue = useMemo(() => {
    const map = new Map<string, SelectOption>();
    options.forEach((option) => map.set(option.value, option));
    return map;
  }, [options]);
  const groupedOptions = useMemo(() => {
    if (!optionGroups?.length) return [];
    return optionGroups
      .map((group) => {
        const resolvedOptions = group.optionValues
          .map((optionValue) => optionsByValue.get(optionValue))
          .filter((option): option is SelectOption => !!option);
        if (!resolvedOptions.length) return null;
        return { ...group, options: resolvedOptions };
      })
      .filter((group): group is SelectOptionGroup & { options: SelectOption[] } => !!group);
  }, [optionGroups, optionsByValue]);
  const ungroupedOptions = useMemo(() => {
    if (!groupedOptions.length) return options;
    const groupedOptionValues = new Set(
      groupedOptions.flatMap((group) => group.options.map((option) => option.value)),
    );
    return options.filter((option) => !groupedOptionValues.has(option.value));
  }, [groupedOptions, options]);
  const hasGroupedListLayout = optionsLayout === 'list' && groupedOptions.length > 0;
  const hasGroupedIconGridLayout = optionsLayout === 'icon-grid' && groupedOptions.length > 0;
  const iconGridGap = 8;
  const iconGridColumns = 4;
  const iconGridCardWidth = Math.floor(
    (windowWidth - SHEET_HORIZONTAL_PADDING * 2 - iconGridGap * (iconGridColumns - 1)) /
      iconGridColumns,
  );
  const isHeaderPlainTrigger = triggerVariant === 'header-plain';
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
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

  useEffect(() => {
    if (!groupedOptions.length) {
      setExpandedGroups((current) => (Object.keys(current).length ? {} : current));
      return;
    }
    setExpandedGroups((current) => {
      let changed = Object.keys(current).length !== groupedOptions.length;
      const next: Record<string, boolean> = {};

      groupedOptions.forEach((group) => {
        const hasSelectedOption = group.options.some((option) => option.value === value);
        const existing = current[group.id];
        if (typeof existing === 'boolean') {
          const nextExpanded = hasSelectedOption ? true : existing;
          next[group.id] = nextExpanded;
          if (nextExpanded !== existing) changed = true;
          return;
        }
        next[group.id] = hasSelectedOption || group.defaultExpanded !== false;
        changed = true;
      });

      return changed ? next : current;
    });
  }, [groupedOptions, value]);

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
  const renderOption = (option: SelectOption) => {
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
            ? cn(
                'w-full min-h-[52px] rounded-2xl border px-3 py-2.5 flex-row gap-3',
                listItemAlignment === 'center' ? 'items-center' : 'items-start',
              )
            : optionsLayout === 'icon-grid'
              ? 'rounded-[18px] border bg-card px-2 py-2 items-center justify-center'
              : 'w-[48%] min-h-[64px] rounded-2xl border px-3.5 py-3 flex-row items-center justify-between',
          isSelected ? 'border-primary/50 bg-primary/10' : 'border-border/40 bg-card',
        )}
        style={
          optionsLayout === 'icon-grid' ? { width: iconGridCardWidth, aspectRatio: 1 } : undefined
        }
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
                <Text variant="caption" tone="muted" className="mt-0.5 pr-2">
                  {option.description}
                </Text>
              ) : null}
            </View>
            {isSelected ? (
              <View className={cn(listItemAlignment === 'center' ? '' : 'pt-0.5')}>
                <Check size={16} color={themeColors.primary} />
              </View>
            ) : null}
          </>
        ) : optionsLayout === 'icon-grid' ? (
          <>
            {isSelected ? (
              <View className="absolute right-2 top-2 h-5 w-5 items-center justify-center rounded-full bg-primary">
                <Check size={12} color="#FFFFFF" />
              </View>
            ) : null}
            <View className="flex-1 items-center justify-center gap-2 px-1">
              <View className="min-h-[30px] items-center justify-center">
                {option.icon
                  ? typeof option.icon === 'string'
                    ? renderOptionIcon(option.icon)
                    : option.icon
                  : null}
              </View>
              <Text
                variant="caption"
                className={cn(
                  'text-center text-[11px] leading-[14px]',
                  isSelected ? 'text-foreground' : 'text-muted-foreground',
                )}
                numberOfLines={2}
              >
                {option.label}
              </Text>
            </View>
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
  };

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
            : isHeaderPlainTrigger
              ? 'min-h-10 flex-row items-center justify-between gap-2'
              : triggerSize === 'header'
                ? 'h-10 rounded-[22px] border bg-card/95 px-3.5 flex-row items-center justify-between'
                : 'h-[54px] rounded-3xl border bg-card/95 px-4 flex-row items-center justify-between',
          !isHeaderPlainTrigger &&
            (error ? 'border-destructive/55 bg-destructive/5' : 'border-border/40'),
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
              <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
                {selected.description}
              </Text>
            ) : null}
          </View>
        ) : isHeaderPlainTrigger ? (
          <View className="flex-1 flex-row items-center gap-2 pr-2">
            <Text
              variant="heading"
              numberOfLines={1}
              className={cn(
                'flex-1 tracking-tight',
                selected ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {selectedLabel}
            </Text>
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
              <Text variant="caption" tone="muted" numberOfLines={1} className="mt-0.5">
                {selected.description}
              </Text>
            ) : null}
          </View>
        )}
        {isHeaderPlainTrigger ? (
          <View
            className="h-10 w-10 items-center justify-center rounded-full border border-border/40 bg-card"
            style={{ marginRight: -2 }}
          >
            <ChevronDown size={15} color={themeColors.textMuted} />
          </View>
        ) : (
          <ChevronDown size={16} color={themeColors.textMuted} />
        )}
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
              {hasGroupedListLayout ? (
                <View className="gap-2">
                  {groupedOptions.map((group) => {
                    const isExpanded = expandedGroups[group.id] ?? group.defaultExpanded !== false;
                    const hasSelectedOption = group.options.some(
                      (option) => option.value === value,
                    );
                    return (
                      <View
                        key={group.id}
                        className="overflow-hidden rounded-2xl border border-border/35 bg-card/80"
                      >
                        <Pressable
                          onPress={() => {
                            void triggerHaptic('selection');
                            setExpandedGroups((current) => ({
                              ...current,
                              [group.id]: !(current[group.id] ?? group.defaultExpanded !== false),
                            }));
                          }}
                          className="flex-row items-center gap-3 px-3.5 py-3"
                        >
                          <View className="flex-1">
                            <Text variant="caption" tone={hasSelectedOption ? 'default' : 'muted'}>
                              {group.label}
                            </Text>
                            {group.description ? (
                              <Text variant="caption" tone="muted" className="mt-0.5">
                                {group.description}
                              </Text>
                            ) : null}
                          </View>
                          <ChevronDown
                            size={16}
                            color={themeColors.textMuted}
                            style={{ transform: [{ rotate: isExpanded ? '0deg' : '-90deg' }] }}
                          />
                        </Pressable>
                        {isExpanded ? (
                          <View className="gap-1.5 border-t border-border/20 px-2.5 pb-2.5 pt-2">
                            {group.options.map((option) => renderOption(option))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                  {ungroupedOptions.length ? (
                    <View className="gap-1.5">
                      {ungroupedOptions.map((option) => renderOption(option))}
                    </View>
                  ) : null}
                </View>
              ) : hasGroupedIconGridLayout ? (
                <View className="gap-5">
                  {groupedOptions.map((group) => (
                    <View key={group.id} className="gap-2.5">
                      <View className="px-1">
                        <Text variant="label" tone="muted">
                          {group.label}
                        </Text>
                      </View>
                      <View className="flex-row flex-wrap gap-2">
                        {group.options.map((option) => renderOption(option))}
                      </View>
                    </View>
                  ))}
                  {ungroupedOptions.length ? (
                    <View className="gap-2.5">
                      <View className="px-1">
                        <Text variant="label" tone="muted">
                          {I18n.t('common.other')}
                        </Text>
                      </View>
                      <View className="flex-row flex-wrap gap-2">
                        {ungroupedOptions.map((option) => renderOption(option))}
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : (
                <View
                  className={cn(optionsLayout === 'list' ? 'gap-1.5' : 'flex-row flex-wrap gap-2')}
                >
                  {options.map((option) => renderOption(option))}
                </View>
              )}
            </ScrollView>
          </RNAnimated.View>
        </View>
      </ThemeModal>
    </View>
  );
}
