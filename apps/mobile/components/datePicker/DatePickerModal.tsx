import { X } from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

import { InlineDatePicker } from './InlineDatePicker';

interface DatePickerModalProps {
  visible: boolean;
  value: string;
  title?: string;
  showQuickDays?: boolean;
  /** Render as an absolute-fill View instead of a native Modal (for use inside another modal). */
  overlay?: boolean;
  onSelect: (date: string) => void;
  onClose: () => void;
}

const CARD_MIN_HEIGHT = 480;
const CARD_MAX_HEIGHT = 580;
const CARD_HEIGHT_RATIO = 0.78;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  absoluteFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
  },
});

export function DatePickerModal({
  visible,
  value,
  title,
  showQuickDays = true,
  overlay = false,
  onSelect,
  onClose,
}: DatePickerModalProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();
  const { height: screenHeight } = useWindowDimensions();
  const cardHeight = Math.min(
    CARD_MAX_HEIGHT,
    Math.max(CARD_MIN_HEIGHT, screenHeight * CARD_HEIGHT_RATIO),
  );

  // Mount the inline picker only while the modal is open so it always starts
  // fresh from the current `value`'s month, instead of carrying stale
  // baseAnchor / scroll / swipe state from a previous session. Gating on
  // `visible` (rather than remounting a render later via a token bump) avoids
  // the double-mount that briefly showed the previous month before jumping to
  // the correct one — the source of the quick-row "flash" on open.
  const body = (
    <Pressable style={styles.backdrop} onPress={onClose}>
      <Pressable
        onPress={(event) => event.stopPropagation()}
        style={[styles.card, { height: cardHeight, paddingBottom: Math.max(insets.bottom, 16) }]}
        className="bg-card"
      >
        <View className="px-5 pt-5 pb-2 flex-row items-center justify-between">
          <Text variant="subheading">{title ?? I18n.t('transactions.editor.date')}</Text>
          <Pressable
            onPress={onClose}
            accessibilityLabel={I18n.t('common.close')}
            className="w-8 h-8 rounded-full items-center justify-center bg-secondary/60"
          >
            <X size={14} color={themeColors.textSoft} />
          </Pressable>
        </View>
        {visible ? (
          <InlineDatePicker value={value} onSelect={onSelect} showQuickDays={showQuickDays} />
        ) : null}
      </Pressable>
    </Pressable>
  );

  if (overlay) {
    if (!visible) return null;
    return <View style={styles.absoluteFill}>{body}</View>;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {body}
    </Modal>
  );
}
