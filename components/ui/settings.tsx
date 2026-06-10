import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, View, type ViewProps } from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { type Edge, SafeAreaView } from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { useBottomNavContentInset } from '~/components/navigation/bottomNavInset';
import { LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { type HapticKind, triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

import { Button } from './button';
import { Text } from './text';

export const SETTINGS_HORIZONTAL_PADDING = spacing.screenHorizontal;
export const SETTINGS_FORM_BOTTOM_PADDING = spacing.formBottom;
export const SETTINGS_LIST_BOTTOM_PADDING = LIST_BOTTOM_PADDING;

/**
 * Style-array override that extends a scrollable's bottom padding past the
 * floating liquid-glass nav bar so content scrolls under it. Returns undefined
 * (no override) in fallback mode and on screens pushed outside the tab shell.
 * Append after the static content style: `[styles.scrollContent, navInset]`.
 */
export function useSettingsBottomNavInset(basePadding: number = SETTINGS_FORM_BOTTOM_PADDING) {
  const inset = useBottomNavContentInset();
  return React.useMemo(
    () => (inset > 0 ? { paddingBottom: basePadding + inset } : undefined),
    [basePadding, inset],
  );
}

interface SettingsPageLayoutProps extends ViewProps {
  children: React.ReactNode;
  swipeBackGesture?: GestureType;
  actionBar?: React.ReactNode;
  edges?: Edge[];
}

export function SettingsPageLayout({
  children,
  swipeBackGesture,
  actionBar,
  edges = ['top'],
  className,
  ...props
}: SettingsPageLayoutProps) {
  const content = (
    <SafeAreaView className="flex-1 bg-background" edges={edges}>
      <TabletContentContainer style={{ flex: 1 }}>
        <View className={cn('flex-1', className)} {...props}>
          {children}
          {actionBar}
        </View>
      </TabletContentContainer>
    </SafeAreaView>
  );

  if (swipeBackGesture) {
    return <GestureDetector gesture={swipeBackGesture}>{content}</GestureDetector>;
  }
  return content;
}

function HeaderIconButton({
  onPress,
  icon,
  label,
}: {
  onPress: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void triggerHaptic('selection');
        onPress();
      }}
      className="h-10 w-10 items-center justify-center rounded-full border border-border/30 bg-card shadow-soft"
    >
      {icon}
    </Pressable>
  );
}

interface SettingsHeaderProps {
  title: string;
  subtitle?: string;
  subtitleNode?: React.ReactNode;
  onBack?: () => void;
  onClose?: () => void;
  closeRowAccessory?: React.ReactNode;
  rightAccessory?: React.ReactNode;
  className?: string;
  reserveActionRow?: boolean;
}

