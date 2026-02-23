import React from 'react';
import { Pressable, View, type GestureResponderHandlers, type ViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';

import { Button } from '~/components/ui/button';
import { Text } from '~/components/ui/text';
import { spacing } from '~/constants/designSystem';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { I18n } from '~/lib/i18n';
import { cn } from '~/utils';

export const SETTINGS_HORIZONTAL_PADDING = spacing.screenHorizontal;
export const SETTINGS_FORM_BOTTOM_PADDING = spacing.formBottom;
export const SETTINGS_LIST_BOTTOM_PADDING = spacing.listBottom;

interface SettingsPageLayoutProps extends ViewProps {
  children: React.ReactNode;
  swipeBackHandlers?: GestureResponderHandlers;
  actionBar?: React.ReactNode;
  edges?: Edge[];
}

export function SettingsPageLayout({
  children,
  swipeBackHandlers,
  actionBar,
  edges = ['top'],
  className,
  ...props
}: SettingsPageLayoutProps) {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={edges}>
      <View {...swipeBackHandlers} className={cn('flex-1', className)} {...props}>
        {children}
        {actionBar}
      </View>
    </SafeAreaView>
  );
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
      className="h-10 w-10 items-center justify-center rounded-full border border-border/35 bg-card"
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
  rightAccessory?: React.ReactNode;
  className?: string;
}

export function SettingsHeader({
  title,
  subtitle,
  subtitleNode,
  onBack,
  onClose,
  rightAccessory,
  className,
}: SettingsHeaderProps) {
  const themeColors = useThemeColors();
  const showActionRow = !!onBack || !!onClose;

  return (
    <View className={cn('px-5 pt-5 pb-3', className)}>
      {showActionRow ? (
        <View className="mb-3 flex-row items-center justify-between">
          <View className="h-10 w-10 justify-center">
            {onBack ? (
              <HeaderIconButton
                onPress={onBack}
                icon={<ChevronLeft size={18} color={themeColors.textMuted} />}
                label={I18n.t('common.back')}
              />
            ) : null}
          </View>
          <View className="h-10 w-10 items-end justify-center">
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

      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text variant="heading">{title}</Text>
          {subtitleNode ? (
            <View className="mt-1">{subtitleNode}</View>
          ) : subtitle ? (
            <Text variant="friendly" tone="muted" className="mt-1">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {rightAccessory}
      </View>
    </View>
  );
}

interface SettingsSectionProps extends ViewProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  danger?: boolean;
}

export function SettingsSection({
  children,
  title,
  subtitle,
  icon,
  danger = false,
  className,
  ...props
}: SettingsSectionProps) {
  const hasHeader = !!title || !!subtitle || !!icon;

  return (
    <View className={cn('mt-6 gap-2.5', className)} {...props}>
      {hasHeader ? (
        <View className="flex-row items-center gap-2.5 px-1">
          {icon ? (
            <View
              className={cn(
                'h-8 w-8 items-center justify-center rounded-full border bg-card shadow-soft',
                danger ? 'border-destructive/25' : 'border-border/40',
              )}
            >
              {icon}
            </View>
          ) : null}
          <View className="flex-1">
            {title ? (
              <Text variant="subheading" className={danger ? 'text-destructive' : undefined}>
                {title}
              </Text>
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
      className={cn('border-t border-border/35 bg-background', className)}
    >
      <View className="px-5 pb-3 pt-3">
        <View className="flex-row items-center gap-2.5">
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
        void triggerHaptic('selection');
        onPress();
      }}
      className={cn(
        'flex-row items-center gap-3.5 rounded-[22px] border border-border/40 bg-card px-4 py-4 shadow-soft',
        className,
      )}
    >
      {leading ? (
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/8">
          {leading}
        </View>
      ) : null}
      <View className="flex-1">
        <Text variant="caption" className="text-foreground">
          {label}
        </Text>
        {subtitle ? (
          <Text variant="label" tone="muted" className="mt-0.5">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {rightAccessory ??
        (showChevron ? <ChevronRight size={16} color={themeColors.textMuted} /> : null)}
    </Pressable>
  );
}
