import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { Pressable, Switch, View } from 'react-native';

import { InfoTooltipButton } from '~/components/ui/info-tooltip';
import { Text } from '~/components/ui/text';
import { useThemeColors } from '~/hooks/useThemeColors';
import { triggerHaptic } from '~/services/haptics';
import { cn } from '~/utils';

/**
 * The options panel of the transaction editor is one grouped card of these
 * rows, all the same height: a tinted icon tile, the label (with an ⓘ when it
 * needs explaining), then either a value and a chevron (opens something) or a
 * switch (turns something on).
 */
export function OptionsCard({ children }: { children: React.ReactNode }) {
  return (
    <View className="overflow-hidden rounded-2xl border border-border/30 bg-secondary/30">
      {children}
    </View>
  );
}

interface OptionRowBaseProps {
  /** What goes in the tile: a lucide icon at 16, an emoji, an avatar. */
  icon: React.ReactNode;
  label: string;
  info?: { title: string; tooltip: string };
  /** A hairline above the row (every row but the card's first). */
  divider?: boolean;
  /** Shown but not changeable (a reimbursement already settled). */
  disabled?: boolean;
}

interface OptionLinkRowProps extends OptionRowBaseProps {
  /** Right side, before the chevron: the current value, muted. */
  value?: React.ReactNode;
  onPress: () => void;
  accessibilityLabel?: string;
  accessibilityValue?: string;
}

interface OptionSwitchRowProps extends OptionRowBaseProps {
  switchValue: boolean;
  onToggle: () => void;
}

type OptionRowProps = OptionLinkRowProps | OptionSwitchRowProps;

export function OptionRow(props: OptionRowProps) {
  const themeColors = useThemeColors();
  const { icon, label, info, divider, disabled } = props;
  const isSwitch = 'onToggle' in props;
  const handlePress = () => {
    if (disabled) return;
    // A switch's handler gives its own feedback (and may stop at a Pro gate).
    if (isSwitch) {
      props.onToggle();
      return;
    }
    void triggerHaptic('selection');
    props.onPress();
  };

  return (
    <View>
      {divider ? <View className="ml-14 h-[1px] bg-border/30" /> : null}
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole={isSwitch ? 'switch' : 'button'}
        accessibilityState={
          isSwitch ? { checked: props.switchValue, disabled } : disabled ? { disabled } : undefined
        }
        accessibilityLabel={isSwitch ? label : (props.accessibilityLabel ?? label)}
        accessibilityValue={
          !isSwitch && props.accessibilityValue ? { text: props.accessibilityValue } : undefined
        }
        className={cn(
          'min-h-[48px] flex-row items-center gap-3 px-3 py-2 active:bg-secondary/60',
          disabled ? 'opacity-60' : null,
        )}
      >
        <View className="h-8 w-8 items-center justify-center rounded-xl bg-primary/10">{icon}</View>
        <View className="shrink flex-row items-center gap-1.5">
          <Text variant="body" numberOfLines={1} className="shrink">
            {label}
          </Text>
          {/* Its own Pressable inside the row: tapping ⓘ explains, it does not
              toggle or open. */}
          {info ? <InfoTooltipButton title={info.title} infoTooltip={info.tooltip} /> : null}
        </View>
        <View className="flex-1" />
        {isSwitch ? (
          <Switch
            value={props.switchValue}
            onValueChange={handlePress}
            disabled={disabled}
            trackColor={{ false: `${themeColors.mutedForeground}40`, true: themeColors.primary }}
            ios_backgroundColor={`${themeColors.mutedForeground}40`}
            thumbColor="#FFFFFF"
            importantForAccessibility="no"
            accessibilityElementsHidden
          />
        ) : (
          <>
            {props.value ? (
              <View className="max-w-[55%] shrink flex-row items-center gap-1.5">
                {props.value}
              </View>
            ) : null}
            <ChevronRight size={16} color={themeColors.textMuted} />
          </>
        )}
      </Pressable>
    </View>
  );
}
