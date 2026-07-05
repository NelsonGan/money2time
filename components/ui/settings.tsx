import { ChevronLeft, Info, X } from 'lucide-react-native';
import React from 'react';
import {
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  StatusBar,
  View,
  type ViewProps,
} from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';
import {
  type Edge,
  initialWindowMetrics,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { TabletContentContainer } from '~/components/layout/TabletContentContainer';
import { useBottomNavContentInset } from '~/components/navigation/BottomNavMinimize';
import { LIST_BOTTOM_PADDING, spacing } from '~/constants/designSystem';
import { useResolvedTheme } from '~/context/ThemeContext';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { type HapticKind, triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';
import { darkenColor, withColorAlpha } from '~/utils/color';
import { FONT } from '~/utils/fonts';

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
  const insets = useSafeAreaInsets();
  // Native-stack screens can report 0 insets on their first frame, which makes
  // the header flash flush against the top before snapping down. Fall back to
  // the metrics captured at module init so the inset is correct immediately.
  const edgeInset = (edge: Edge, live: number) =>
    edges.includes(edge)
      ? Math.max(
          live,
          initialWindowMetrics?.insets[edge] ?? 0,
          edge === 'top' && Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
        )
      : 0;
  const insetStyle = {
    paddingTop: edgeInset('top', insets.top),
    paddingBottom: edgeInset('bottom', insets.bottom),
    paddingLeft: edgeInset('left', insets.left),
    paddingRight: edgeInset('right', insets.right),
  };
  const content = (
    <View className="flex-1 bg-background" style={insetStyle}>
      <TabletContentContainer style={{ flex: 1 }}>
        <View className={cn('flex-1', className)} {...props}>
          {children}
          {actionBar}
        </View>
      </TabletContentContainer>
    </View>
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
  /** Optional description revealed in a popover when the info button beside the title is pressed. */
  infoTooltip?: string;
  onBack?: () => void;
  onClose?: () => void;
  closeRowAccessory?: React.ReactNode;
  rightAccessory?: React.ReactNode;
  className?: string;
}

export function SettingsHeader({
  title,
  infoTooltip,
  onBack,
  onClose,
  closeRowAccessory,
  rightAccessory,
  className,
}: SettingsHeaderProps) {
  const themeColors = useThemeColors();
  const [tooltipVisible, setTooltipVisible] = React.useState(false);

  return (
    <View className={cn('px-5 pt-3 pb-2', className)}>
      {/* Back button (left), centered title, and actions (right) all share one
          row. The left/right slots are equal-width (flex-1) so the title stays
          visually centered regardless of what each side holds. */}
      <View className="flex-row items-center gap-2" style={{ minHeight: 40 }}>
        <View className="flex-1 flex-row items-center justify-start">
          {onBack ? (
            <HeaderIconButton
              onPress={onBack}
              icon={<ChevronLeft size={20} color={themeColors.textMuted} />}
              label={I18n.t('common.back')}
            />
          ) : null}
        </View>

        <View className="flex-row items-center justify-center gap-1.5" style={{ flexShrink: 1 }}>
          <Text variant="subheading" numberOfLines={1} className="tracking-tight text-center">
            {title}
          </Text>
          {infoTooltip ? (
            <Pressable
              onPress={() => {
                void triggerHaptic('selection');
                setTooltipVisible(true);
              }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={infoTooltip}
            >
              <Info size={16} color={themeColors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <View className="flex-1 flex-row items-center justify-end gap-2">
          {rightAccessory}
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

      {infoTooltip ? (
        <Modal
          visible={tooltipVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setTooltipVisible(false)}
        >
          {/* Backdrop dismisses; the card swallows its own taps so only the
              explicit close control (or the backdrop) dismisses the modal. */}
          <Pressable
            className="flex-1 items-center justify-center bg-black/40 px-8"
            onPress={() => setTooltipVisible(false)}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.close')}
          >
            <Pressable
              className="w-full max-w-[340px] rounded-3xl border border-border/40 bg-background p-5 shadow-soft"
              onPress={() => {}}
            >
              <View className="mb-2 flex-row items-center justify-between gap-3">
                <Text variant="subheading" numberOfLines={1} className="flex-1">
                  {title}
                </Text>
                <Pressable
                  onPress={() => setTooltipVisible(false)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('common.close')}
                  className="h-8 w-8 items-center justify-center rounded-full bg-secondary/60"
                >
                  <X size={16} color={themeColors.textMuted} />
                </Pressable>
              </View>
              <Text variant="friendly" tone="muted">
                {infoTooltip}
              </Text>
            </Pressable>
          </Pressable>
        </Modal>
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

interface SettingsGridProps {
  children: React.ReactNode;
  columns?: number;
  gap?: number;
}

/**
 * Lays out compact tiles in an evenly sized N-column grid. Measures its own
 * width once so tiles share an exact pixel width regardless of label length.
 */
export function SettingsGrid({ children, columns = 3, gap = spacing.sm }: SettingsGridProps) {
  const [width, setWidth] = React.useState(0);
  const handleLayout = React.useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  // Floor the per-tile width so N tiles + gaps never exceed the measured
  // container width. Android rounds fractional layout widths up, which pushed
  // the total past the row and wrapped the last tile to a new line (3 cols
  // collapsing to 2). Flooring keeps the row intact on every platform.
  const tileWidth = width > 0 ? Math.floor((width - gap * (columns - 1)) / columns) : 0;
  const items = React.Children.toArray(children);

  return (
    <View onLayout={handleLayout} style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
      {tileWidth > 0
        ? items.map((child, index) => (
            // Bottom-anchor so a tile that shrinks on press drops from the top.
            <View key={index} style={{ width: tileWidth, justifyContent: 'flex-end' }}>
              {child}
            </View>
          ))
        : null}
    </View>
  );
}

interface SettingsGridTileProps {
  label: string;
  onPress: () => void;
  haptic?: HapticKind;
  icon?: React.ReactNode;
  emoji?: string;
  badge?: React.ReactNode;
  tone?: 'default' | 'danger';
  /** Renders a diagonal "PRO" corner ribbon, matching the widget previews. */
  pro?: boolean;
}

/** Diagonal "PRO" corner ribbon, clipped to the tile's rounded corner. */
function ProCornerRibbon() {
  const themeColors = useThemeColors();
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        borderRadius: 22,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          position: 'absolute',
          top: 12,
          right: -22,
          width: 84,
          alignItems: 'center',
          paddingVertical: 2,
          backgroundColor: themeColors.accent,
          transform: [{ rotate: '45deg' }],
        }}
      >
        <Text
          allowFontScaling={false}
          style={{
            fontSize: 9,
            lineHeight: 12,
            color: '#fff',
            fontFamily: FONT.bold,
            letterSpacing: 1,
          }}
        >
          PRO
        </Text>
      </View>
    </View>
  );
}

/**
 * Compact square button used in the settings grid. Sits on a chunky "fat-button"
 * ledge (a darker bottom border) that compresses on press for a tactile feel.
 */
export function SettingsGridTile({
  label,
  onPress,
  haptic = 'selection',
  icon,
  emoji,
  badge,
  tone = 'default',
  pro = false,
}: SettingsGridTileProps) {
  const themeColors = useThemeColors();
  const isDark = useResolvedTheme() === 'dark';
  const [pressed, setPressed] = React.useState(false);
  const leading = icon ?? (emoji ? <Text style={{ fontSize: 20 }}>{emoji}</Text> : null);
  const danger = tone === 'danger';
  // Light mode: a soft translucent tint of the theme primary so the ledge
  // matches the active theme without the warm/olive cast of the raw border.
  // Dark mode keeps the darkened theme border.
  const edgeColor = danger
    ? darkenColor(themeColors.error, 0.18)
    : isDark
      ? darkenColor(themeColors.border, 0.22)
      : withColorAlpha(themeColors.primary, 0.32);

  // Fat-button "press-through": on press the ledge collapses and the tile gets
  // shorter from the top (it is bottom-anchored in the grid), so the face drops
  // onto the base. Content area stays constant across states so nothing jumps.
  const LEDGE = 5;

  return (
    <Pressable
      onPress={() => {
        void triggerHaptic(haptic);
        onPress();
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      // Press is driven by state below — a render-prop style function is not
      // forwarded here, so all styling must be a static style object.
      className="items-center justify-center"
      style={{
        // Fixed height so one- and two-line labels produce equal-size tiles;
        // shrinks by the ledge delta on press to look pressed down from the top.
        height: pressed ? 116 - (LEDGE - 1) : 116,
        width: '100%',
        paddingHorizontal: 6,
        paddingVertical: 12,
        borderRadius: 22,
        backgroundColor: themeColors.card,
        borderWidth: 1,
        borderColor: edgeColor,
        // Chunky ledge that collapses on press.
        borderBottomWidth: pressed ? 1 : LEDGE,
        borderBottomColor: edgeColor,
        // Lift off the very low-contrast warm background with a neutral soft
        // drop shadow (a colored shadow reads as a glow). The theme-matched
        // ledge supplies the color; the shadow just adds depth.
        shadowColor: isDark ? '#05070D' : '#1F2530',
        shadowOpacity: pressed ? 0.05 : isDark ? 0.32 : 0.1,
        shadowRadius: pressed ? 2 : 5,
        shadowOffset: { width: 0, height: pressed ? 1 : 2 },
        elevation: pressed ? 1 : 3,
      }}
    >
      {leading ? (
        <View
          className={cn(
            'h-11 w-11 items-center justify-center rounded-2xl border',
            danger ? 'border-destructive/15 bg-destructive/10' : 'border-primary/10 bg-primary/10',
          )}
        >
          {leading}
          {badge ? <View className="absolute -right-1.5 -top-1.5">{badge}</View> : null}
        </View>
      ) : null}
      <Text
        variant="caption"
        numberOfLines={2}
        className={cn(
          'mt-2 text-center leading-[15px]',
          danger ? 'text-destructive' : 'text-foreground',
        )}
      >
        {label}
      </Text>
      {pro ? <ProCornerRibbon /> : null}
    </Pressable>
  );
}

interface SettingsStatTileProps {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

/** Single metric tile for the profile stats strip. */
export function SettingsStatTile({ value, label, icon }: SettingsStatTileProps) {
  return (
    <View className="flex-1 items-center">
      {icon ? <View className="mb-1.5">{icon}</View> : null}
      <Text variant="heading" className="text-[20px] tracking-tight">
        {value}
      </Text>
      <Text
        variant="caption"
        tone="muted"
        numberOfLines={1}
        className="mt-0.5 text-center text-[11px]"
      >
        {label}
      </Text>
    </View>
  );
}
