import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { ThemeModal } from '~/components/ui/theme-modal';
import { I18n } from '~/lib/i18n';

interface ReceiptPreviewModalProps {
  visible: boolean;
  /** Resolved absolute file URI of the receipt image, or null. */
  fileUri: string | null;
  onClose: () => void;
}

const styles = StyleSheet.create({
  viewerImage: {
    flex: 1,
    width: '100%',
  },
});

/**
 * Read-only full-screen receipt preview for the Receipts page. A transparent
 * modal with an opaque black backdrop and a single close button — no editing
 * controls (unlike the editor's `ReceiptViewerModal`, which can replace/remove).
 */
export function ReceiptPreviewModal({ visible, fileUri, onClose }: ReceiptPreviewModalProps) {
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
          {/* Spacer to keep the title centered opposite the close button. */}
          <View className="h-10 w-10" />
        </View>
        <View className="flex-1">
          {fileUri ? (
            <Image source={{ uri: fileUri }} style={styles.viewerImage} contentFit="contain" />
          ) : null}
        </View>
      </View>
    </ThemeModal>
  );
}
