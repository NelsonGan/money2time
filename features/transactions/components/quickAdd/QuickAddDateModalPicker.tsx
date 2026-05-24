import { X } from 'lucide-react-native';
import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { useThemeColors } from '~/hooks/useThemeColors';
import { I18n } from '~/lib/i18n';

import { QuickAddInlineDatePicker } from './QuickAddInlineDatePicker';

interface QuickAddDateModalPickerProps {
  visible: boolean;
  value: string;
  onSelect: (date: string) => void;
  onClose: () => void;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    height: '60%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
});

export function QuickAddDateModalPicker({
  visible,
  value,
  onSelect,
  onClose,
}: QuickAddDateModalPickerProps) {
  const insets = useSafeAreaInsets();
  const themeColors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[styles.card, { paddingBottom: Math.max(insets.bottom, 16) }]}
          className="bg-card"
        >
          <View className="px-5 pt-5 pb-2 flex-row items-center justify-between">
            <Text variant="subheading">{I18n.t('transactions.editor.date')}</Text>
            <Pressable
              onPress={onClose}
              accessibilityLabel={I18n.t('common.close')}
              className="w-8 h-8 rounded-full items-center justify-center bg-secondary/60"
            >
              <X size={14} color={themeColors.textSoft} />
            </Pressable>
          </View>
          <QuickAddInlineDatePicker value={value} onSelect={onSelect} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}
