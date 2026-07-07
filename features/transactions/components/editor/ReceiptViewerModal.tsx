import { Image } from 'expo-image';
import { Trash2, X } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { ThemeModal } from '~/components/ui/theme-modal';
import { I18n } from '~/lib/i18n';

interface ReceiptViewerModalProps {
  visible: boolean;
  /** Resolved absolute file URI of the receipt image, or null. */
  fileUri: string | null;
  onClose: () => void;
  /** Replace the attachment (opens the picker). */
  onReplace: () => void;
  /** Remove the attachment. */
  onRemove: () => void;
}

const styles = StyleSheet.create({
  viewerImage: {
    flex: 1,
    width: '100%',
  },
});

/**
 * Full-screen receipt preview. A transparent modal with an opaque black backdrop
 * (an opaque `transparent={false}` modal over the editor's own transparentModal
 * corrupts its safe area on dismiss). Opened from the editor's action-row receipt
 * button once an image is attached.
 */
export function ReceiptViewerModal({
  visible,
  fileUri,
  onClose,
  onReplace,
  onRemove,
}: ReceiptViewerModalProps) {
  const insets = useSafeAreaInsets();
  // Fall back to the synchronously-available window metrics so the controls
  // never tuck under the notch if the in-modal context insets read 0.
  const topInset = Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0, 12);
  const bottomInset = Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0);

  return (
    <ThemeModal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: '#000',
          paddingTop: topInset,
          paddingBottom: bottomInset,
        }}
      >
        <View className="flex-row items-center justify-between px-5 py-3">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.close')}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
          >
            <X size={18} color="#FFFFFF" />
          </Pressable>
          <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
            {I18n.t('transactions.editor.receipt.label')}
          </Text>
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('transactions.editor.receipt.remove')}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
          >
            <Trash2 size={18} color="#FF6B6B" />
          </Pressable>
        </View>
        <View className="flex-1">
          {fileUri ? (
            <Image source={{ uri: fileUri }} style={styles.viewerImage} contentFit="contain" />
          ) : null}
        </View>
        <View className="px-5 py-4">
          <Pressable
            onPress={onReplace}
            accessibilityRole="button"
            className="items-center rounded-2xl bg-white/15 py-3.5"
          >
            <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
              {I18n.t('transactions.editor.receipt.replace')}
            </Text>
          </Pressable>
        </View>
      </View>
    </ThemeModal>
  );
}
