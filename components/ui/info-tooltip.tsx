import { Info, X } from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, View } from 'react-native';

import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';

import { Text } from './text';

interface InfoTooltipButtonProps {
  /** Heading shown at the top of the popover (usually the field/section title). */
  title: string;
  /** Explanatory copy revealed when the info button is pressed. */
  infoTooltip: string;
  iconSize?: number;
  /** Override the icon color; defaults to the muted theme color. */
  iconColor?: string;
}

/**
 * A small "ⓘ" button that reveals a dismissible popover with an explanation.
 * Used next to a title/label instead of always-visible helper text, so the
 * detail is available on demand without cluttering the form.
 */
export function InfoTooltipButton({
  title,
  infoTooltip,
  iconSize = 16,
  iconColor,
}: InfoTooltipButtonProps) {
  const themeColors = useThemeColors();
  const [visible, setVisible] = React.useState(false);

  return (
    <>
      <Pressable
        onPress={() => {
          void triggerHaptic('selection');
          setVisible(true);
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={infoTooltip}
      >
        <Info size={iconSize} color={iconColor ?? themeColors.textMuted} />
      </Pressable>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        {/* Backdrop dismisses; the card swallows its own taps so only the
            explicit close control (or the backdrop) dismisses the popover. */}
        <Pressable
          className="flex-1 items-center justify-center bg-black/40 px-8"
          onPress={() => setVisible(false)}
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
                onPress={() => setVisible(false)}
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
    </>
  );
}
