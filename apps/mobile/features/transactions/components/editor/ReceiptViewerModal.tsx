import { Image } from 'expo-image';
import { Crop, Download, ImageOff, Trash2, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '~/components/ui';
import { ThemeModal } from '~/components/ui/theme-modal';
import { I18n } from '~/lib/i18n';
import { triggerHaptic } from '~/services/haptics';
import { saveReceiptToPhotoLibrary } from '~/services/receiptLibrary';

import { ReceiptCropEditor } from './ReceiptCropEditor';

interface ReceiptViewerModalProps {
  visible: boolean;
  /** Resolved absolute file URI of the receipt image, or null. */
  fileUri: string | null;
  onClose: () => void;
  /** Replace the attachment (opens the picker). */
  onReplace: () => void;
  /** Persist a cropped temporary file as the new attachment. */
  onCrop: (croppedFileUri: string) => void | Promise<void>;
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
  onCrop,
  onRemove,
}: ReceiptViewerModalProps) {
  const insets = useSafeAreaInsets();
  // Fall back to the synchronously-available window metrics so the controls
  // never tuck under the notch if the in-modal context insets read 0.
  const topInset = Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0, 12);
  const bottomInset = Math.max(insets.bottom, initialWindowMetrics?.insets.bottom ?? 0);
  // Skip a uri that failed to load natively; see CategoryEmoji for why.
  const [brokenUri, setBrokenUri] = useState<string | null>(null);
  const effectiveFileUri = fileUri !== brokenUri ? fileUri : null;
  const [isCropping, setIsCropping] = useState(false);
  const [cropSaving, setCropSaving] = useState(false);
  const [receiptSaving, setReceiptSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setIsCropping(false);
      setCropSaving(false);
      setReceiptSaving(false);
    }
  }, [visible]);

  const handleSaveReceipt = async () => {
    if (!effectiveFileUri || receiptSaving) return;

    void triggerHaptic('selection');
    setReceiptSaving(true);
    try {
      const result = await saveReceiptToPhotoLibrary(effectiveFileUri);
      if (result === 'saved') {
        void triggerHaptic('success');
        Alert.alert(I18n.t('transactions.editor.receipt.save_success'));
      } else {
        void triggerHaptic('warning');
        Alert.alert(I18n.t('transactions.editor.receipt.save_failed'));
      }
    } catch {
      void triggerHaptic('warning');
      Alert.alert(I18n.t('transactions.editor.receipt.save_failed'));
    } finally {
      setReceiptSaving(false);
    }
  };

  const closeOrCancelCrop = () => {
    if (receiptSaving) return;
    if (isCropping) {
      if (cropSaving) return;
      setIsCropping(false);
      setCropSaving(false);
      return;
    }
    onClose();
  };

  return (
    <ThemeModal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={closeOrCancelCrop}
    >
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
            onPress={closeOrCancelCrop}
            disabled={cropSaving || receiptSaving}
            accessibilityRole="button"
            accessibilityLabel={I18n.t('common.close')}
            accessibilityState={{ disabled: cropSaving || receiptSaving }}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
          >
            <X size={18} color="#FFFFFF" />
          </Pressable>
          <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
            {I18n.t(
              isCropping
                ? 'transactions.editor.receipt.crop_title'
                : 'transactions.editor.receipt.label',
            )}
          </Text>
          {isCropping ? (
            <View className="h-10 w-10" />
          ) : (
            <Pressable
              onPress={onRemove}
              disabled={receiptSaving}
              accessibilityRole="button"
              accessibilityLabel={I18n.t('transactions.editor.receipt.remove')}
              accessibilityState={{ disabled: receiptSaving }}
              hitSlop={8}
              className="h-10 w-10 items-center justify-center rounded-full bg-white/10"
            >
              <Trash2 size={18} color="#FF6B6B" />
            </Pressable>
          )}
        </View>
        {isCropping && effectiveFileUri ? (
          <ReceiptCropEditor
            fileUri={effectiveFileUri}
            onCancel={() => {
              setIsCropping(false);
              setCropSaving(false);
            }}
            onSavingChange={setCropSaving}
            onSave={async (croppedFileUri) => {
              await onCrop(croppedFileUri);
              setIsCropping(false);
              setCropSaving(false);
            }}
          />
        ) : (
          <>
            <View className="flex-1 items-center justify-center">
              {effectiveFileUri ? (
                <Image
                  source={{ uri: effectiveFileUri }}
                  style={styles.viewerImage}
                  contentFit="contain"
                  onError={() => setBrokenUri(effectiveFileUri)}
                />
              ) : (
                // The file is missing on disk — show a placeholder rather than a
                // blank screen so Replace/Remove are still discoverable.
                <ImageOff size={48} color="rgba(255,255,255,0.5)" />
              )}
            </View>
            <View className="flex-row gap-3 px-5 py-4">
              {effectiveFileUri && Platform.OS !== 'web' ? (
                <Pressable
                  onPress={() => void handleSaveReceipt()}
                  disabled={receiptSaving}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('transactions.editor.receipt.save_to_photos')}
                  accessibilityState={{ disabled: receiptSaving }}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-white/15 py-3.5 disabled:opacity-50"
                >
                  {receiptSaving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Download size={16} color="#FFFFFF" />
                  )}
                  <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
                    {I18n.t('common.save')}
                  </Text>
                </Pressable>
              ) : null}
              {effectiveFileUri && Platform.OS !== 'web' ? (
                <Pressable
                  onPress={() => {
                    void triggerHaptic('selection');
                    setIsCropping(true);
                  }}
                  disabled={receiptSaving}
                  accessibilityRole="button"
                  accessibilityLabel={I18n.t('transactions.editor.receipt.crop')}
                  accessibilityState={{ disabled: receiptSaving }}
                  className="flex-1 flex-row items-center justify-center gap-2 rounded-2xl bg-white/15 py-3.5"
                >
                  <Crop size={16} color="#FFFFFF" />
                  <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
                    {I18n.t('transactions.editor.receipt.crop')}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={onReplace}
                disabled={receiptSaving}
                accessibilityRole="button"
                accessibilityLabel={I18n.t('transactions.editor.receipt.replace')}
                accessibilityState={{ disabled: receiptSaving }}
                className="flex-1 items-center rounded-2xl bg-white/15 py-3.5"
              >
                <Text variant="bodyStrong" style={{ color: '#FFFFFF' }}>
                  {I18n.t('transactions.editor.receipt.replace')}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </ThemeModal>
  );
}