export function SettingsHeader({
  title,
  subtitle,
  subtitleNode,
  onBack,
  onClose,
  closeRowAccessory,
  rightAccessory,
  className,
  reserveActionRow = false,
}: SettingsHeaderProps) {
  const themeColors = useThemeColors();
  const showActionRow = reserveActionRow || !!onBack || !!onClose;

  return (
    <View className={cn('px-5 pt-3 pb-2', className)}>
      {showActionRow ? (
        <View className="mb-3 flex-row items-center justify-between">
          <View className="h-10 w-10 justify-center">
            {onBack ? (
              <HeaderIconButton
                onPress={onBack}
                icon={<ChevronLeft size={20} color={themeColors.textMuted} />}
                label={I18n.t('common.back')}
              />
            ) : null}
          </View>
          <View className="flex-row items-center gap-2">
            {closeRowAccessory}
            {onClose ? (
              <HeaderIconButton
                onPress={onClose}
                icon={<X size={18} color={themeColors.textMuted} />}
                label={I18n.t('common.close')}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      <View className="flex-row items-center justify-between gap-3" style={{ minHeight: 40 }}>
        <View className="min-h-10 flex-1 justify-center">
          <Text variant="heading" className="tracking-tight">
            {title}
          </Text>
        </View>
        {rightAccessory ? <View className="h-10 justify-center">{rightAccessory}</View> : null}
      </View>

      {subtitleNode ? (
        <View className="mt-1">{subtitleNode}</View>
      ) : subtitle ? (
        <Text variant="caption" tone="muted" className="mt-1">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

interface SettingsSectionProps extends ViewProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  danger?: boolean;
  showAccent?: boolean;
}

export function SettingsSection({
  children,
  title,
  subtitle,
  icon,
  danger = false,
  showAccent = true,
  className,
  ...props
}: SettingsSectionProps) {
  const themeColors = useThemeColors();
  const hasHeader = !!title || !!subtitle || !!icon;

  return (
    <View className={cn('mt-7 gap-3', className)} {...props}>
      {hasHeader ? (
        <View className="flex-row items-center gap-3 px-1">
          {icon ? (
            <View
              className={cn(
                'h-9 w-9 items-center justify-center rounded-2xl',
                danger ? 'bg-destructive/10' : 'bg-primary/10',
              )}
            >
              {icon}
            </View>
          ) : null}
          <View className="flex-1">
            {title ? (
              <View className="flex-row items-center gap-2">
                {showAccent ? (
                  <View
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor: danger ? themeColors.error : themeColors.primary,
                      opacity: 0.6,
                    }}
                  />
                ) : null}
                <Text
                  variant="label"
                  className={cn(
                    'text-[12px] tracking-widest',
                    danger ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {title}
                </Text>
              </View>
            ) : null}
            {subtitle ? (
              <Text variant="friendly" tone="muted" className="mt-0.5">
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
      {children}
    </View>
  );
}

interface SettingsActionBarProps {
  onCancel: () => void;
  onSave: () => void;
  cancelLabel?: string;
  saveLabel?: string;
  saveDisabled?: boolean;
  cancelDisabled?: boolean;
  saveVariant?: React.ComponentProps<typeof Button>['variant'];
  className?: string;
}

export function SettingsActionBar({
  onCancel,
  onSave,
  cancelLabel = I18n.t('common.cancel'),
  saveLabel = I18n.t('common.save'),
  saveDisabled = false,
  cancelDisabled = false,
  saveVariant = 'default',
  className,
}: SettingsActionBarProps) {
  return (
    <SafeAreaView
      edges={['bottom']}
      className={cn('border-t border-border/25 bg-background', className)}
    >
      <View className="px-5 pb-3 pt-3">
        <View className="flex-row items-center gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onPress={onCancel}
            disabled={cancelDisabled}
          >
            <Text>{cancelLabel}</Text>
          </Button>
          <Button variant={saveVariant} className="flex-1" onPress={onSave} disabled={saveDisabled}>
            <Text>{saveLabel}</Text>
          </Button>
        </View>
      </View>
    </SafeAreaView>
  );
}

interface SettingsRowItemProps {
  label: string;
  subtitle?: string;
  onPress: () => void;
  haptic?: HapticKind;
  icon?: React.ReactNode;
  emoji?: string;
  className?: string;
  rightAccessory?: React.ReactNode;
  showChevron?: boolean;
}

export function SettingsRowItem({
  label,
  subtitle,
  onPress,
  haptic = 'selection',
  icon,
  emoji,
  className,
  rightAccessory,
  showChevron = true,
}: SettingsRowItemProps) {
  const themeColors = useThemeColors();
  const leading = icon ?? (emoji ? <Text style={{ fontSize: 18 }}>{emoji}</Text> : null);

  return (
    <Pressable
      onPress={() => {
        void triggerHaptic(haptic);
        onPress();
      }}
      className={cn(
        'flex-row items-center gap-4 rounded-[24px] border border-border/30 bg-card px-4 py-4 shadow-soft active:scale-[0.98] active:opacity-90',
        className,
      )}
    >
      {leading ? (
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-primary/8 border border-primary/10">
          {leading}
        </View>
      ) : null}
      <View className="flex-1">
        <Text variant="bodyStrong" className="text-foreground">
          {label}
        </Text>
        {subtitle ? (
          <Text variant="caption" tone="muted" className="mt-0.5">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightAccessory ??
        (showChevron ? (
          <View className="h-7 w-7 items-center justify-center rounded-full bg-secondary/50">
            <ChevronRight size={14} color={themeColors.textMuted} />
          </View>
        ) : null)}
    </Pressable>
  );
}
